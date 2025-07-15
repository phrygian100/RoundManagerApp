# Changelog (condensed on 2025-07-08)

This file tracks **major** functional changes, bug fixes and architectural decisions.
For full debugging notes see project history; this file now focuses on high-level milestones.

---

## 2025-07-15 - Hotfix: Team Management Regression

- **Issue**: Team members page was failing to load due to a regression from the Firebase migration. `refreshClaims` function was failing, preventing auth claims from being set.
- **Root Cause**: A Firestore index was missing for the `members` collection group query within the `refreshClaims` function.
- **Fix**: Added the required `COLLECTION_GROUP` index to `firestore.indexes.json` and deployed it. This resolves the 500 error on `refreshClaims` and subsequent 401 errors on `listMembers` and `listVehicles`.

**Files modified**: `firestore.indexes.json`

---

## 2025-07-15 – Invite Member Email Cloud Function Fix 📧🔧
• **Problem**: The `sendTeamInviteEmail` Firebase Cloud Function had a hardcoded URL for the invitation link, and was missing a clear way to handle different deployment environments (local, production).
• **Fix**: Modified the Cloud Function in `functions/index.js` to use a new `APP_URL` environment variable to construct the invite link. This makes the function portable across environments. A default of `http://localhost:8081` is used if the variable is not set.
• **Action Required**: To make the invite email system fully functional, two environment variables **must be set** for the `sendTeamInviteEmail` Cloud Function in your Google Cloud project:
    - `RESEND_KEY`: Your API key for the Resend email service.
    - `APP_URL`: The public base URL of your deployed application (e.g., `https://your-app.vercel.app`).
• **Result**: The function is no longer dependent on hardcoded values and can be configured for any environment.

**Files modified**: `functions/index.js`.

---

## 2025-01-21 – Invite Member Email Configuration FIXED ✅
• **RESOLVED**: Fixed invite member emails failing due to unverified domain configuration.  
• **Root Cause**: Edge function was falling back to hardcoded `tgmwindowcleaning.co.uk` domain when `EMAIL_FROM` environment variable was missing, causing Resend API to reject emails with "domain not verified" error.  
• **Configuration Fix**: Updated `EMAIL_FROM` secret in Supabase to use verified `guvnor.app` domain (`no-reply@guvnor.app`).  
• **Code Enhancement**: Replaced silent fallback behavior with explicit validation - function now throws clear errors when required environment variables (`EMAIL_FROM`, `RESEND_API_KEY`) are missing.  
• **Fail-Fast Implementation**: Added startup validation to prevent configuration regressions and ensure proper error reporting.  
• **Result**: Team member invitations now send emails successfully and provide clear error messages when misconfigured.  

**Files modified**: `supabase/functions/invite-member/index.ts`.

---

## 2025-01-21 – Team Invitation Duplicates FIXED ✅
• **RESOLVED**: Fixed duplicate team member invitations appearing in UI without email being sent.  
• **Root Cause**: Race condition between Supabase edge function and Firestore fallback, plus missing duplicate prevention.  
• **UI Fix**: Added double-tap prevention and improved error handling with proper loading states.  
• **Edge Function Fix**: Changed from `upsert` to `insert` with explicit duplicate checking in Supabase members table.  
• **Client Logic Fix**: Added pre-invitation duplicate checking and smarter fallback that detects partial edge function success.  
• **Result**: Team invitations now work reliably - no more duplicates, proper error messages, and email delivery confirmation.  
• **Enhanced Logging**: Added comprehensive console logging to debug invitation flow issues.  

**Files modified**: `app/(tabs)/team.tsx`, `services/accountService.ts`, `supabase/functions/invite-member/index.ts`.

---

## 2025-01-21 – Password Reset Flow FINALLY RESOLVED ✅🥕  
• **FINAL FIX**: Eliminated race condition between password reset flow detection and signup flow fallback.  
• **Root Cause**: Even with correct routing and token handling, signup verification fallback was still overriding password reset detection.  
• **Solution**: Completely removed problematic signup flow fallback logic when on `/set-password` route.  
• **Key Change**: Now defaults to password reset form when user has session on `/set-password` route, eliminating the "Thank you! Your account has been verified" false positive.  
• **Enhanced Error Handling**: Added proper Supabase error parsing for expired tokens with user-friendly messages.  
• **Result**: Password reset flow now works 100% reliably - users see the actual password reset form, not signup verification messages.  
• **Testing**: Confirmed with fresh tokens (<1 minute old) that flow detection works correctly every time.

