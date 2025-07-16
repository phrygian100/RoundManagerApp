# Changelog (condensed on 2025-07-08)

This file tracks **major** functional changes, bug fixes and architectural decisions.
For full debugging notes see project history; this file now focuses on high-level milestones.

---

## 2025-01-26 - CSV Import Enhancements & Client List Display Fix

### Bug Fixes:
1. **Enhanced CSV Import Error Reporting**: CSV import now shows specific row details when rows are skipped instead of just a count
2. **Fixed Double RWC Prefix Issue**: Resolved issue where account numbers were getting "RWC" prefix applied twice during CSV import
3. **Mobile Number Formatting**: CSV import now automatically adds leading "0" to UK mobile numbers that are missing it
4. **Client List Next Visit Display**: Fixed issue where "Next Visit: N/A" was showing in clients list even when jobs existed

### Implementation Details:

**Improved Error Reporting (`app/(tabs)/settings.tsx`)**:
- Added row identifiers (Name, Account Number, or Row number) to skipped row tracking
- Enhanced error messages to show up to 5 specific failed rows with reasons
- Displays format: "• Client Name: Missing Address Line 1, Quote (£)"
- Shows "... and X more" when more than 5 rows are skipped
- Applied consistently across all three import paths (web CSV, mobile CSV, mobile Excel)

**RWC Prefix Logic Fix (`app/(tabs)/settings.tsx`)**:
- Replaced conditional check with proactive cleanup approach
- New logic removes any existing "RWC" prefix first, then adds clean prefix
- Prevents duplicate prefixes regardless of input data format
- Uses case-insensitive regex `/^RWC/i` for robust detection
- Applied consistently across all three import paths

**Mobile Number Formatting (`app/(tabs)/settings.tsx`)**:
- Added `formatMobileNumber()` helper function for UK mobile number processing
- Automatically adds leading "0" to 10-digit numbers that don't start with "0"
- Handles numbers like "7795324567" → "07795324567" 
- Applied to all three CSV import paths (web CSV, mobile CSV, mobile Excel)
- Preserves original input if already formatted or invalid length

**Client List Display Fix (`app/clients.tsx`)**:
- Added `useFocusEffect` to refresh next visit data when screen gains focus
- Extracted `fetchNextVisits` function for reusable next visit fetching
- Added comprehensive debug logging to troubleshoot data fetching issues
- Ensures next visit display stays synchronized with job updates

### Technical Improvements:
- **Better UX**: Users can now identify exactly which data rows need to be fixed
- **Robust Processing**: Account number processing now handles any edge cases with existing prefixes
- **Consistent Logic**: All import paths (web/mobile, CSV/Excel) use identical processing logic

### Files Modified:
- `app/(tabs)/settings.tsx` - Enhanced error reporting, RWC prefix logic, and mobile number formatting
- `app/clients.tsx` - Fixed next visit display synchronization with focus refresh
- `utils/account.ts` - Fixed double RWC prefix display issue 
- `docs/code-changes.md` - Documentation update

**Impact**: Significantly improves CSV import debugging experience, eliminates account number formatting issues, ensures proper UK mobile number formatting, and keeps client list display synchronized with job updates.

---

## 2025-01-24 - Comprehensive CSV Import Enhancement & Flexible Visit Frequency System

### Major Features Added:
1. **Enhanced CSV Import Fields**: Added support for "Runsheet Note" and "Account notes" columns in CSV imports
2. **Automatic RWC Prefix**: Account numbers from CSV automatically get "RWC" prefix if not already present
3. **Flexible Visit Frequency**: Complete overhaul of visit frequency system to support any number of weeks (not just 4, 8, one-off)
4. **Updated Client Forms**: Add-client form now uses text input + checkbox for flexible frequency input
5. **Enhanced Quote System**: Quote forms support expanded frequency options (4, 8, 12, 16, 24, 52 weekly, one-off, Other)

### Implementation Details:

