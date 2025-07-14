# Handover: Invite Email Flow Migration (2025-07-14)

## Context
- The project previously used Supabase Edge Functions and Resend for sending team invite emails.
- The invite flow has been migrated to Firebase Cloud Functions v2 (Node.js 22+) and Firestore.
- The Resend domain and sender are verified and working for manual/API tests.

## Current State
- The invite email function is implemented in `functions/index.js` using the Resend Node.js SDK.
- The function is triggered on Firestore document creation at `accounts/{accountId}/members/{memberId}` with `status: 'invited'`.
- The function expects the Resend API key to be available as an environment variable: `process.env.RESEND_KEY`.
- All Firestore rules and frontend logic for invite acceptance are in place and tested.

## Blocker
- The Firebase CLI in the current environment does **not support** the `--update-env-vars` flag, which is required to set environment variables for Cloud Functions v2.
- Attempts to use `functions.config()`, `getConfig()`, and other config APIs do **not work** in v2 runtime.
- As a result, the function cannot access the Resend API key at runtime, and emails are not sent.

## What Needs to Be Done
1. **Update the Firebase CLI** to the latest version (if not already).
2. **Set the RESEND_KEY environment variable** for the function using a supported method:
   - If CLI supports: `firebase deploy --only functions:sendTeamInviteEmail --update-env-vars RESEND_KEY="..."`
   - If not, set the variable via the Google Cloud Console (Cloud Functions > Environment Variables) or use `gcloud` CLI.
3. **Verify the function picks up the environment variable** and that invite emails are sent via Resend.
4. **Check Resend logs and email delivery.**

## References
- All code changes are documented in `docs/code-changes.md`.
- The function code is in `functions/index.js`.
- The Resend API key is stored securely and should not be committed to source control.

## Contact
- For further troubleshooting, consult Firebase and Google Cloud documentation on [Cloud Functions v2 environment variables](https://firebase.google.com/docs/functions/config-env). 