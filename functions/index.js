/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// const { onDocumentCreated } = require("firebase-functions/v2/firestore"); // Currently unused
const { setGlobalOptions } = require("firebase-functions/v2/options");
const admin = require("firebase-admin");
const { Resend } = require("resend");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

// Secure Stripe secrets (managed via Firebase Secret Manager)
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

// Configure CORS for Firebase v2 functions to allow custom domain
setGlobalOptions({ 
  maxInstances: 10
});

// Stripe will be initialized inside functions when needed

// GoCardless payment creation function
exports.createGoCardlessPayment = onCall(async (request) => {
  console.log('createGoCardlessPayment called with:', request.data);
  const { amount, currency, customerId, description, reference } = request.data;
  const caller = request.auth;
  
  console.log('Customer ID received:', customerId);
  
  if (!caller) {
    throw new HttpsError('unauthenticated', 'You must be logged in to create payments.');
  }
  
  if (!amount || !currency || !customerId || !description || !reference) {
    throw new HttpsError('invalid-argument', 'Missing required payment parameters.');
  }
  
  // Validate customer ID format
  if (!customerId || typeof customerId !== 'string') {
    throw new HttpsError('invalid-argument', 'Invalid customer ID: must be a non-empty string');
  }
  
  const customerIdPattern = /^CU[A-Z0-9]+$/i;
  if (!customerIdPattern.test(customerId)) {
    throw new HttpsError('invalid-argument', `Invalid GoCardless customer ID format: ${customerId}. Customer IDs should be in the format CU followed by alphanumeric characters.`);
  }
  
  try {
    // Get the user's GoCardless API token
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(caller.uid).get();
    
    if (!userDoc.exists) {
      throw new HttpsError('not-found', 'User not found.');
    }
    
    const userData = userDoc.data();
    const apiToken = userData.gocardlessApiToken;
    
    if (!apiToken) {
      throw new HttpsError('failed-precondition', 'GoCardless API token not configured.');
    }
    
    // Determine if this is a sandbox or live token
    const baseUrl = apiToken.startsWith('live_') 
      ? 'https://api.gocardless.com'
      : 'https://api-sandbox.gocardless.com';
    
    // First, get the mandate ID for the customer
    console.log('Making mandate lookup request for customer:', customerId);
    console.log('API URL:', `${baseUrl}/mandates?customer=${customerId}`);
    const mandateResponse = await fetch(`${baseUrl}/mandates?customer=${customerId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'GoCardless-Version': '2015-07-06'
      }
    });
    
    console.log('Mandate response status:', mandateResponse.status, mandateResponse.statusText);
    
    if (!mandateResponse.ok) {
      let errorMessage = `HTTP ${mandateResponse.status}: ${mandateResponse.statusText}`;
      const responseText = await mandateResponse.text();
      
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch (_) {
        // If response is not JSON, use the text content
        errorMessage = responseText || errorMessage;
      }
              throw new HttpsError('failed-precondition', `Failed to get mandate: ${errorMessage}`);
    }
    
    const mandateData = await mandateResponse.json();
    const mandates = mandateData.mandates || [];
    
    // Find the most recently created active mandate for this customer
    const activeMandates = mandates.filter(mandate => 
      mandate.status === 'active' || mandate.status === 'pending_submission'
    );
    
    if (activeMandates.length === 0) {
      throw new HttpsError('failed-precondition', 'No active mandate found for customer.');
    }
    
    // Sort by creation date (newest first) and get the most recent
    const sortedMandates = activeMandates.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    const mandateId = sortedMandates[0].id;
    
    // Create the payment
    const paymentResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'GoCardless-Version': '2015-07-06'
      },
      body: JSON.stringify({
        payments: {
          amount: Math.round(amount * 100), // Convert to pence
          currency: currency,
          links: {
            mandate: mandateId
          },
          description: description
          // Removed custom reference to avoid scheme restrictions
        }
      })
    });
    
    if (!paymentResponse.ok) {
      let errorMessage = `HTTP ${paymentResponse.status}: ${paymentResponse.statusText}`;
      const responseText = await paymentResponse.text();
      
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch (_) {
        // If response is not JSON, use the text content
        errorMessage = responseText || errorMessage;
      }
              throw new HttpsError('internal', `Failed to create payment: ${errorMessage}`);
    }
    
    const paymentData = await paymentResponse.json();
    
    return {
      success: true,
      payment: paymentData.payments,
      message: 'Payment created successfully'
    };
    
  } catch (error) {
    console.error('GoCardless payment creation error:', error);
    if (error.code) {
      throw error; // Re-throw Firebase Functions errors
    }
    throw new HttpsError('internal', `Payment creation failed: ${error.message || 'Unknown error'}`);
  }
});

// Removed sendTeamInviteEmail as email is now handled in inviteMember

exports.inviteMember = onCall(async (request) => {
  console.log('inviteMember called with:', request.data);
  const { email } = request.data;
  const caller = request.auth;
  if (!caller || !caller.token.accountId || !caller.token.isOwner) {
    throw new HttpsError('permission-denied', 'Only owners can invite members.');
  }
  const accountId = caller.token.accountId;
  if (!email) {
    throw new HttpsError('invalid-argument', 'Email required.');
  }
  const db = admin.firestore();
  // Check if already a member
  const existingMemberSnap = await db.collection(`accounts/${accountId}/members`).where('email', '==', email).get();
  if (!existingMemberSnap.empty) {
          throw new HttpsError('already-exists', 'User is already a member.');
  }
  // Generate inviteCode
  const inviteCode = String(Math.floor(100000 + Math.random() * 900000));
  const apiKey = process.env.RESEND_KEY || 're_DjRTfH7G_Hz53GNL3Rvauc8oFAmQX3uaV';
  if (!apiKey) {
    console.error('No Resend API key found in environment!');
          throw new HttpsError('internal', 'Configuration error.');
  }
  const resend = new Resend(apiKey);
  const appUrl = process.env.APP_URL || 'https://guvnor.app';
  
  try {
    // Create temporary member doc with inviteCode as doc ID
    // Don't create Firebase user yet - they'll register themselves
    const memberRef = db.collection(`accounts/${accountId}/members`).doc(inviteCode);
    await memberRef.set({
      uid: null, // No uid yet - will be set when they accept the invite
      email,
      role: 'member',
      perms: { viewClients: true, viewRunsheet: true, viewPayments: false },
      status: 'invited',
      inviteCode,
      createdAt: new Date().toISOString(),
    });
    
    // Send invite email with code
    const { error } = await resend.emails.send({
      from: 'noreply@guvnor.app',
      to: email,
      subject: 'You Have Been Invited to Join a Team',
      html: `
        <h2>You've been invited to join a team on Guvnor!</h2>
        <p>To accept this invitation:</p>
        <ol>
          <li>Download the Guvnor app or visit <a href="${appUrl}">guvnor.app</a></li>
          <li>Register for an account (if you don't have one)</li>
          <li>Enter this invite code: <strong>${inviteCode}</strong></li>
        </ol>
        <p>Or click this link after logging in: <a href="${appUrl}/enter-invite-code?code=${inviteCode}">${appUrl}/enter-invite-code?code=${inviteCode}</a></p>
      `,
    });
    if (error) throw error;
    
    return { success: true, message: 'Invite sent successfully.' };
  } catch (err) {
    console.error('Invite error details:', err);
    if (err.code) console.error('Error code:', err.code);
    throw new HttpsError('internal', 'Failed to send invite: ' + (err.message || 'Unknown error'));
  }
});

exports.acceptTeamInvite = onCall(async (request) => {
  console.log('acceptTeamInvite called with:', request.data, 'by user:', request.auth?.uid);
  const { inviteCode } = request.data;
  const user = request.auth;

  if (!user) {
    throw new HttpsError('unauthenticated', 'You must be logged in to accept an invite.');
  }

  if (!inviteCode) {
    throw new HttpsError('invalid-argument', 'Invite code is required.');
  }

  const db = admin.firestore();
  const membersQuery = db.collectionGroup('members').where('inviteCode', '==', inviteCode).where('status', '==', 'invited').limit(1);
  const querySnap = await membersQuery.get();

  if (querySnap.empty) {
    console.log('No matching invite found for code:', inviteCode);
    throw new HttpsError('not-found', 'Invalid or expired invite code.');
  }

  const memberDocSnap = querySnap.docs[0];
  const memberData = memberDocSnap.data();
  const memberRef = memberDocSnap.ref;
  const accountId = memberRef.parent.parent.id;

  if (memberData.uid && memberData.uid !== user.uid) {
    console.log('UID mismatch: stored', memberData.uid, 'requester', user.uid);
    throw new HttpsError('permission-denied', 'This invite is not for your account.');
  }

  const newMemberRef = db.collection(`accounts/${accountId}/members`).doc(user.uid);
  await newMemberRef.set({
    ...memberData,
    uid: user.uid,
    email: memberData.email || user.email, // Use memberData.email as primary source
    status: 'active',
    inviteCode: null, // Clear the invite code
    joinedAt: new Date().toISOString(),
  });

  await memberRef.delete();

  // Update the user's document with the new accountId
  const userRef = db.collection('users').doc(user.uid);
  await userRef.set({
    accountId: accountId,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  // Refresh custom claims
  await admin.auth().setCustomUserClaims(user.uid, { 
    accountId: accountId,
    isOwner: memberData.role === 'owner' 
  });

  return { success: true, message: 'Invite accepted successfully!' };
});

exports.listMembers = onCall(async (request) => {
  const user = request.auth;
  if (!user || !user.token.accountId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated and have an account ID.');
  }

  const db = admin.firestore();
  const accountId = user.token.accountId;
  const membersRef = db.collection(`accounts/${accountId}/members`);
  const snap = await membersRef.get();
  const members = snap.docs.map(doc => ({ 
    docId: doc.id, // Document ID (either UID for active members or invite code for pending)
    uid: doc.data().uid || doc.id, // Use actual uid if available, otherwise use docId for compatibility
    ...doc.data() 
  }));
  
  // Ensure owner record exists
  const ownerExists = members.some(m => m.role === 'owner');
  if (!ownerExists && user.token.isOwner && accountId === user.uid) {
    // Add owner record if it doesn't exist
    const ownerRef = db.collection(`accounts/${accountId}/members`).doc(user.uid);
    await ownerRef.set({
      uid: user.uid,
      email: user.email || '',
      role: 'owner',
      perms: { viewClients: true, viewRunsheet: true, viewPayments: false },
      status: 'active',
      createdAt: new Date().toISOString(),
    });
    
    // Add to the returned list
    members.push({
      docId: user.uid,
      uid: user.uid,
      email: user.email || '',
      role: 'owner',
      perms: { viewClients: true, viewRunsheet: true, viewPayments: false },
      status: 'active',
      createdAt: new Date().toISOString(),
    });
  }
  
  return members;
});

exports.listVehicles = onCall(async (request) => {
  const user = request.auth;
  if (!user || !user.token.accountId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated and have an account ID.');
  }

  const db = admin.firestore();
  const vehiclesRef = db.collection(`accounts/${user.token.accountId}/vehicles`);
  const snap = await vehiclesRef.get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});

exports.addVehicle = onCall(async (request) => {
  const user = request.auth;
  if (!user || !user.token.accountId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated and have an account ID.');
  }
  const { name, dailyRate } = request.data;
  const db = admin.firestore();
  const newDocRef = db.collection(`accounts/${user.token.accountId}/vehicles`).doc();
  await newDocRef.set({ name, dailyRate });
  return { success: true, id: newDocRef.id };
});

exports.updateVehicle = onCall(async (request) => {
  const user = request.auth;
  if (!user || !user.token.accountId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated and have an account ID.');
  }
  const { id, data } = request.data;
  const db = admin.firestore();
  await db.collection(`accounts/${user.token.accountId}/vehicles`).doc(id).update(data);
  return { success: true };
});

exports.deleteVehicle = onCall(async (request) => {
  const user = request.auth;
  if (!user || !user.token.accountId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated and have an account ID.');
  }
  const { id } = request.data;
  const db = admin.firestore();
  await db.collection(`accounts/${user.token.accountId}/vehicles`).doc(id).delete();
  return { success: true };
});

exports.refreshClaims = onCall(async (request) => {
  const user = request.auth;
  if (!user) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const db = admin.firestore();

  // NEW: Try fast path – look in top-level users/{uid} doc for accountId
  let accountId = null;
  try {
    const userDocSnap = await db.collection('users').doc(user.uid).get();
    if (userDocSnap.exists) {
      const data = userDocSnap.data();
      if (data && data.accountId) {
        accountId = data.accountId;
      }
    }
  } catch (_) {/* ignore and fall back */}

  let isOwner = false;

  if (!accountId) {
    try {
      const accountsSnap = await db.collectionGroup('members').where('uid', '==', user.uid).limit(1).get();
      if (!accountsSnap.empty) {
        const memberDoc = accountsSnap.docs[0];
        const memberRef = memberDoc.ref;
        accountId = memberRef.parent.parent?.id || user.uid;
        isOwner = memberDoc.data().role === 'owner';
        
        // Update the user's document with the correct accountId
        await db.collection('users').doc(user.uid).set({
          accountId: accountId,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch (err) {
      console.error('refreshClaims: fallback query failed', err);
      // default to owner of own account if query fails
      accountId = user.uid;
      isOwner = true;
    }
  } else {
    // Check if user is owner by looking at member record
    try {
      const memberDoc = await db.collection(`accounts/${accountId}/members/${user.uid}`).get();
      if (memberDoc.exists) {
        isOwner = memberDoc.data().role === 'owner';
      } else if (accountId === user.uid) {
        // User is owner of their own account
        isOwner = true;
      }
    } catch (err) {
      console.error('refreshClaims: error checking member role', err);
      isOwner = accountId === user.uid;
    }
  }
  if (!accountId) {
    // As very last resort default to own UID
    accountId = user.uid;
    isOwner = true;
  }

  await admin.auth().setCustomUserClaims(user.uid, { accountId, isOwner });
  return { success: true, message: 'Claims refreshed.' };
});

exports.removeMember = onCall(async (request) => {
  const { memberUid } = request.data;
  const caller = request.auth;
  
  if (!caller || !caller.token.accountId || !caller.token.isOwner) {
    throw new HttpsError('permission-denied', 'Only owners can remove members.');
  }
  
  const db = admin.firestore();
  const accountId = caller.token.accountId;
  
  // For pending invitations, memberUid might be the invite code (doc ID)
  // For active members, memberUid is the actual user UID
  const memberRef = db.collection(`accounts/${accountId}/members`).doc(memberUid);
  const memberDoc = await memberRef.get();
  
  if (!memberDoc.exists) {
          throw new HttpsError('not-found', 'Member not found.');
  }
  
  const memberData = memberDoc.data();
  
  // Delete member record
  await memberRef.delete();
  
  // Only update user document if this is an active member (has a real UID)
  if (memberData.uid && memberData.status === 'active') {
    const userRef = db.collection('users').doc(memberData.uid);
    
    // Check if user document exists
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      // Create user document if it doesn't exist
      await userRef.set({
        id: memberData.uid,
        accountId: memberData.uid,
        createdAt: new Date().toISOString(),
      });
    } else {
      // Reset their accountId to their own UID
      await userRef.update({
        accountId: memberData.uid,
        updatedAt: new Date().toISOString(),
      });
    }
    
    // Clear their custom claims
    await admin.auth().setCustomUserClaims(memberData.uid, null);
  }
  
  return { success: true };
});

// Stripe Checkout session creation
exports.createCheckoutSession = onRequest({ secrets: [STRIPE_SECRET_KEY] }, async (req, res) => {
  console.log('🚀 [FUNCTION DEBUG] createCheckoutSession called');
  console.log('📋 [FUNCTION DEBUG] Request details:', {
    method: req.method,
    headers: Object.keys(req.headers),
    origin: req.headers.origin,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'Missing',
    bodyExists: !!req.body,
    body: req.body
  });
  
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('✅ [FUNCTION DEBUG] Handling OPTIONS preflight request');
    res.status(200).send('');
    return;
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    console.error('❌ [FUNCTION DEBUG] Method not allowed:', req.method);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  console.log('🔧 [FUNCTION DEBUG] Initializing Stripe...');
  // Initialize Stripe - using secure configuration approach
  let stripe;
  try {
    // For Firebase Functions v2, we'll use hosting config injection
    // The key will be injected at runtime from hosting environment
    let stripeSecretKey;
    
    // Prefer Secret Manager, then fall back to env vars (for local emulation)
    stripeSecretKey = STRIPE_SECRET_KEY.value() || process.env.STRIPE_SECRET_KEY;
    
    // If no environment variable, the key should be available from hosting config
    // This will be set via Firebase hosting environment configuration
    if (!stripeSecretKey) {
      // The hosting config should make this available
      stripeSecretKey = process.env.FUNCTIONS_CONFIG_stripe_secret_key || 
                       process.env.stripe_secret_key ||
                       process.env.STRIPE_SECRET;
    }
    
    console.log('🔑 [FUNCTION DEBUG] Stripe config:', {
      hasSecretKey: !!stripeSecretKey,
      secretKeyStart: stripeSecretKey ? stripeSecretKey.substring(0, 8) + '...' : 'Missing',
      envVarChecked: ['STRIPE_SECRET_KEY', 'FUNCTIONS_CONFIG_stripe_secret_key', 'stripe_secret_key', 'STRIPE_SECRET'],
      availableEnvVars: Object.keys(process.env).filter(key => key.includes('STRIPE') || key.includes('stripe'))
    });
    
    if (!stripeSecretKey) {
      throw new Error('Stripe secret key not found in environment. Please configure STRIPE_SECRET_KEY environment variable.');
    }
    
    stripe = require('stripe')(stripeSecretKey);
    console.log('✅ [FUNCTION DEBUG] Stripe initialized successfully');
  } catch (stripeError) {
    console.error('💀 [FUNCTION DEBUG] Stripe initialization failed:', stripeError);
    res.status(500).json({ 
      error: 'Stripe initialization failed', 
      details: stripeError.message,
      helpText: 'Please ensure STRIPE_SECRET_KEY environment variable is configured'
    });
    return;
  }
  
  console.log('📦 [FUNCTION DEBUG] Request body:', req.body);
  const { priceId, successUrl, cancelUrl } = req.body;
  
  // Get the authorization token from the request
  const authHeader = req.get('Authorization');
  console.log('🔐 [FUNCTION DEBUG] Auth header analysis:', {
    hasAuthHeader: !!authHeader,
    startsWithBearer: authHeader ? authHeader.startsWith('Bearer ') : false,
    headerLength: authHeader ? authHeader.length : 0
  });
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('❌ [FUNCTION DEBUG] Missing or invalid authorization header');
    res.status(401).json({ error: 'Unauthorized: No valid authorization token provided' });
    return;
  }
  
  const idToken = authHeader.split('Bearer ')[1];
  console.log('🎫 [FUNCTION DEBUG] Extracted ID token:', {
    tokenLength: idToken.length,
    tokenStart: idToken.substring(0, 20) + '...'
  });
  
  try {
    console.log('🔍 [FUNCTION DEBUG] Verifying Firebase ID token...');
    // Verify the ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    
    console.log('✅ [FUNCTION DEBUG] Token verified successfully:', {
      uid: uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      issuer: decodedToken.iss,
      audience: decodedToken.aud
    });
    
    console.log('📋 [FUNCTION DEBUG] Validating request parameters...');
    if (!priceId || !successUrl || !cancelUrl) {
      console.error('❌ [FUNCTION DEBUG] Missing parameters:', { priceId, successUrl, cancelUrl });
      res.status(400).json({ error: 'Missing required parameters: priceId, successUrl, or cancelUrl' });
      return;
    }
    
    console.log('🗄️ [FUNCTION DEBUG] Getting user data from Firestore...');
    const db = admin.firestore();
    
    // Get user information
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      console.error('❌ [FUNCTION DEBUG] User document not found for uid:', uid);
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    const userData = userDoc.data();
    console.log('👤 [FUNCTION DEBUG] User data retrieved:', {
      hasStripeCustomerId: !!userData.stripeCustomerId,
      email: userData.email,
      businessName: userData.businessName
    });
    
    let customerId = userData.stripeCustomerId;
    
    // Create Stripe customer if doesn't exist
    if (!customerId) {
      console.log('👥 [FUNCTION DEBUG] Creating new Stripe customer...');
      try {
        const customer = await stripe.customers.create({
          email: userData.email || decodedToken.email,
          name: userData.name || '',
          metadata: {
            userId: uid,
            businessName: userData.businessName || '',
          },
        });
        
        customerId = customer.id;
        console.log('✅ [FUNCTION DEBUG] Stripe customer created:', customerId);
        
        // Save customer ID to user document
        await userDoc.ref.update({
          stripeCustomerId: customerId,
          updatedAt: new Date().toISOString(),
        });
        console.log('💾 [FUNCTION DEBUG] Customer ID saved to Firestore');
      } catch (customerError) {
        console.error('💀 [FUNCTION DEBUG] Failed to create Stripe customer:', customerError);
        res.status(500).json({ error: 'Failed to create customer', details: customerError.message });
        return;
      }
    }
    
    console.log('🛒 [FUNCTION DEBUG] Creating Stripe Checkout session...');
    const sessionConfig = {
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: successUrl + '?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl,
      metadata: {
        userId: uid,
      },
      subscription_data: {
        metadata: {
          userId: uid,
        },
      },
      customer_update: {
        name: 'auto',
        address: 'auto',
      },
      // invoice_creation: {
      //   enabled: true,
      // },
    };
    
    console.log('⚙️ [FUNCTION DEBUG] Session config:', {
      customer: customerId,
      priceId: priceId,
      successUrl: sessionConfig.success_url,
      cancelUrl: sessionConfig.cancel_url
    });
    
    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create(sessionConfig);
    
    console.log('🎉 [FUNCTION DEBUG] Stripe Checkout session created successfully:', {
      sessionId: session.id,
      url: session.url,
      status: session.status
    });
    
    res.status(200).json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('💀 [FUNCTION DEBUG] Error in createCheckoutSession:', error);
    console.error('💀 [FUNCTION DEBUG] Error stack:', error.stack);
    
    if (error.code === 'auth/id-token-expired') {
      console.error('⏰ [FUNCTION DEBUG] Token expired');
      res.status(401).json({ error: 'Token expired' });
    } else if (error.code === 'auth/argument-error') {
      console.error('🔧 [FUNCTION DEBUG] Invalid token format');
      res.status(401).json({ error: 'Invalid token' });
    } else {
      console.error('🔥 [FUNCTION DEBUG] General error');
      res.status(500).json({ 
        error: `Checkout session creation failed: ${error.message || 'Unknown error'}`,
        details: error.stack || 'No stack trace available'
      });
    }
  }
});

// Handle Stripe webhooks
exports.stripeWebhook = onRequest({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
  console.log('🎣 [WEBHOOK DEBUG] Stripe webhook called');
  
  // Initialize Stripe inside function with safe config handling
  let stripe;
  let endpointSecret;
  try {
    // Try environment variables first
    let stripeSecretKey = STRIPE_SECRET_KEY.value() || process.env.STRIPE_SECRET_KEY;
    endpointSecret = STRIPE_WEBHOOK_SECRET.value() || process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!stripeSecretKey || !endpointSecret) {
      console.error('🔧 [WEBHOOK DEBUG] Required environment variables not set');
      throw new Error('Stripe configuration not found. Please set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET environment variables.');
    }
    
    console.log('🔑 [WEBHOOK DEBUG] Config check:', {
      hasSecretKey: !!stripeSecretKey,
      hasWebhookSecret: !!endpointSecret,
      usingEnvVars: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
    });
    
    if (!stripeSecretKey) {
      throw new Error('Stripe secret key not found');
    }
    
    stripe = require('stripe')(stripeSecretKey);
  } catch (configError) {
    console.error('💀 [WEBHOOK DEBUG] Configuration error:', configError);
    return res.status(500).send('Configuration Error');
  }
  
  const sig = req.headers['stripe-signature'];
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  console.log('Stripe webhook event received:', event.type);
  
  try {
    const db = admin.firestore();
    
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('Checkout session completed:', session.id);
        
        // Get user ID from metadata
        const userId = session.metadata.userId;
        if (!userId) {
          console.error('No user ID found in session metadata');
          break;
        }
        
        // Update user subscription status
        await updateUserSubscription(db, userId, 'premium', 'active', session.subscription);
        break;
      }
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        console.log('Subscription updated:', subscription.id, subscription.status);
        
        // Get user ID from metadata
        const userId = subscription.metadata.userId;
        if (!userId) {
          console.error('No user ID found in subscription metadata');
          break;
        }
        
        let tier = 'free';
        let status = 'active';
        
        if (subscription.status === 'active') {
          tier = 'premium';
          status = 'active';
        } else if (subscription.status === 'canceled') {
          tier = 'free';
          status = 'canceled';
        } else if (subscription.status === 'past_due') {
          tier = 'premium'; // Keep premium during grace period
          status = 'past_due';
        } else if (subscription.status === 'incomplete' || subscription.status === 'incomplete_expired') {
          tier = 'free';
          status = 'canceled';
        }
        
        await updateUserSubscription(db, userId, tier, status, subscription.id);
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        console.log('Subscription canceled:', subscription.id);
        
        // Get user ID from metadata
        const userId = subscription.metadata.userId;
        if (!userId) {
          console.error('No user ID found in subscription metadata');
          break;
        }
        
        await updateUserSubscription(db, userId, 'free', 'canceled', null);
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        console.log('Payment succeeded for invoice:', invoice.id);
        // Add any specific logic for successful payments
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log('Payment failed for invoice:', invoice.id);
        // Add any specific logic for failed payments
        break;
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Internal server error');
  }
});

// Helper function to update user subscription
async function updateUserSubscription(db, userId, tier, status, subscriptionId) {
  try {
    const updates = {
      subscriptionTier: tier,
      subscriptionStatus: status,
      isExempt: tier === 'exempt',
      clientLimit: tier === 'free' ? 20 : null,
      updatedAt: new Date().toISOString(),
    };
    
    if (subscriptionId) {
      updates.stripeSubscriptionId = subscriptionId;
    }
    
    await db.collection('users').doc(userId).update(updates);
    console.log(`Updated subscription for user ${userId}: ${tier} (${status})`);
  } catch (error) {
    console.error('Error updating user subscription:', error);
    throw error;
  }
}

// Create customer portal session
exports.createCustomerPortalSession = onRequest({ secrets: [STRIPE_SECRET_KEY] }, async (req, res) => {
  console.log('🏪 [PORTAL DEBUG] createCustomerPortalSession called');
  
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('✅ [PORTAL DEBUG] Handling OPTIONS preflight request');
    res.status(200).send('');
    return;
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    console.error('❌ [PORTAL DEBUG] Method not allowed:', req.method);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  console.log('🔧 [PORTAL DEBUG] Initializing Stripe...');
  // Initialize Stripe inside function with safe config handling
  let stripe;
  try {
    // Try environment variable first
    let stripeSecretKey = STRIPE_SECRET_KEY.value() || process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      console.error('🔧 [PORTAL DEBUG] STRIPE_SECRET_KEY environment variable not set');
      throw new Error('Stripe configuration not found. Please set STRIPE_SECRET_KEY environment variable');
    }
    
    console.log('🔑 [PORTAL DEBUG] Stripe config available:', {
      hasSecretKey: !!stripeSecretKey,
      usingEnvVar: !!process.env.STRIPE_SECRET_KEY
    });
    
    if (!stripeSecretKey) {
      throw new Error('Stripe secret key not found');
    }
    
    stripe = require('stripe')(stripeSecretKey);
    console.log('✅ [PORTAL DEBUG] Stripe initialized successfully');
  } catch (stripeError) {
    console.error('💀 [PORTAL DEBUG] Stripe initialization failed:', stripeError);
    res.status(500).json({ error: 'Stripe initialization failed', details: stripeError.message });
    return;
  }
  
  console.log('createCustomerPortalSession called');
  const { returnUrl } = req.body;
  
  // Get the authorization token from the request
  const authHeader = req.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: No valid authorization token provided' });
    return;
  }
  
  const idToken = authHeader.split('Bearer ')[1];
  
  try {
    // Verify the ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    
    if (!returnUrl) {
      res.status(400).json({ error: 'Return URL is required' });
      return;
    }
    
    const db = admin.firestore();
    
    // Get user's Stripe customer ID
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    const userData = userDoc.data();
    if (!userData.stripeCustomerId) {
      res.status(400).json({ error: 'No Stripe customer found. Please subscribe first.' });
      return;
    }
    
    // Create customer portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: userData.stripeCustomerId,
      return_url: returnUrl,
    });
    
    console.log('Customer portal session created:', session.id);
    
    res.status(200).json({
      url: session.url,
    });
  } catch (error) {
    console.error('Error creating customer portal session:', error);
    
    if (error.code === 'auth/id-token-expired') {
      res.status(401).json({ error: 'Token expired' });
    } else if (error.code === 'auth/argument-error') {
      res.status(401).json({ error: 'Invalid token' });
    } else {
      res.status(500).json({ error: `Portal session creation failed: ${error.message || 'Unknown error'}` });
    }
  }
});