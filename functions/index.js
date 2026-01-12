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
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { Resend } = require("resend");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const crypto = require("crypto");

// Secure Stripe secrets (managed via Firebase Secret Manager)
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
// Resend API key (Firebase Secret Manager)
const RESEND_KEY = defineSecret('RESEND_KEY');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

// Configure CORS for Firebase v2 functions to allow custom domain
setGlobalOptions({ 
  maxInstances: 10
});

// Default subscription tier assignment for new users
const DEVELOPER_UID = 'X4TtaVGKUtQSCtPLF8wsHsVZ0oW2';
exports.setDefaultSubscriptionTier = onDocumentCreated('users/{userId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const existingData = snapshot.data();
  const userId = event.params.userId;

  // If subscriptionTier already exists, exit early
  if (existingData && existingData.subscriptionTier) {
    return;
  }

  const updates = userId === DEVELOPER_UID
    ? {
        subscriptionTier: 'exempt',
        subscriptionStatus: 'exempt',
        clientLimit: null,
        isExempt: true,
      }
    : {
        subscriptionTier: 'free',
        subscriptionStatus: 'active',
        clientLimit: 20,
        isExempt: false,
      };

  try {
    await snapshot.ref.update(updates);
    console.log(`Default subscription tier set for user ${userId}`);
  } catch (err) {
    console.error(`Failed to set default subscription tier for user ${userId}:`, err);
  }
});

/**
 * Daily maintenance: compute active client count per account and write it onto each user doc.
 *
 * - Clients live in top-level `clients` collection
 * - Account scoping is via `clients.ownerId` (this matches app-side getDataOwnerId() == accountId)
 * - Active clients are those with status !== 'ex-client'
 */
