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

  // Use environment variable for the API key
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

      // Create a new member document with the user's UID
      await db.collection(`accounts/${accountDoc.id}/members`).doc(user.uid).set({
        ...memberData,
        uid: user.uid,
        email: user.email,
        status: 'active',
        inviteCode: null, // Clear the invite code
        joinedAt: new Date().toISOString(),
      });

      // Mark the original invite as used
      await memberDocRef.update({ status: 'used' });

      return { success: true, message: 'Invite accepted successfully!' };
    }
  }

  throw new functions.https.HttpsError('not-found', 'Invalid or expired invite code.');
});
