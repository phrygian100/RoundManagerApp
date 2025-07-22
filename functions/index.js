/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const admin = require("firebase-admin");
const { Resend } = require("resend");
const { onCall } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");

admin.initializeApp();

setGlobalOptions({ maxInstances: 10 });

// Removed sendTeamInviteEmail as email is now handled in inviteMember

exports.inviteMember = onCall(async (request) => {
  console.log('inviteMember called with:', request.data);
  const { email } = request.data;
  const caller = request.auth;
  if (!caller || !caller.token.accountId || !caller.token.isOwner) {
    throw new functions.https.HttpsError('permission-denied', 'Only owners can invite members.');
  }
  const accountId = caller.token.accountId;
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'Email required.');
  }
  const db = admin.firestore();
  // Check if already a member
  const existingMemberSnap = await db.collection(`accounts/${accountId}/members`).where('email', '==', email).get();
  if (!existingMemberSnap.empty) {
    throw new functions.https.HttpsError('already-exists', 'User is already a member.');
  }
  // Generate inviteCode
  const inviteCode = String(Math.floor(100000 + Math.random() * 900000));
  const apiKey = process.env.RESEND_KEY || 're_DjRTfH7G_Hz53GNL3Rvauc8oFAmQX3uaV';
  if (!apiKey) {
    console.error('No Resend API key found in environment!');
    throw new functions.https.HttpsError('internal', 'Configuration error.');
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
    throw new functions.https.HttpsError('internal', 'Failed to send invite: ' + (err.message || 'Unknown error'));
  }
});

exports.acceptTeamInvite = onCall(async (request) => {
  console.log('acceptTeamInvite called with:', request.data, 'by user:', request.auth?.uid);
  const { inviteCode } = request.data;
  const user = request.auth;

  if (!user) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to accept an invite.');
  }

  if (!inviteCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Invite code is required.');
  }

  const db = admin.firestore();
  const membersQuery = db.collectionGroup('members').where('inviteCode', '==', inviteCode).where('status', '==', 'invited').limit(1);
  const querySnap = await membersQuery.get();

  if (querySnap.empty) {
    console.log('No matching invite found for code:', inviteCode);
    throw new functions.https.HttpsError('not-found', 'Invalid or expired invite code.');
  }

  const memberDocSnap = querySnap.docs[0];
  const memberData = memberDocSnap.data();
  const memberRef = memberDocSnap.ref;
  const accountId = memberRef.parent.parent.id;

  if (memberData.uid && memberData.uid !== user.uid) {
    console.log('UID mismatch: stored', memberData.uid, 'requester', user.uid);
    throw new functions.https.HttpsError('permission-denied', 'This invite is not for your account.');
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
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated and have an account ID.');
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
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated and have an account ID.');
  }

  const db = admin.firestore();
  const vehiclesRef = db.collection(`accounts/${user.token.accountId}/vehicles`);
  const snap = await vehiclesRef.get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});

exports.addVehicle = onCall(async (request) => {
  const user = request.auth;
  if (!user || !user.token.accountId) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated and have an account ID.');
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
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated and have an account ID.');
  }
  const { id, data } = request.data;
  const db = admin.firestore();
  await db.collection(`accounts/${user.token.accountId}/vehicles`).doc(id).update(data);
  return { success: true };
});

exports.deleteVehicle = onCall(async (request) => {
  const user = request.auth;
  if (!user || !user.token.accountId) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated and have an account ID.');
  }
  const { id } = request.data;
  const db = admin.firestore();
  await db.collection(`accounts/${user.token.accountId}/vehicles`).doc(id).delete();
  return { success: true };
});