exports.updateNumberOfClientsDaily = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Europe/London",
  },
  async () => {
    const db = admin.firestore();

    // Cache counts across the whole run so team members sharing an accountId don't re-count.
    const accountCounts = new Map();

    // Batch writes for efficiency (Firestore limit: 500 ops per batch)
    const batchLimit = 400;
    let batch = db.batch();
    let batchOps = 0;

    let lastDoc = null;
    let updatedUsers = 0;

    const usersCol = db.collection("users");
    const idPath = admin.firestore.FieldPath.documentId();

    while (true) {
      let q = usersCol.orderBy(idPath).limit(500);
      if (lastDoc) q = q.startAfter(lastDoc);

      const snap = await q.get();
      if (snap.empty) break;

      for (const userDoc of snap.docs) {
        const data = userDoc.data() || {};

        // accountId is the "data owner" used throughout the app. Owners have accountId == uid.
        const accountId = data.accountId || userDoc.id;

        let activeClientCount = accountCounts.get(accountId);
        if (activeClientCount === undefined) {
          const countSnap = await db
            .collection("clients")
            .where("ownerId", "==", accountId)
            .where("status", "!=", "ex-client")
            .count()
            .get();

          activeClientCount = (countSnap.data() && countSnap.data().count) ? countSnap.data().count : 0;
          accountCounts.set(accountId, activeClientCount);
        }

        batch.set(
          userDoc.ref,
          {
            numberOfClients: activeClientCount,
            numberOfClientsUpdatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        batchOps++;
        updatedUsers++;

        if (batchOps >= batchLimit) {
          await batch.commit();
          batch = db.batch();
          batchOps = 0;
        }
      }

      lastDoc = snap.docs[snap.docs.length - 1];
    }

    if (batchOps) {
      await batch.commit();
    }

    console.log(
      `updateNumberOfClientsDaily: updated ${updatedUsers} user docs; counted ${accountCounts.size} unique accountIds`
    );
  }
);

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

exports.inviteMember = onCall({ secrets: [RESEND_KEY] }, async (request) => {
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
  const apiKey = RESEND_KEY.value() || process.env.RESEND_KEY;
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

/**
 * Backfill / normalize `ownerId` + `accountId` across top-level collections.
 *
 * Why:
 * - Firestore rules now prefer `accountId` and use it for access checks.
 * - Older documents (especially created by team members) may have `ownerId` set to the
 *   member UID instead of the account owner UID, which can lock owners/members out.
 *
 * Strategy:
 * - Owner-only.
 * - Enumerate active member UIDs under accounts/{accountId}/members.
 * - For each member UID, query each collection by ownerId==memberUid and rewrite to accountId.
 *
 * NOTE: This function uses Admin SDK so it can repair documents even if rules would deny access.
 */
exports.backfillAccountIds = onCall(async (request) => {
  const caller = request.auth;
  if (!caller || !caller.token || !caller.token.accountId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated and have an account ID.');
  }
  if (!caller.token.isOwner) {
    throw new HttpsError('permission-denied', 'Only owners can run data repairs.');
  }

  const db = admin.firestore();
  const accountId = caller.token.accountId;

  const dryRun = !!(request.data && request.data.dryRun);
  const maxDocs = Math.max(1, Math.min(Number((request.data && request.data.maxDocs) || 2000), 10000));

  // Collect active member UIDs for this account (including the owner).
  const membersSnap = await db.collection(`accounts/${accountId}/members`).get();
  const memberUids = new Set([accountId]);
  membersSnap.docs.forEach((d) => {
    const data = d.data() || {};
    const uid = data.uid || d.id;
    const status = data.status || 'active';
    if (uid && status === 'active') memberUids.add(uid);
  });

  const collections = ['clients', 'jobs', 'payments', 'servicePlans', 'quotes'];
  const summary = {
    ok: true,
    accountId,
    dryRun,
    maxDocs,
    memberUids: Array.from(memberUids),
    scanned: 0,
    updated: 0,
    updatedByCollection: {},
    truncated: false,
  };

  let remaining = maxDocs;

  for (const coll of collections) {
    if (remaining <= 0) {
      summary.truncated = true;
      break;
    }

    let updatedForColl = 0;

    for (const uid of memberUids) {
      if (remaining <= 0) {
        summary.truncated = true;
        break;
      }

      // Only pull a bounded number of docs per uid so we don't time out.
      const snap = await db.collection(coll).where('ownerId', '==', uid).limit(Math.min(500, remaining)).get();
      summary.scanned += snap.size;
      remaining -= snap.size;

      if (snap.empty) continue;

      let batch = db.batch();
      let batchOps = 0;

      for (const docSnap of snap.docs) {
        const data = docSnap.data() || {};
        const needsOwner = data.ownerId !== accountId;
        const needsAccount = data.accountId !== accountId;

        if (!needsOwner && !needsAccount) continue;

        updatedForColl += 1;
        summary.updated += 1;

        if (!dryRun) {
          batch.update(docSnap.ref, { ownerId: accountId, accountId });
          batchOps += 1;
        }

        // Firestore batch limit is 500 ops; keep some buffer.
        if (!dryRun && batchOps >= 450) {
          await batch.commit();
          batch = db.batch();
          batchOps = 0;
        }
      }

      if (!dryRun && batchOps > 0) {
        await batch.commit();
      }

      if (remaining <= 0) {
        summary.truncated = true;
        break;
      }
    }

    summary.updatedByCollection[coll] = updatedForColl;
  }

  return summary;
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
exports.stripeWebhook = onRequest({ 
  secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
  cors: true
}, async (req, res) => {
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
        let renewalDate = null;
        
        if (subscription.status === 'active') {
          tier = 'premium';
          status = 'active';
          // Convert Stripe timestamp to ISO string
          renewalDate = new Date(subscription.current_period_end * 1000).toISOString();
        } else if (subscription.status === 'canceled') {
          tier = 'free';
          status = 'canceled';
        } else if (subscription.status === 'past_due') {
          tier = 'premium'; // Keep premium during grace period
          status = 'past_due';
          renewalDate = new Date(subscription.current_period_end * 1000).toISOString();
        } else if (subscription.status === 'incomplete' || subscription.status === 'incomplete_expired') {
          tier = 'free';
          status = 'canceled';
        }
        
        await updateUserSubscription(db, userId, tier, status, subscription.id, renewalDate);
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
async function updateUserSubscription(db, userId, tier, status, subscriptionId, renewalDate = null) {
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
    
    if (renewalDate) {
      updates.subscriptionRenewalDate = renewalDate;
    } else if (tier === 'free') {
      // Clear renewal date for free users
      updates.subscriptionRenewalDate = null;
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

// Contact form submission function
exports.submitContactForm = onCall({ secrets: [RESEND_KEY] }, async (request) => {
  console.log('submitContactForm called with:', request.data);
  
  const { firstName, lastName, email, phone, company, subject, message } = request.data;
  
  // Validate required fields
  if (!firstName || !lastName || !email || !subject || !message) {
    throw new HttpsError('invalid-argument', 'Missing required fields: firstName, lastName, email, subject, and message are required.');
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new HttpsError('invalid-argument', 'Invalid email address format.');
  }
  
  const db = admin.firestore();
  try {
    const ip = getClientIp(request.rawRequest || { headers: {} });
    const ipKey = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
    await enforceRateLimit(db, `contact:ip:${ipKey}`, 30, 60 * 60 * 1000); // 30/hr per IP
    await enforceRateLimit(db, `contact:email:${crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 32)}`, 10, 24 * 60 * 60 * 1000); // 10/day per email
  } catch (e) {
    if (e instanceof HttpsError) throw e;
  }

  const apiKey = RESEND_KEY.value() || process.env.RESEND_KEY;
  if (!apiKey) {
    console.error('No Resend API key found in environment!');
    throw new HttpsError('internal', 'Email service configuration error.');
  }
  
  const resend = new Resend(apiKey);
  
  // Format the subject for better categorization
  const subjectMap = {
    'demo': 'Demo Request',
    'support': 'Technical Support',
    'pricing': 'Pricing Question',
    'partnership': 'Partnership Inquiry',
    'general': 'General Question'
  };
  
  const formattedSubject = subjectMap[subject] || 'Contact Form Submission';
  
  try {
    // Send email to support
    const { error } = await resend.emails.send({
      from: 'noreply@guvnor.app',
      to: 'support@guvnor.app',
      subject: `[Contact Form] ${formattedSubject} - ${firstName} ${lastName}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Contact Information</h3>
          <p><strong>Name:</strong> ${firstName} ${lastName}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
          <p><strong>Business:</strong> ${company || 'Not provided'}</p>
          <p><strong>Subject:</strong> ${formattedSubject}</p>
        </div>
        
        <h3>Message</h3>
        <div style="background: #fff; padding: 15px; border-left: 4px solid #007AFF; margin: 20px 0;">
          <p style="white-space: pre-wrap;">${message}</p>
        </div>
        
        <hr style="margin: 30px 0;">
        <p style="font-size: 12px; color: #666;">
          This message was sent via the Guvnor contact form at ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })} GMT.
        </p>
      `,
    });
    
    if (error) {
      console.error('Resend error:', error);
      throw error;
    }
    
    console.log('Contact form email sent successfully');
    return { 
      success: true, 
      message: 'Your message has been sent successfully. We\'ll get back to you within 24 hours during business days.' 
    };
    
  } catch (err) {
    console.error('Contact form submission error:', err);
    throw new HttpsError('internal', 'Failed to send your message. Please try again or contact us directly at support@guvnor.app');
  }
});

// Send Firebase email verification using a custom sender domain (Resend)
exports.sendVerificationEmail = onCall({ secrets: [RESEND_KEY] }, async (request) => {
  const caller = request.auth;
  if (!caller) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  try {
    const userRecord = await admin.auth().getUser(caller.uid);
    const email = userRecord.email;
    if (!email) {
      throw new HttpsError('failed-precondition', 'No email address on account.');
    }

    // Already verified - nothing to do
    if (userRecord.emailVerified) {
      return { success: true, message: 'Email is already verified.' };
    }

    const apiKey = RESEND_KEY.value() || process.env.RESEND_KEY;
    if (!apiKey) {
      console.error('No Resend API key found in environment!');
      throw new HttpsError('internal', 'Configuration error.');
    }

    const resend = new Resend(apiKey);
    const appUrl = process.env.APP_URL || 'https://guvnor.app';

    // Send user back to login after verifying
    const actionCodeSettings = {
      url: `${appUrl}/login`,
      handleCodeInApp: false,
    };

    const verifyLink = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);

    const { error } = await resend.emails.send({
      from: 'Guvnor <noreply@guvnor.app>',
      to: email,
      subject: 'Verify your email for Guvnor',
      html: `
        <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5;">
          <h2 style="margin: 0 0 12px;">Verify your email</h2>
          <p style="margin: 0 0 16px;">Thanks for signing up for Guvnor. Please confirm your email address to activate your account.</p>
          <p style="margin: 0 0 24px;">
            <a href="${verifyLink}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 12px 16px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Verify email
            </a>
          </p>
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Or paste this link into your browser:</p>
          <p style="margin: 0 0 24px; font-size: 14px; word-break: break-all;">
            <a href="${verifyLink}">${verifyLink}</a>
          </p>
          <p style="margin: 0; color: #6b7280; font-size: 12px;">
            If you didn’t request this email, you can safely ignore it.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend error (verification email):', error);
      throw new HttpsError('internal', 'Failed to send verification email.');
    }

    return { success: true, message: 'Verification email sent.' };
  } catch (err) {
    console.error('sendVerificationEmail error:', err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err?.message || 'Unknown error');
  }
});

/**
 * Simple Firestore-backed rate limiting.
 * NOTE: Admin SDK bypasses rules; this is server-side only.
 */
async function enforceRateLimit(db, key, limit, windowMs) {
  const ref = db.collection('rateLimits').doc(key);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() || {}) : {};
    const resetAt = typeof data.resetAt === 'number' ? data.resetAt : 0;
    const count = typeof data.count === 'number' ? data.count : 0;

    if (now > resetAt) {
      tx.set(ref, { count: 1, resetAt: now + windowMs, updatedAt: new Date().toISOString() }, { merge: true });
      return;
    }

    if (count >= limit) {
      throw new HttpsError('resource-exhausted', 'Too many requests. Please try again later.');
    }

    tx.set(ref, { count: count + 1, updatedAt: new Date().toISOString() }, { merge: true });
  });
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  if (Array.isArray(xff) && xff.length) return String(xff[0]).split(',')[0].trim();
  return req.ip || 'unknown';
}

function normalizePhoneLast4(s) {
  const digits = String(s || '').replace(/\D/g, '');
  return digits.slice(-4);
}

function normalizeAccountSuffix(s) {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, '');
}

async function getValidPortalSession(db, sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new HttpsError('unauthenticated', 'Missing session.');
  }
  const snap = await db.collection('portalSessions').doc(sessionId).get();
  if (!snap.exists) throw new HttpsError('unauthenticated', 'Session expired.');
  const data = snap.data() || {};
  const expiresAt = data.expiresAt;
  if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
    throw new HttpsError('unauthenticated', 'Session expired.');
  }
  if (!data.clientId || !data.ownerId) {
    throw new HttpsError('unauthenticated', 'Invalid session.');
  }
  return { sessionId, clientId: data.clientId, ownerId: data.ownerId };
}

// Public client portal API (used by /app/[businessName].tsx). Keep portal UX the same while locking Firestore down.
exports.portalApi = onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const db = admin.firestore();
  const ip = getClientIp(req);
  const ipKey = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);

  // Route based on final path segment: /api/portal/<action>
  const parts = String(req.path || '').split('/').filter(Boolean);
  const action = parts[parts.length - 1] || '';

  try {
    // Lightweight abuse controls for all portal endpoints
    await enforceRateLimit(db, `portal:ip:${ipKey}`, 300, 60 * 60 * 1000); // 300/hr per IP

    if (action === 'lookupAccount') {
      const { businessOwnerId, accountNumberSuffix } = req.body || {};
      if (!businessOwnerId || typeof businessOwnerId !== 'string') {
        res.status(400).json({ ok: false, error: 'Missing business owner.' });
        return;
      }
      const suffix = normalizeAccountSuffix(accountNumberSuffix);
      if (!suffix) {
        res.status(400).json({ ok: false, error: 'Please enter your account number.' });
        return;
      }

      await enforceRateLimit(db, `portal:lookup:${ipKey}`, 60, 60 * 60 * 1000); // 60/hr lookup attempts

      const fullAccountNumber = `RWC${suffix}`;
      const snap = await db
        .collection('clients')
        .where('ownerId', '==', businessOwnerId)
        .where('accountNumber', '==', fullAccountNumber)
        .limit(1)
        .get();

      if (snap.empty) {
        res.status(200).json({ ok: false, error: 'Account not found. Please check your account number and try again.' });
        return;
      }

      const docSnap = snap.docs[0];
      const c = docSnap.data() || {};
      res.status(200).json({
        ok: true,
        client: {
          id: docSnap.id,
          name: c.name || '',
          accountNumber: c.accountNumber || fullAccountNumber,
        },
      });
      return;
    }

    if (action === 'verifyPhone') {
      const { businessOwnerId, clientId, phoneLast4 } = req.body || {};
      if (!businessOwnerId || typeof businessOwnerId !== 'string' || !clientId || typeof clientId !== 'string') {
        res.status(400).json({ ok: false, error: 'Missing verification details.' });
        return;
      }
      const last4 = normalizePhoneLast4(phoneLast4);
      if (!last4 || last4.length !== 4) {
        res.status(400).json({ ok: false, error: 'Please enter the last 4 digits of your phone number.' });
        return;
      }

      await enforceRateLimit(db, `portal:verify:${ipKey}:${clientId}`, 30, 60 * 60 * 1000); // 30/hr per clientId

      const clientDoc = await db.collection('clients').doc(clientId).get();
      if (!clientDoc.exists) {
        res.status(200).json({ ok: false, error: 'Verification failed. Please try again.' });
        return;
      }
      const c = clientDoc.data() || {};
      if (c.ownerId !== businessOwnerId) {
        res.status(200).json({ ok: false, error: 'Verification failed. Please try again.' });
        return;
      }

      const storedLast4 = normalizePhoneLast4(c.mobileNumber || '');
      if (!storedLast4 || storedLast4.length !== 4) {
        res.status(200).json({ ok: false, error: 'Phone verification unavailable. Please contact the business directly.' });
        return;
      }
      if (storedLast4 !== last4) {
        res.status(200).json({ ok: false, error: 'Phone number does not match. Please try again.' });
        return;
      }

      const sessionId = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours
      await db.collection('portalSessions').doc(sessionId).set({
        ownerId: businessOwnerId,
        clientId,
        createdAt: new Date().toISOString(),
        expiresAt,
        ipHash: ipKey,
      });

      res.status(200).json({ ok: true, sessionId });
      return;
    }

    if (action === 'dashboard') {
      const { sessionId } = req.body || {};
      const sess = await getValidPortalSession(db, sessionId);

      const ownerDoc = await db.collection('users').doc(sess.ownerId).get();
      const ownerData = ownerDoc.exists ? (ownerDoc.data() || {}) : {};

      const clientDoc = await db.collection('clients').doc(sess.clientId).get();
      if (!clientDoc.exists) throw new HttpsError('not-found', 'Client not found.');
      const clientData = clientDoc.data() || {};
      if (clientData.ownerId !== sess.ownerId) throw new HttpsError('permission-denied', 'Invalid session.');

      // Service plans
      const plansSnap = await db
        .collection('servicePlans')
        .where('clientId', '==', sess.clientId)
        .where('isActive', '==', true)
        .get();
      const plans = plansSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Pending jobs for next service
      const pendingSnap = await db
        .collection('jobs')
        .where('clientId', '==', sess.clientId)
        .where('status', 'in', ['pending', 'scheduled', 'in_progress'])
        .get();

      const now = new Date();
      const nextServiceDates = {};
      let overallNextDate = null;
      let overallNextType = null;

      pendingSnap.forEach((d) => {
        const j = d.data() || {};
        if (!j.scheduledTime) return;
        const jobDate = new Date(j.scheduledTime);
        if (jobDate < now) return;
        const serviceId = j.serviceId || 'Service';
        const existing = nextServiceDates[serviceId];
        if (!existing || jobDate < new Date(existing)) nextServiceDates[serviceId] = j.scheduledTime;
        if (!overallNextDate || jobDate < overallNextDate) {
          overallNextDate = jobDate;
          overallNextType = serviceId;
        }
      });

      const plansWithDates = plans.map((p) => ({
        ...p,
        nextServiceDate: nextServiceDates[p.serviceType] || undefined,
      }));

      // Completed jobs history
      const jobsSnap = await db
        .collection('jobs')
        .where('clientId', '==', sess.clientId)
        .where('status', '==', 'completed')
        .get();
      const jobs = jobsSnap.docs.map((d) => {
        const j = d.data() || {};
        return {
          id: d.id,
          type: 'job',
          date: j.scheduledTime || '',
          description: j.serviceId || 'Service',
          amount: j.price || 0,
        };
      });

      // Payments history
      const paySnap = await db.collection('payments').where('clientId', '==', sess.clientId).get();
      const payments = paySnap.docs.map((d) => {
        const p = d.data() || {};
        return {
          id: d.id,
          type: 'payment',
          date: p.date || '',
          description: `Payment (${p.method || 'unknown'})`,
          amount: p.amount || 0,
        };
      });

      const history = [...jobs, ...payments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const totalBilled = jobs.reduce((sum, j) => sum + (Number(j.amount) || 0), 0);
      const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const startingBalance = Number(clientData.startingBalance) || 0;
      const balance = totalPaid - totalBilled + startingBalance;

      res.status(200).json({
        ok: true,
        owner: {
          id: sess.ownerId,
          bankSortCode: ownerData.bankSortCode || '',
          bankAccountNumber: ownerData.bankAccountNumber || '',
        },
        client: {
          id: sess.clientId,
          name: clientData.name || '',
          accountNumber: clientData.accountNumber || '',
          mobileNumber: clientData.mobileNumber || '',
          email: clientData.email || '',
          address1: clientData.address1 || '',
          town: clientData.town || '',
          postcode: clientData.postcode || '',
          startingBalance,
        },
        servicePlans: plansWithDates,
        nextServiceDate: overallNextDate ? overallNextDate.toISOString() : null,
        nextServiceType: overallNextType,
        history,
        balance,
      });
      return;
    }

    if (action === 'updateProfile') {
      const { sessionId, name, mobileNumber } = req.body || {};
      const sess = await getValidPortalSession(db, sessionId);

      const newName = String(name || '').trim().slice(0, 120);
      const newMobile = String(mobileNumber || '').trim().slice(0, 40);

      await db.collection('clients').doc(sess.clientId).update({
        name: newName,
        mobileNumber: newMobile,
        updatedAt: new Date().toISOString(),
      });

      res.status(200).json({ ok: true, client: { id: sess.clientId, name: newName, mobileNumber: newMobile } });
      return;
    }

    if (action === 'submitQuoteRequest') {
      const {
        businessId,
        businessName,
        name,
        phone,
        address,
        town,
        postcode,
        email,
        notes,
      } = req.body || {};

      if (!businessId || typeof businessId !== 'string') {
        res.status(400).json({ ok: false, error: 'Business information not available' });
        return;
      }

      await enforceRateLimit(db, `portal:quote:${ipKey}:${businessId}`, 20, 60 * 60 * 1000); // 20/hr per IP per business

      const clean = (v, max) => String(v || '').trim().slice(0, max);
      const payload = {
        businessId,
        businessName: clean(businessName, 140) || null,
        name: clean(name, 140),
        phone: clean(phone, 40),
        address: clean(address, 200),
        town: clean(town, 120),
        postcode: clean(postcode, 20),
        email: clean(email, 160) || null,
        notes: clean(notes, 2000) || null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        source: 'client_portal',
      };

      if (!payload.name || !payload.phone || !payload.address || !payload.town || !payload.postcode) {
        res.status(400).json({ ok: false, error: 'Missing required fields.' });
        return;
      }

      await db.collection('quoteRequests').add(payload);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(404).json({ ok: false, error: 'Unknown portal action' });
  } catch (err) {
    const msg = err?.message || 'Internal error';
    if (err instanceof HttpsError) {
      res.status(err.code === 'resource-exhausted' ? 429 : 400).json({ ok: false, error: msg });
      return;
    }
    console.error('portalApi error:', err);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});