**Files modified**: `app/set-password.tsx` - removed signup fallback detection, improved error handling.

---

## 2025-01-17 – Password Reset 404 RESOLVED ✅
• **RESOLVED**: Fixed password reset 404 errors by implementing proper static routing configuration for Expo web builds.  
• **Root Cause**: Expo static builds don't handle client-side routing properly - routes like `/set-password` returned 404.  
• **Solution**: Added `vercel.json` with SPA routing redirects and `public/_redirects` fallback configuration.  
• **Key Fix**: All routes now properly serve `index.html` allowing client-side routing to handle the actual navigation.  
• **Updated Configuration**: Enhanced `app.json` with `publicPath` and `assetBundlePatterns` for better static build handling.  
• **Result**: Password reset flow now works end-to-end - users can click email links and successfully reset passwords.  
• **Testing**: Verify by requesting password reset and clicking email link - should now load set-password page instead of 404.

**Files modified**: `vercel.json` (new), `public/_redirects` (new), `app.json`, routing configuration.

---

## 2025-01-17 – Password Reset Troubleshooting 🔧❌
• **EXTENSIVE** password reset debugging and enhancement work performed.  
• **Enhanced token handling**: Updated both React Native and Next.js apps to properly handle hash-based password reset tokens (`#access_token=...&type=recovery`).  
• **Session conflict resolution**: Added logic to clear existing sessions when processing password reset flows.  
• **URL configuration fixes**: Corrected Supabase redirect URLs from `www.guvnor.app` to `guvnor.app` in dashboard settings.  
• **Auth guard improvements**: Enhanced `_layout.tsx` to prevent interference with password reset flows.  
• **Dual-format support**: Made `/set-password` handle both query parameters and hash-based tokens.  
• **Cross-platform compatibility**: Fixed both mobile and web password reset implementations.  
• **RESOLVED ABOVE**: 404 errors fixed with proper routing configuration.  

**Files modified**: `app/set-password.tsx`, `web/src/app/set-password/page.tsx`, `app/forgot-password.tsx`, `web/src/app/forgot-password/page.tsx`, `app/_layout.tsx`, Supabase dashboard configuration.

---

## 2025-07-08 – Registration & Login Flow (Web) ✅
• `set-claims` edge function now auto-creates an **owner member record** after `USER_CREATED`, fixing "client list not loading" for new users.  
• Supabase **Site URL/Redirects** corrected, email verification link now lands on `guvnor.app` without SSL/404 errors.  
• Added web-friendly `window.alert` feedback on login for unverified accounts.  
• Registration defaults to **Provider** role.

Files: `supabase/functions/set-claims/index.ts`, `app/register.tsx`, `app/login.tsx`, Supabase project settings.

---

## 2025-07-04 – CSV Import (Web) 📑
• Rewritten file-picker flow for web; replaced `Alert.alert` prompts with standard `window.alert/confirm`.  
• Example CSV regenerated (200 rows, dd/mm/yyyy).  
• Import succeeds and creates clients; TODO: auto-generate jobs after import.

Files: `app/(tabs)/settings.tsx`, `scripts/generate-clients.js`, `docs/example-clients.csv`.

---

## 2025-07-03 – Vehicles, Rota & Capacity-Aware Runsheets 🚐🗓️
Phase 1 – Vehicle CRUD + member assignment.  
Phase 2 – **Rota** availability screen (7-day grid, on/off/n/a).  
Phase 3 – Runsheet groups jobs by **vehicle capacity**: effective cap = `dailyRate × (availableCrew / totalCrew)`.

Fallback: if no vehicles/rota configured the runsheet reverts to legacy list view.

Key files: `services/vehicleService.ts`, `services/rotaService.ts`, `app/rota.tsx`, `app/runsheet/[week].tsx`.

---

## 2025-07-01/02 – Runsheet Access & Member Removal
• Fixed incorrect `router.replace` path and removed redundant PermissionGate – runsheet now always loads for owners.  
• Home buttons render dynamically from **session perms**; members see only pages they can access.  
• Removing a member fully cleans up Firestore + Supabase rows and resets their JWT claims; *Leave Team* self-service button added (pending further backend edge-function work).

Files: `app/runsheet.tsx`, `app/(tabs)/index.tsx`, `services/accountService.ts`, `supabase/functions/set-claims/index.ts`.

---

## 2025-01-30 – Invitation & Data Ownership System ✅
• Standardised env vars (`SUPABASE_SERVICE_ROLE_KEY`), added `members` table migration.  
• Invitation flow (edge functions + Resend) now operates end-to-end.  
• Introduced `getDataOwnerId()` – members now query owner's data across services/pages.  
• Added Supabase→Firestore sync for team list.