exports.refreshClaims = onCall(async (request) => {
  const user = request.auth;
  if (!user) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
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
    throw new functions.https.HttpsError('permission-denied', 'Only owners can remove members.');
  }
  
  const db = admin.firestore();
  const accountId = caller.token.accountId;
  
  // For pending invitations, memberUid might be the invite code (doc ID)
  // For active members, memberUid is the actual user UID
  const memberRef = db.collection(`accounts/${accountId}/members`).doc(memberUid);
  const memberDoc = await memberRef.get();
  
  if (!memberDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Member not found.');
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

// GoCardless webhook handler
exports.gocardlessWebhook = onRequest(async (req, res) => {
  try {
    console.log('GoCardless webhook received:', req.body);
    
    // Verify webhook signature (you'll need to implement this)
    const webhookSecret = process.env.GOCARDLESS_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('GOCARDLESS_WEBHOOK_SECRET not configured');
      res.status(500).send('Webhook secret not configured');
      return;
    }
    
    // For now, we'll accept all webhooks (implement proper verification later)
    const events = req.body.events || [];
    
    for (const event of events) {
      await handleGoCardlessEvent(event);
    }
    
    res.status(200).send('Webhook processed successfully');
  } catch (error) {
    console.error('Error processing GoCardless webhook:', error);
    res.status(500).send('Webhook processing failed');
  }
});

async function handleGoCardlessEvent(event) {
  const db = admin.firestore();
  
  console.log('Processing GoCardless event:', event.resource_type, event.action, event.id);
  
  switch (event.resource_type) {
    case 'payments':
      await handlePaymentEvent(event);
      break;
    case 'mandates':
      await handleMandateEvent(event);
      break;
    case 'customer_bank_accounts':
      await handleBankAccountEvent(event);
      break;
    default:
      console.log('Unhandled event type:', event.resource_type);
  }
}

async function handlePaymentEvent(event) {
  const db = admin.firestore();
  const paymentId = event.links.payment;
  
  try {
    // Find payment in our database by GoCardless payment ID
    const paymentsQuery = db.collection('payments').where('gocardlessPaymentId', '==', paymentId);
    const paymentSnapshot = await paymentsQuery.get();
    
    if (!paymentSnapshot.empty) {
      const paymentDoc = paymentSnapshot.docs[0];
      const paymentData = paymentDoc.data();
      
      // Update payment status based on event
      let newStatus = paymentData.gocardlessStatus;
      
      switch (event.action) {
        case 'confirmed':
          newStatus = 'confirmed';
          break;
        case 'paid_out':
          newStatus = 'paid_out';
          break;
        case 'failed':
          newStatus = 'failed';
          break;
        case 'cancelled':
          newStatus = 'cancelled';
          break;
        case 'charged_back':
          newStatus = 'charged_back';
          break;
      }
      
      // Update the payment record
      await paymentDoc.ref.update({
        gocardlessStatus: newStatus,
        updatedAt: new Date().toISOString()
      });
      
      console.log(`Updated payment ${paymentDoc.id} status to ${newStatus}`);
    } else {
      console.log(`Payment with GoCardless ID ${paymentId} not found in database`);
    }
  } catch (error) {
    console.error('Error handling payment event:', error);
  }
}

async function handleMandateEvent(event) {
  const db = admin.firestore();
  const mandateId = event.links.mandate;
  
  try {
    // Find client in our database by GoCardless mandate ID
    const clientsQuery = db.collection('clients').where('gocardlessMandateId', '==', mandateId);
    const clientSnapshot = await clientsQuery.get();
    
    if (!clientSnapshot.empty) {
      const clientDoc = clientSnapshot.docs[0];
      const clientData = clientDoc.data();
      
      // Update client mandate status based on event
      let mandateStatus = clientData.gocardlessMandateStatus;
      
      switch (event.action) {
        case 'active':
          mandateStatus = 'active';
          break;
        case 'cancelled':
          mandateStatus = 'cancelled';
          break;
        case 'expired':
          mandateStatus = 'expired';
          break;
        case 'failed':
          mandateStatus = 'failed';
          break;
      }
      
      // Update the client record
      await clientDoc.ref.update({
        gocardlessMandateStatus: mandateStatus,
        updatedAt: new Date().toISOString()
      });
      
      console.log(`Updated client ${clientDoc.id} mandate status to ${mandateStatus}`);
    } else {
      console.log(`Client with mandate ID ${mandateId} not found in database`);
    }
  } catch (error) {
    console.error('Error handling mandate event:', error);
  }
}

async function handleBankAccountEvent(event) {
  // Handle bank account events (e.g., verification, failure)
  console.log('Bank account event:', event.action, event.links.customer_bank_account);
}
