## 2025-06-30
- Fixed invite-member function:
  - Accept provided inviteCode fallback.
  - Handle `email_exists` by fetching existing user, upserting member row, and sending custom invite email via Resend.
  - Added dynamic CORS headers helper.
- Added `enter-invite-code` screen and removed invitation field from registration.

Redeployed invite-member (version 10) after patch to handle `email_exists` properly and send Resend email.

## 2025-06-30 (second patch)
- Replaced deprecated `getUserByEmail` call in invite-member Edge Function with manual lookup via `admin.listUsers` to prevent runtime TypeError.
- Manually redeployed `invite-member` function via Supabase CLI to ensure the fix went live, as Vercel builds do not automatically deploy Edge Functions.
- Added robust error handling and logging to diagnose silent failures in the Edge Function, revealing that the `listUsers` call was failing and returning an empty error object.
- Threw a new, explicit Error when `listUsers` fails to ensure proper logging. 