Main files: `supabase/functions/*`, `services/accountService.ts`, `core/supabase.ts`.

---

## 2025-01-15 – Round Order Manager 🔄
• Replaced custom FlatList with **@quidone/react-native-wheel-picker** on mobile; arrow-key navigation on web.  
• Complete logic rewrite: INSERT / MOVE / ARCHIVE maintain a continuous, gap-free sequence.  
• Added batch updates to guarantee no duplicate `roundOrderNumber`.

File: `app/round-order-manager.tsx`.

---

## 2025-01-07 – Owner Access & Deployment Issues 🔧
• Resolved white-screen bug blocking owners – simplified imports, owner-first logic (`isOwner || viewRunsheet`).  
• Fixed Vercel deployment (duplicate projects, output dir, build rules).  
• Permission system unified into 3 keys (`viewClients`, `viewRunsheet`, `viewPayments`) and applied via common `PermissionGate`.

Files: `app/runsheet.tsx`, Vercel config.

---

## 2025-01-02 – Permission Notifications & CORS
• Edge function `set-claims` given CORS headers; real-time permission change notifications now delivered & session refreshed.  
• Refactored runsheet/workload-forecast pages to a single PermissionGate pattern; removed legacy redirects.

---

Historic entries prior to 2025-01-02 have been archived in the repo history.

---

## 2025-07-10 – UX & Auth Polishing ✨
• Added build indicator on Login screen (`Build: <commit>` – uses NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA).  
• Home screen now shows logged-in user email.  
• Auth guard updated so `/set-password` & `/forgot-password` stay accessible after session creates – fixes reset-password redirect loop.  
• Duplicate team-member/rota rows fixed: placeholder Firestore doc deleted once invite accepted.  
• Registration form gains confirm-password field with paste blocked, validation added.  
• Forgot-password flow implemented (`/forgot-password` screen + Supabase resetPasswordForEmail).  
Files: `app/_layout.tsx`, `app/login.tsx`, `app/(tabs)/index.tsx`, `app/register.tsx`, `app/forgot-password.tsx`, `services/accountService.ts`.

---

## 2025-01-16 – Build Tracking & Password Reset Fix 🔧
• **Build indicator finally working** – implemented automated git commit hash injection via `prebuild` script.  
• Fixed password reset flow redirect URL – was pointing to homepage instead of `/set-password`.  
• Added debug console logging to auth state changes for troubleshooting.  
• Build ID now updates automatically on every deployment, showing current commit hash.

Files: `app/login.tsx`, `app/forgot-password.tsx`, `app/_layout.tsx`, `scripts/update-build-id.js`, `package.json`.

---

## 2025-07-10 – Redirect After Payment Save

## Summary
Implemented logic so that after saving a payment from the 'Create Payment from Job' window, the user is redirected to the screen they were on before this one. This is achieved by passing a 'from' parameter when navigating to the add-payment screen and using it for redirection after saving. Fallback to previous logic if 'from' is not provided.

## Files Changed
- app/add-payment.tsx
- app/payments-list.tsx
- app/(tabs)/clients/[id].tsx
- app/completed-jobs.tsx
- app/client-balance.tsx

## Details
- Updated all navigation to `/add-payment` to include a `from` parameter representing the current route.
- Modified the save payment logic in `add-payment.tsx` to check for the `from` parameter and redirect the user back to that route after saving, otherwise fallback to the previous logic.
- Ensured compatibility for both web and native platforms.

---

## 2025-07-14  
- Documented Firebase configuration now supplied via Vercel environment variables  
  (`EXPO_PUBLIC_FIREBASE_*`).  No runtime code was changed; this commit is only to
  force a new deployment and confirm the build succeeds after the env-vars update.

### 🔧 Hotfix (same day)
- Added `FIREBASE_CONFIG` constant in `config.ts` (and example file) so web builds
  receive the injected env-vars and Firebase initialises correctly. Fixes Vercel
  build error: `Firebase: Need to provide options (app/no-options)`.

### 🔧 Follow-up validation
- Updated both `core/firebase.ts` and `core/firebase.web.ts` to validate **all** six
  Firebase config fields at startup and throw a descriptive error listing any
  missing keys. This provides faster, clearer feedback during CI builds.

### 🐛 Build debug
- Augmented `scripts/update-build-id.js` to log presence (not values) of the six
  `EXPO_PUBLIC_FIREBASE_*` variables during the **prebuild** step. This will help
  verify whether Vercel is actually injecting them.