**CSV Import Enhancements (`app/(tabs)/settings.tsx`)**:
- Added "Runsheet Note" field mapping for direct import to client.runsheetNotes
- Added "Account notes" field with automatic attribution ("CSV Import", system authorId)
- Implemented automatic RWC prefix addition for account numbers
- Enhanced visit frequency processing to accept any positive number or "one-off"
- Updated all three import paths (web CSV, mobile CSV, mobile Excel) with consistent logic
- Made Email and Mobile Number optional fields for CSV import

**Flexible Visit Frequency System**:
- **Client Forms**: Replaced hardcoded dropdowns with text input + one-off checkbox
- **Quote System**: Extended frequency options and added "Other" with custom text input
- **Type System**: Updated QuoteLine types to support customFrequency field
- **Job Generation**: Verified existing logic already handles any numeric frequency correctly

**Updated Example Data (`scripts/generate-clients.js`)**:
- Generated new example CSV with 200 clients showing varied frequencies (4, 6, 8, 12, 16, 24, one-off)
- Included sample runsheet notes (every 5th client) and account notes (every 7th client)
- Demonstrates the full flexibility of the new import system

### Technical Improvements:
- **Backward Compatibility**: All changes maintain compatibility with existing client data
- **Data Validation**: Enhanced validation for flexible frequency input across all forms
- **User Experience**: Improved form UI with clear frequency input and one-off toggle
- **Import Robustness**: Better error handling and data sanitization in CSV processing

### Files Modified:
- `app/(tabs)/settings.tsx` - Core CSV import enhancements
- `app/add-client.tsx` - Flexible frequency form with text input + checkbox
- `app/quotes.tsx` - Extended frequency options with custom input
- `app/runsheet/[week].tsx` - Enhanced quote progression modal frequencies
- `contexts/QuoteToClientContext.tsx` - Updated QuoteLine type
- `scripts/generate-clients.js` - New example CSV with enhanced fields
- `docs/example-clients.csv` - Generated with new format

**Breaking Changes**: None - all changes are backward compatible

**Impact**: This enhancement significantly improves CSV import capabilities and visit frequency flexibility, supporting any business model (weekly, bi-weekly, monthly, quarterly, etc.) while maintaining full compatibility with existing data.

---

## 2025-01-21 - Critical Team Member System Fixes

