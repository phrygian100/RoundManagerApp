/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onDocumentCreated, getConfig } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const admin = require("firebase-admin");
const { Resend } = require("resend");

admin.initializeApp();

setGlobalOptions({ maxInstances: 10 });

exports.sendTeamInviteEmail = onDocumentCreated("accounts/{accountId}/members/{memberId}", async (event) => {
  const snap = event.data;
  const context = event;
  console.log('sendTeamInviteEmail triggered', context.params, snap.data());

  // Use the v2 config API to get the key
  const config = getConfig();
  const apiKey = config.resend?.key;

  if (!apiKey) {
    console.error('No Resend API key found in config!');
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

  const inviteLink = `https://yourapp.com/enter-invite-code?code=${inviteCode}&account=${accountId}`;

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