### 🔧 Env-var linkage note  
Linked the six `EXPO_PUBLIC_FIREBASE_*` variables to the **RoundManagerApp** project in Vercel so they propagate to build-time processes.

---

## 2025-07-14 – Initial Firestore Security Rules 🔒
• Added `firestore.rules` with per-user access control for the `users/{uid}` document.
• Provides minimal permissions required for registration write to succeed after Firebase auth.

Files: `firestore.rules`.

---

## [DATE] Multi-line Quote Support
- Refactored quote creation modal and data model (`app/quotes.tsx`) to support multiple quote lines per client.
- Each quote can now have multiple lines, each with service type, frequency, value, and notes.
- Updated Quote type and UI to allow adding/removing lines.
- Updated context (`contexts/QuoteToClientContext.tsx`) to support passing an array of quote lines.
- Preserved backward compatibility for existing single-line quotes.
- Updated all relevant UI to display all quote lines.

---

(Last condensed: 2025-07-08)

- Updated `app/quotes.tsx`:
  - Implemented a two-column layout for the Quotes screen on web (Scheduled/Pending left, Complete right).
  - Added a search input to the Complete section, filtering by name and address.
  - On mobile, retained the original stacked layout with the new search for Complete.
  - The UI is now responsive and adapts based on platform.

## 2025-07-14 – Build retry
Triggered a rebuild to verify Vercel now receives the `EXPO_PUBLIC_FIREBASE_*` variables after updating them to "All Environments" in the dashboard. No functional code changes.

- Added verification email sending in `app/register.tsx` (Firebase `sendEmailVerification`).

- Added `/users/{uid}` rule to Firestore security rules so registration can write user doc.

- Switched `app/login.tsx` from Supabase to Firebase `signInWithEmailAndPassword` with email-verification check and detailed error handling.

- Migrated HomeScreen `(tabs)/index.tsx` to Firebase auth & Firestore; shows full menu again.

- HomeScreen now waits for Firebase auth state before building buttons to avoid blank screen on fast page load.

- Settings logout now signs out via Firebase `signOut` (plus Supabase fallback) so user can log out on new auth system.

---
## 2025-07-14 – Logout Redirect Fix 🔓
• **Problem**: Clicking "Log Out" on Settings redirected to `/login` before Firebase finished clearing the session. Root auth guard saw an active session and bounced back to `/`, leaving the user stuck logged in.
• **Fix**: Removed manual `router.replace('/login')` call. We now rely on `onAuthStateChanged` in `app/_layout.tsx` to detect sign-out and route unauthenticated users to `/login`, eliminating the race condition.
• **Files modified**: `app/(tabs)/settings.tsx`.

---
## 2025-07-14 – Registration Requires Email Verification 📧
• **Problem**: Newly registered users were signed in immediately and routed to the home page, skipping email verification.
• **Fix**: After sending the verification email and creating the Firestore user doc, the app now signs the user out and redirects them to `/login` with instructions to verify their email.
• **Files modified**: `app/register.tsx`.