- **Issues Fixed**: Multiple critical issues with team member system after Firestore migration:
  - Removed members were reappearing when navigating away/back
  - Owner had a remove button (which shouldn't exist)
  - Members couldn't see owner's data (permissions broken)
  - Members could access restricted screens (team management)
  - Member UI buttons not updating correctly
  - First navigation from home screen redirected back
  
- **Root Causes**:
  1. **Member removal**: Only deleted member record, didn't reset user's accountId
  2. **UI logic**: Remove button shown for all members including owner
  3. **Permissions**: Member's accountId not properly set or user doc missing
  4. **State management**: Settings screen not refreshing on focus
  5. **Navigation**: Race condition with async permission checks
  
- **Fixes Implemented**:
  1. **Created removeMember cloud function**: Properly handles member removal, resets their accountId and claims
  2. **Updated UI logic**: Hide remove button for owners
  3. **Enhanced listMembers**: Ensures owner record always exists
  4. **Added useFocusEffect**: Settings screen reloads member status on focus
  5. **Navigation debounce**: Prevents immediate redirects from home screen
  6. **Improved error handling**: Better user document creation/update logic

- **Result**: Team member system now works correctly:
  - Members properly see owner's data based on permissions
  - UI correctly reflects member vs owner status
  - No more reappearing removed members
  - Smooth navigation without redirects

**Files modified**:
- functions/index.js (added removeMember, updated listMembers)
- services/accountService.ts (updated removeMember to use cloud function)
- app/(tabs)/team.tsx (hide remove button for owners)
- app/(tabs)/settings.tsx (added useFocusEffect to reload member status)
- app/(tabs)/index.tsx (added navigation debounce)
- core/session.ts (removed debug logs)

---

## 2025-01-21 - Critical Bug Fixes for Navigation, Permissions, and Payments

### Issues Fixed:
1. **Navigation Bug**: Users were being redirected back to home screen after logging in and navigating to another page
2. **Archive Client Permissions**: Members with viewClients permission couldn't archive clients
3. **Payment Permissions Error**: "Missing or insufficient permissions" error when adding payments

### Root Causes:
1. **Navigation**: `onAuthStateChanged` was re-triggering on every pathname change, causing unwanted redirects
2. **Archive**: No permission checks in place for archive functionality 
3. **Payments**: `add-payment.tsx` wasn't filtering clients by ownerId

### Solutions Implemented:
1. **Navigation Fix**: Separated auth listener from pathname-based redirect logic in `app/_layout.tsx`
   - Auth listener runs only once on mount
   - Redirect logic checks both auth state and pathname in separate effect
   - Prevents race conditions and unwanted redirects

2. **Archive Permissions**: Added comprehensive permission checking in `app/(tabs)/clients/[id].tsx`
   - Verifies user session before archiving
   - Checks if member has viewClients permission
   - Added detailed error messages for permission issues
   - Better logging for debugging

3. **Payment Permissions**: Updated `app/add-payment.tsx` to properly filter clients
   - Added `getDataOwnerId()` call to get correct account owner
   - Filter clients query by ownerId
   - Proper error handling if ownerId cannot be determined

**Files modified**:
- app/_layout.tsx
- app/(tabs)/clients/[id].tsx  
- app/add-payment.tsx

---

## 2025-01-21 - Fixed Vehicle Modal, DatePicker Web Support, and Quote Permissions

### Issues Fixed:
1. **Vehicle Modal Missing Close Button**: Added a close button (×) to the vehicle management modal header
2. **DateTimePicker Not Supported on Web**: Implemented platform-specific date picker for job moving in runsheet
3. **Quote Creation Permission Error**: Fixed missing ownerId field causing Firestore permission errors

### Solutions:
1. **Vehicle Modal**: 
   - Added modal header with close button
   - Improved modal structure and styling
   - Files: `app/(tabs)/team.tsx`

2. **Web DatePicker**:
   - Created web-specific modal with HTML date input
   - Kept native DateTimePicker for mobile platforms
   - Fixed vh units that aren't supported in React Native
   - Files: `app/runsheet/[week].tsx`

3. **Quote Permissions**:
   - Added ownerId field to quote documents on creation
   - Updated all quote fetching to filter by ownerId
   - Ensures proper Firestore rule compliance
   - Files: `app/quotes.tsx`

**Files modified**:
- app/(tabs)/team.tsx
- app/runsheet/[week].tsx
- app/quotes.tsx

---

## 2025-01-21 - Comprehensive Notes System Overhaul

### Features Added:
1. **Quote Notes Field**: Added a notes field to the new quote form that persists through the quote lifecycle
2. **Separated Note Types**: Distinguished between "runsheet notes" (appear on job ! icon) and "account notes" (timestamped history)
3. **Account Notes System**: Implemented running notes list with author tracking and timestamps
4. **Quote-to-Client Notes Transfer**: Quote notes automatically become first account note when creating client

### Implementation Details:

1. **Quote Notes**:
   - Added notes field to quote form and data model
   - Notes display in quote cards throughout lifecycle (scheduled → pending → complete)
   - Files: `app/quotes.tsx`

2. **Note Type Separation**:
   - Renamed client.notes to client.runsheetNotes for clarity
   - Added migration logic for existing notes
   - Updated runsheet to use both legacy and new field names
   - Files: `types/client.ts`, `app/runsheet/[week].tsx`, `app/(tabs)/clients/[id].tsx`

3. **Account Notes**:
   - New AccountNote type with id, date, author, authorId, and text
   - Account notes display chronologically with author and timestamp
   - Modal for adding new notes with automatic user attribution
   - Files: `types/client.ts`, `app/(tabs)/clients/[id].tsx`

4. **Quote Transfer**:
   - When creating client from quote, notes become first account note
   - Author shown as "Imported from Quote" with system authorId
   - Files: `app/add-client.tsx`

**Files modified**:
- types/client.ts
- app/quotes.tsx
- app/(tabs)/clients/[id].tsx
- app/runsheet/[week].tsx
- app/add-client.tsx

---

## 2025-01-21 - Fixed Team Member UI and Permission Issues After Invite Acceptance

- **Issue**: After accepting team invites, the UI was not updating correctly:
  - "Join owner account" button remained visible for members
  - Members could see "Team Members" button (owner-only feature)
  - "Leave Team" button wasn't showing for members
  - UI didn't immediately reflect member status after accepting invite
- **Root Cause**: 
  - Settings screen wasn't properly checking if user was a member of another account
  - Firebase auth token wasn't being refreshed after accepting invites
  - Leave team function wasn't properly resetting user's accountId
- **Fix**:
  1. Updated Settings screen to track `isMemberOfAnotherAccount` state
  2. Fixed button visibility logic to show/hide based on member status:
     - Hide "Join owner account" for members of other accounts
     - Hide "Team Members" for non-owners
     - Show "Leave Team" only for members of other accounts
  3. Added token refresh after accepting invites to immediately update UI
  4. Enhanced `leaveTeamSelf` to reset accountId and refresh claims
- **Result**: 
  - UI now correctly reflects member status immediately after accepting invite
  - Members only see appropriate buttons and screens
  - Leave team properly resets user to their own account

**Files modified**: 
- app/(tabs)/settings.tsx
- app/enter-invite-code.tsx
- app/set-password.tsx
- services/accountService.ts

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

## 2025-01-17 – Quote Modal Consistency & Notes Display 📋
• **Unified quote modals**: Made the "Progress to Pending" modal in quotes screen match the nicer runsheet version
• **Added quote notes display**: Top-level quote notes are now shown in the progress modal
• **Improved UI consistency**: Both modals now have:
  - Transparent background overlay
  - Rounded white content box
  - Scrollable content area
  - Better styled input fields with labels
  - "Add Another Line" button functionality
  - Consistent button text ("Save & Progress" instead of just "Save")

**Issue**: 
- Modal for progressing quotes was different between runsheet and quotes screens
- Quote notes weren't visible when progressing to pending status

**Resolution**: 
- Replaced the simple modal in quotes.tsx with the enhanced version from runsheet
- Added a dedicated section to display quote notes at the top of the modal
- Removed unused `detailsForm` state

Files: `app/quotes.tsx`

---

## 2025-01-17 – Firebase Permission Errors Fix 🔒
• Updated Firestore security rules to handle edge cases where documents might be missing `ownerId` field
• Fixed `hasResourceAccess` and `hasCreateAccess` functions to include fallback checks
• Enhanced `completedWeeks` collection rules to handle multiple document ID formats and field structures
• Added backward compatibility for documents created with different structures
• Fixed inconsistent `completedWeeks` document ID format in client details view
• Ensured new `completedWeeks` documents include both `accountId` and `ownerId` fields

**Round 2 fixes**:
• Simplified Firestore rules to use `allow read` which covers both get and list operations
• Added proper member deletion permissions for leave team functionality
• Fixed member write permissions to allow members to delete their own record
• Removed incorrect `canQueryByOwnerId` function that was causing rule compilation issues
• Added composite Firestore indexes for common queries (jobs by ownerId+scheduledTime, jobs by ownerId+status)

**Round 3 fixes**:
• Separated `list` and `get` operations in Firestore rules
• For collection queries (list), only check if user is signed in - the query filters will handle access control
• For document reads (get), check proper resource access permissions
• This fixes the "Missing or insufficient permissions" error when querying collections with filters

**Issue**: Users were getting "Missing or insufficient permissions" errors when:
- Viewing client accounts (fetching service history)
- Loading runsheet
- Deleting scheduled quotes
- Members trying to leave team
- Archiving clients

**Resolution**: 
- Made Firestore rules more robust by checking for field existence before accessing them
- Fixed document ID inconsistency: `completedWeeks` documents now consistently use `${ownerId}_${date}` format
- Added proper `accountId` and `ownerId` fields to new documents for rule validation
- Allowed members to delete their own member records when leaving a team
- Simplified read permissions to properly handle collection queries

Files: `firestore.rules`, `firestore.indexes.json`, `app/(tabs)/clients/[id].tsx`, `app/runsheet/[week].tsx`

---

## 2025-01-21 – Quote Notes Editing Enhancement 📝
• **Issue**: Quote notes were not visible or editable in the runsheet modal when progressing quotes to pending
• **Issue**: Line-level notes were emphasized over overall quote notes

**Changes made**:
• **Runsheet Modal**: Added editable quote notes field at the top of the "Progress Quote to Pending" modal
• **Quotes Screen Modal**: Updated to make quote notes editable (previously read-only)
• **Consistent Experience**: Both modals now allow users to view and edit the overall quote notes
• **Data Persistence**: Quote notes are now properly saved when progressing to pending status from either location

**Implementation details**:
• Added `quoteData` state to store full quote information in runsheet
• Updated `handleProgressToPending` to fetch and store quote notes
• Added editable TextInput for quote notes in both modals
• Updated save handlers to persist edited quote notes to Firestore

Files: `app/runsheet/[week].tsx`, `app/quotes.tsx`

---

## 2025-01-21 – Collapsible Completed Quotes 🎯
• **Issue**: Completed quotes were showing all details, making the list lengthy and hard to scan
• **Request**: Collapse completed quotes to show only the address, expandable to show full details

**Changes made**:
• **Collapsible State**: Added `collapsedQuotes` state to track which completed quotes are collapsed
• **Address-Only View**: When collapsed, completed quotes show only the address in a larger font
• **Click to Toggle**: Clicking on a completed quote toggles between collapsed/expanded views
• **Visual Indicators**: Added arrow indicators (▶/▼) to show collapsed/expanded state
• **Smart Layout**: Action buttons (delete) only show when expanded to keep the interface clean
• **Auto-Collapse**: Completed quotes are automatically collapsed when first loaded for a cleaner initial view
• **Visual Distinction**: Completed quotes have a subtle green background to distinguish them

**Implementation details**:
• Added `collapsedQuotes` Set state to track collapsed quote IDs
• Modified `QuoteCard` component to check if quote is completed and in collapsed set
• Added `toggleCollapse` function to add/remove quote IDs from collapsed set
• Wrapped quote content in Pressable for click handling on completed quotes
• Conditional rendering based on `isCollapsed` state
• Updated `useEffect` to auto-collapse completed quotes on initial load
• Added green-tinted background color for completed quote cards

Files: `app/quotes.tsx`

---

## 2025-01-21 – First-Time Setup Modal 🚀
• **Issue**: New users had no guidance on initial setup and configuration
• **Request**: Add a first-time setup modal that asks about invite codes, working days, vehicle info, and daily limits

**Changes made**:
• **Setup Modal**: Created a new modal that appears when users log in for the first time
• **Three-Step Process**: 
  - Step 1: Ask if they have an invite code to join an organization
  - Step 2: Select default working days (if creating own organization)
  - Step 3: Enter vehicle details and daily turnover limit
• **Default Rota**: Automatically creates 52 weeks of rota entries based on selected working days
• **Vehicle Creation**: Creates a vehicle record with registration and daily limit
• **Navigation**: Routes users to invite code screen if they have one, or completes setup

**Updates based on feedback**:
• Changed title to "Welcome to Guvnor!"
• Changed button text to "No, continue without"
• Combined vehicle name and registration into single field
• Fixed navigation delay after setup completion
• Creates member record with vehicle assignment and daily rate
• Automatically assigns the created vehicle to the user

**Implementation details**:
• Created `FirstTimeSetupModal` component with multi-step wizard interface
• Added `firstTimeSetupCompleted` flag to user documents
• Added fields: `defaultWorkingDays`, `vehicleName`, `dailyTurnoverLimit`
• Modified home screen to check for first-time users and show modal
• Updated invite code flow to mark setup as complete when joining a team
• Automatically populates rota for the next 52 weeks based on working day preferences
• Creates member record with vehicle assignment and daily rate for proper team screen integration

Files: `components/FirstTimeSetupModal.tsx`, `app/(tabs)/index.tsx`, `app/enter-invite-code.tsx`

---

## 2025-01-23 – First-Time Setup UX Improvements 🎨
• **Issue**: Vehicle field placeholder text was confusing and setup completion had poor UX
• **Request**: Update placeholder text and fix navigation after setup completion

**Changes made**:
• **Vehicle Placeholder**: Changed from "e.g., White Transit Van or AB21 CDE" to "eg. registration, white transit, bicycle"
• **Setup Completion**: Fixed the issue where button stayed grey for 30 seconds after completion
  - Changed from alert with OK button to auto-dismissing success message
  - Modal now automatically closes and navigates after 1.5 seconds
  - Prevents confusion where button returns to blue while waiting for user action

**User Experience**:
• Clearer placeholder text showing more diverse vehicle examples
• Smooth transition after setup - success message appears briefly then auto-navigates
• No more waiting for user to click OK - automatic progression to home screen

Files: `components/FirstTimeSetupModal.tsx`

---

## 2025-01-23 – Quotes Screen Mobile Layout Fix 📱
• **Issue**: On mobile web browsers, the "Completed" quotes section wasn't visible as it was displayed in a side column
• **Request**: Stack the sections vertically on mobile instead of side-by-side columns

**Changes made**:
• **Added responsive layout**: Imported `useWindowDimensions` hook to detect screen width
• **Breakpoint logic**: Two-column layout only shows on web when screen width > 768px
• **Mobile experience**: All sections (Scheduled, Pending, Complete) now stack vertically on mobile browsers
• **Centered content**: Added `marginHorizontal: 'auto'` to center containers on larger screens

**Result**: Mobile web users can now see all quote sections by scrolling vertically

**Files modified**: `app/quotes.tsx`

---

## 2025-01-23 – Team Invitation Flow Fix 🔧
• **Issue**: "Domain not allowlisted by project" error when inviting team members who haven't registered yet
• **Root cause**: Firebase function was trying to create user accounts immediately, which failed for non-allowlisted domains

**Changes made**:
• **Firebase function update**: Modified `inviteMember` to:
  - No longer creates Firebase user accounts upfront
  - Stores invitation in Firestore with `uid: null` and `status: 'invited'`
  - Sends email with invite code and registration instructions
• **Email template**: Clear instructions for new users to register first, then enter code
• **Team screen UI**: 
  - Shows "Pending Invitation" badge for invited members
  - Hides vehicle/permissions controls until invitation accepted
  - Shows "Cancel Invitation" instead of "Remove" for pending invites

**New flow**:
1. Owner invites any email address
2. Recipient gets email with 6-digit code
3. Recipient registers account (if needed)
4. Recipient enters code to join team
5. Team screen updates to show active member

**Result**: Team invitations now work for any email address, regardless of registration status

**Files modified**: `functions/index.js`, `app/(tabs)/team.tsx`

---

## 2025-01-23 – Cancel Invitation Fix 🔧
• **Issue**: "Cancel Invitation" button would remove pending invitations from the UI temporarily, but they would reappear after refresh/navigation
• **Root cause**: `removeMember` function was designed for active members (using UID as document ID) but pending invitations use invite codes as document IDs

**Changes made**:
• **Firebase function fixes**:
  - Updated `listMembers` to return both `docId` (document ID) and `uid` fields
  - Modified `removeMember` to handle both active members and pending invitations
  - For pending invitations: deletes by invite code, no user document updates
  - For active members: deletes by UID, resets user document and clears claims
• **Frontend updates**:
  - Updated `MemberRecord` type to include `docId` field
  - Modified team screen to use correct identifier when removing members
  - Improved confirmation messages ("cancel this invitation" vs "remove this member")

**Technical details**:
- Pending invitations: `docId` = invite code, `uid` = null
- Active members: `docId` = user UID, `uid` = user UID
- `removeMember` now properly handles both cases

**Result**: Cancel invitation now permanently removes pending invitations from Firestore

**Files modified**: `functions/index.js`, `app/(tabs)/team.tsx`, `services/accountService.ts`

---

## 2025-01-27 - Performance Optimization: Client List Next Visit Loading

### Bug Fix:
**Fixed Performance Issue with Next Visit Display**: Resolved major performance bottleneck in clients list where "Next Visit: N/A" was showing despite jobs existing.

### Root Cause:
The `fetchNextVisits` function was making individual Firebase queries for each client in a sequential loop. With 529 clients, this meant 529 separate database queries, causing:
- Extremely slow loading times
- Component rendering before all queries completed
- "N/A" displaying while queries were still running

### Solution:
**Optimized Query Strategy (`app/clients.tsx`)**:
- Replaced individual client queries with single bulk query
- Fetches ALL pending/scheduled/in_progress jobs for the data owner at once
- Groups results by clientId in memory to find next visit dates
- Reduces 529 database queries to just 1 query

### Performance Impact:
- **Before**: 529 sequential Firebase queries (very slow)
- **After**: 1 Firebase query + in-memory processing (fast)
- **Result**: Next Visit data now loads immediately and displays correctly

### Technical Implementation:
- Single query: `where('ownerId', '==', ownerId)` + `where('status', 'in', ['pending', 'scheduled', 'in_progress'])`
- In-memory grouping by clientId to find earliest future job date
- Maintains same logic for date calculation and formatting
- Improved error handling with fallback to empty state

**Files modified**: `app/clients.tsx`

---

## 2025-01-27 - Comprehensive Job Capacity Management System

### Major Feature: Automatic Job Redistribution Based on Team Capacity

**Problem Solved**: Runsheets were displaying jobs that exceeded the daily capacity limits of available team members, causing operational inefficiencies and overloading.

### Core Functionality:

**1. Capacity Calculation System**:
- Calculates daily capacity = sum of (available team members' daily turnover limits)
- Factors in team member availability from rota (on/off/n/a status)
- Real-time capacity monitoring per day within each week

**2. Intelligent Job Redistribution**:
- **Overflow Detection**: Identifies when jobs exceed daily capacity limits
- **Round Order Preservation**: Maintains routing efficiency by moving job blocks, not individual jobs
- **Sequential Spillover**: Excess jobs roll to next day, then next, until capacity allows
- **Week Boundary Respect**: Jobs never move to following weeks - stay within current week
- **Final Day Exception**: If all future days lack capacity, keeps overflow on final viable day

**3. Automated Triggers**:
- **Job Addition**: Triggers redistribution when new jobs are created (future weeks only)
- **Team Changes**: Triggers when daily turnover limits change
- **Availability Changes**: Triggers when rota availability is modified
- **Current Week Protection**: Auto-triggers skip current week to avoid disrupting active operations

**4. Manual Override**:
- **Current Week Refresh**: Manual button on runsheet for current week capacity redistribution
- **Visual Feedback**: Shows redistribution results, warnings, and job counts moved
- **Real-time Updates**: Automatically refreshes screen after redistribution

### Algorithm Logic:

```
For each day Monday-Sunday:
  If (current jobs value > daily capacity):
    Calculate overflow jobs (maintaining round order)
    For each subsequent day in week:
      If (target day has available capacity):
        Move jobs that fit into available capacity
        Update capacity calculations
      Else:
        Continue to next day
    If (last day OR no remaining capacity):
      Keep remaining jobs on current day (accept overflow)
```

### Key Constraints:

- **Round Order Maintenance**: Jobs move as coherent blocks to preserve routing efficiency
- **Week Boundaries**: No cross-week job movement - contains work within current week
- **Capacity Respect**: Only moves jobs when target days have sufficient capacity
- **Team Availability**: Only counts team members marked as 'on' in rota for capacity calculations

### Technical Implementation:

**New Service**: `services/capacityService.ts`
- `calculateDayCapacity()`: Daily capacity computation with team availability
- `redistributeJobsForWeek()`: Core redistribution algorithm with round order preservation
- `manualRefreshWeekCapacity()`: Current week manual refresh functionality
- `triggerCapacityRedistribution()`: Automated trigger system for future weeks

**Integration Points**:
- `services/jobService.ts`: Auto-trigger on job creation
- `services/accountService.ts`: Auto-trigger on daily rate changes
- `services/rotaService.ts`: Auto-trigger on availability changes
- `app/runsheet/[week].tsx`: Manual refresh UI and capacity management integration

**Performance Optimizations**:
- Batched Firebase updates for job redistributions
- Dynamic imports to avoid circular dependencies
- Error isolation - capacity failures don't break core operations
- Efficient capacity calculations with in-memory processing

### User Experience:

**Automated Operation**: System automatically redistributes jobs for future weeks without user intervention when:
- New jobs are added to the system
- Team member daily limits are modified
- Team availability changes in the rota

**Manual Control**: Users can manually apply redistribution to current week using the "Refresh Capacity" button, which provides:
- Detailed feedback on jobs moved
- Warning messages for overflow situations
- Immediate visual updates to runsheet layout

**Exception Handling**: System gracefully handles edge cases:
- Days with no available team members
- Weeks with insufficient total capacity
- Final day overflow situations

### Business Impact:

- **Operational Efficiency**: Prevents team overloading and ensures realistic daily schedules
- **Route Optimization**: Maintains round order for efficient job sequencing
- **Workload Balance**: Distributes work evenly across available team capacity
- **Proactive Management**: Automatic redistribution prevents capacity issues before they occur

**Files created**: `services/capacityService.ts`

**Files modified**: `app/runsheet/[week].tsx`, `services/jobService.ts`, `services/accountService.ts`, `services/rotaService.ts`

---

## Capacity Management Bug Fixes (2025-01-21)

### Issues Fixed:

**1. Job Distribution Logic Correction**:
- **Problem**: Excess jobs were being distributed to the first available day with capacity
- **Fix**: Changed algorithm to distribute excess jobs to the LAST available day with capacity
- **Impact**: Jobs now correctly overflow to Saturday (last available day) instead of Monday

**2. Current Week Auto-Application Prevention**:
- **Problem**: Rota availability changes were automatically triggering redistribution on current week
- **Fix**: Modified `rotaService.ts` to only trigger redistribution for future weeks
- **Impact**: Current week redistribution now only happens via manual "Refresh Capacity" button

### Technical Changes:

**`services/capacityService.ts`**:
- Modified `redistributeJobsForWeek()` function
- Changed target day selection from sequential forward search to reverse search
- Jobs now fill available capacity starting from the last available day in the week

**`services/rotaService.ts`**:
- Updated `setAvailability()` function
- Replaced `manualRefreshWeekCapacity()` call with `triggerCapacityRedistribution()`
- Added proper current week protection for automatic triggers

### Algorithm Logic Update:

```
For each day Monday-Sunday with overflow:
  Identify all available days after current day (with capacity > 0)
  Process available days in REVERSE order (Saturday → Friday → Thursday etc.)
  For each target day (starting from last):
    Move jobs that fit into available capacity
    Update capacity calculations
  If jobs still remain:
    Keep on current day (accept overflow)
```

### User Experience Impact:

- **Correct Distribution**: Excess jobs now properly distribute to the end of the week
- **Manual Control**: Current week changes require explicit user action via "Refresh Capacity" button
- **Predictable Behavior**: Future week changes automatically redistribute, current week protected

**Files modified**: `services/capacityService.ts`, `services/rotaService.ts`

---