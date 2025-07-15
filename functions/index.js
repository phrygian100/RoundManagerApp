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

exports.sendTeamInviteEmail = onDocumentCreated("accounts/{accountId}/members/{memberId}", async (event) => {
  const snap = event.data;
  const context = event;
  console.log('sendTeamInviteEmail triggered', context.params, snap.data());

  const apiKey = process.env.RESEND_KEY;

  if (!apiKey) {
    console.error('No Resend API key found in environment!');
    return null;
  }

  const resend = new Resend(apiKey);

  const data = snap.data();
  if (!data || data.status !== 'invited') {
    console.log('Not an invite or wrong status');
    return null;
  }

  const email = data.email;
  const inviteCode = data.inviteCode;
  const accountId = context.params.accountId;

  if (!email || !inviteCode) {
    console.error('Missing email or inviteCode');
    return null;
  }

  const appUrl = process.env.APP_URL || 'http://localhost:8081'; // Default for local dev
  const inviteLink = `${appUrl}/enter-invite-code?code=${inviteCode}&account=${accountId}`;

  try {
    const result = await resend.emails.send({
      from: 'noreply@guvnor.app', // Use a verified sender from your Resend domain
      to: email,
      subject: 'You have been invited to join a team!',
      html: `<p>You have been invited! Click <a href="${inviteLink}">here</a> to join, or use code: <b>${inviteCode}</b></p>`
    });
    console.log('Resend API result:', result);
  } catch (err) {
    console.error('Failed to send invite email:', err);
  }

  return null;
});

exports.acceptTeamInvite = onCall(async (request) => {
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
    throw new functions.https.HttpsError('not-found', 'Invalid or expired invite code.');
  }

  const memberDocSnap = querySnap.docs[0];
  const memberData = memberDocSnap.data();
  const memberRef = memberDocSnap.ref;
  const accountId = memberRef.parent.parent.id;

  const newMemberRef = db.collection(`accounts/${accountId}/members`).doc(user.uid);
  await newMemberRef.set({
    ...memberData,
    uid: user.uid,
    email: user.email,
    status: 'active',
    inviteCode: null, // Clear the invite code
    joinedAt: new Date().toISOString(),
  });

  await memberRef.delete();

  return { success: true, message: 'Invite accepted successfully!' };
});

exports.listMembers = onCall(async (request) => {
  const user = request.auth;
  if (!user || !user.token.accountId) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated and have an account ID.');
  }

  const db = admin.firestore();
  const membersRef = db.collection(`accounts/${user.token.accountId}/members`);
  const snap = await membersRef.get();
  return snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
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
      }
    } catch (err) {
      console.error('refreshClaims: fallback query failed', err);
      // default to owner of own account if query fails
      accountId = user.uid;
      isOwner = true;
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