---
## 2025-07-14 – Confirm Password + Firebase Reset Email
• **Registration UX**: Added *Full Name* and *Contact Number* fields, plus Confirm Password (paste blocked on web) with validation to ensure all fields are completed and passwords match.
• **Forgot Password**: Switched to Firebase `

---
## 2025-07-14 – Email Sending Flow Consolidated ✉️
• **Auth-Related Mail** (verification & password reset) now uses Firebase’s built-in templates. Sender address updated in Firebase console to `noreply@guvnor.app` – allow 24-48 h for DNS propagation.
• **Team Invitations** continue to be sent via Resend from the Supabase edge function `invite-member`. Environment variables `EMAIL_FROM` & `RESEND_API_KEY` must be configured in Supabase.
• No other parts of the codebase reference Resend.

---

## 2025-07-15 - Firestore Index Configuration Fix

- **Issue**: Deployment of indexes failed due to invalid single-field index definition for members.uid.
- **Fix**: Removed the redundant single-field index from firestore.indexes.json, as single-field indexes are managed automatically. Deployed the updated configuration successfully.
- **Note**: To fully resolve, remove any existing single-field exemption for members.uid in the Firestore console to allow auto-creation of the index.

**Files modified**: firestore.indexes.json

---

## [DATE: YYYY-MM-DD] Remove all remaining Supabase code, 100% Firebase

- Deleted all Supabase client code from the web app and shared code.
- Removed all Supabase imports/usages from password reset, invite, and admin flows.
- Added TODOs to implement password reset, invite, and admin flows with Firebase.
- Project is now 100% Firebase for all authentication, user, and data logic.

## 2024-07-14

- Updated `app/add-client.tsx` to use `await getDataOwnerId()` for `ownerId` when creating clients, ensuring strict Firestore rules compliance. Added error handling for missing ownerId.
- Updated `app/runsheet/[week].tsx` to include `ownerId` using `await getDataOwnerId()` in client creation logic, with error handling for missing ownerId.
- Updated `app/(tabs)/settings.tsx` to ensure all client import logic uses `await getDataOwnerId()` for `ownerId` and handles missing ownerId with an error message.
- These changes ensure that all client creation operations comply with Firestore security rules requiring `ownerId` to match the authenticated user's UID.

- Migrated invite email flow from Supabase Edge Functions to Firebase Cloud Functions v2 (Node.js 22+).
- Implemented invite email sending using the Resend API, with domain and sender verified.
- Updated Firestore rules for strict access and team member invites.
- Refactored the invite acceptance frontend to work with the new Firestore invite flow.
- Troubleshot Cloud Functions v2 environment variable issues: attempted to use `functions.config()`, `getConfig()`, and finally `process.env.RESEND_KEY`.
- Blocked by Firebase CLI not supporting `--update-env-vars` for v2 functions in the current environment, preventing the Resend API key from being set as an environment variable.
- All code changes are committed and pushed to the repository. Function code is ready for deployment once CLI or environment variable issue is resolved.

## 2025-07-15 - Invite Acceptance Refactor

- **Issue**: acceptTeamInvite was inefficiently scanning all accounts; failing to find fresh invites.
- **Fix**: Refactored to use collectionGroup query on members with inviteCode and status filters. Added composite index to firestore.indexes.json and deployed.

**Files modified**: functions/index.js, firestore.indexes.json

---

## 2025-07-16 - Fixed Persistent Invite Member Flow with Full Firebase Implementation

- Implemented seamless invite flow for new and existing users using Firebase Auth and Cloud Functions.
- New users receive a password set link and auto-join after setting password.
- Existing users receive a code to enter after login.
- Updated frontend screens to handle query params and improve UX.

**Files modified**: functions/index.js, services/accountService.ts, app/set-password.tsx, app/enter-invite-code.tsx

---

## 2025-07-16 - Fixed Settings Redirect, Invite Errors

- Added loading state in root layout to prevent auth race redirects.
- Enhanced logging in cloud functions for invite flow.
- Added UID check in acceptance to prevent mismatches.
- Improved error messages in frontend.

**Files modified**: app/_layout.tsx, functions/index.js, app/(tabs)/team.tsx, app/enter-invite-code.tsx

---

## 2025-07-18 - Temporary Fix for Invite Member Email

- **Issue**: Invite emails broken due to missing RESEND_KEY and APP_URL environment variables in production.
- **Temporary Fix**: Added fallback values in code for RESEND_KEY (using provided key) and APP_URL ('https://guvnor.app') to enable functionality.
- **Note**: This is temporary; set these variables properly in Google Cloud Console > Cloud Functions > inviteMember > Runtime > Environment variables, then remove the hardcodes from code and redeploy for security.
- Deployed the updated function.

**Files modified**: functions/index.js

---

## 2025-07-18 - Fixed Invite Code Input Validation

- **Issue**: Users were getting "Invalid or expired invite code" errors when entering invite codes with trailing punctuation (e.g., "353384." instead of "353384").
- **Root Cause**: The acceptTeamInvite function was searching for exact matches, but users were accidentally adding periods or other punctuation.
- **Fix**: 
  - Added input sanitization to remove trailing punctuation before submitting
  - Restricted input to numeric characters only with keyboardType="numeric"
  - Added validation to ensure only valid numeric codes can be submitted
  - Improved error messaging for invalid codes
- **Result**: Users can no longer accidentally enter invalid characters, preventing the error.

**Files modified**: app/enter-invite-code.tsx

---

## 2025-07-18 - Fixed Undefined Email Error in acceptTeamInvite

- **Issue**: When accepting team invites, users were getting "INTERNAL" error due to undefined email in Firebase Auth context.
- **Root Cause**: The acceptTeamInvite function was trying to use `user.email` from Firebase Auth, which can be undefined for some authentication methods.
- **Fix**: Changed to use `memberData.email` (which was stored during invite creation) as the primary source, falling back to `user.email` only if needed.
- **Result**: Team invitations now work properly even when Firebase Auth doesn't provide the email in the auth context.

**Files modified**: functions/index.js

---