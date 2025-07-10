# Changelog (condensed on 2025-07-08)

This file tracks **major** functional changes, bug fixes and architectural decisions.
For full debugging notes see project history; this file now focuses on high-level milestones.

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

(Last condensed: 2025-07-08)
