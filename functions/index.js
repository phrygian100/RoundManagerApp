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
  const accountsCol = db.collection('accounts');
  const accountsSnap = await accountsCol.get();

  for (const accountDoc of accountsSnap.docs) {
    const memberDocRef = db.collection(`accounts/${accountDoc.id}/members`).doc(inviteCode);
    const memberDocSnap = await memberDocRef.get();

    if (memberDocSnap.exists() && memberDocSnap.data().status === 'invited') {
      const memberData = memberDocSnap.data();

      const newMemberRef = db.collection(`accounts/${accountDoc.id}/members`).doc(user.uid);
      await newMemberRef.set({
        ...memberData,
        uid: user.uid,
        email: user.email,
        status: 'active',
        inviteCode: null, // Clear the invite code
        joinedAt: new Date().toISOString(),
      });

      await memberDocRef.delete();

      return { success: true, message: 'Invite accepted successfully!' };
    }
  }

  throw new functions.https.HttpsError('not-found', 'Invalid or expired invite code.');
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
  const accountsSnap = await db.collectionGroup('members').where('uid', '==', user.uid).get();

  if (accountsSnap.empty) {
    return { success: false, message: 'User not found in any team.' };
  }

  const memberDoc = accountsSnap.docs[0];
  const accountId = memberDoc.ref.parent.parent.id;
  const isOwner = memberDoc.data().role === 'owner';

  await admin.auth().setCustomUserClaims(user.uid, { accountId, isOwner });

  return { success: true, message: 'Claims refreshed.' };
});
