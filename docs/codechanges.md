- 2025-08-18: Payments CSV import fix
  - Normalized client account numbers when building the account map in `app/(tabs)/settings.tsx` for both web and mobile flows (trim, ensure `RWC` prefix, uppercase).
  - This resolves failures when importing rows (notably 'cash' payments) due to mismatches caused by stored account numbers lacking the `RWC` prefix or containing whitespace/case differences.
  - Also fixed a Firestore write error by removing undefined fields: importer now only includes `notes` when non-empty, and `createPayment()` strips undefined values before writing.

## 2025-08-19

- Home screen responsive improvements (desktop widescreen)
  - File: `app/(tabs)/index.tsx`
  - Added aspect-ratio + width detection using `useWindowDimensions()` to better distinguish desktop-like web views from mobile. Treats views as desktop when width ≥ 1024 and aspect ratio ≥ 1.6.
  - Increased buttons per row to 4 on desktop-like web; 3 for other web; 2 for native.
  - Center-constrained each row on web and reduced tile max width on widescreen (200px) to prevent oversized tiles and overlap; rows compute exact max width from tile width + gaps.
  - Removed direct import of `OPENWEATHER_API_KEY`; now reads `EXPO_PUBLIC_OPENWEATHER_API_KEY` env var with safe fallback, resolving a linter error and aligning with current config approach.

- Marketing site mobile sizing cleanup
  - Files: `web/src/app/home/page.tsx`, `web/src/app/feature-tour/page.tsx`, `web/src/app/pricing/page.tsx`, `web/src/app/about/page.tsx`, `web/src/app/contact/page.tsx`, `web/src/app/privacy-policy/page.tsx`, `web/src/app/terms/page.tsx`, `app/login.tsx`
  - Adjusted nav logo sizing to `h-10 sm:h-12 md:h-16` across marketing pages for consistent scaling.
  - Tightened hero paddings and scaled headings/buttons with responsive Tailwind classes (`text-3xl sm:text-4xl md:text-6xl`, smaller button text/padding on mobile).
  - Lowered section paddings from `py-16` to `py-12` on mobile to reduce vertical whitespace.
  - Adjusted login screen (Expo web) with width-aware styles: nav logo 260×70 (desktop) / 220×60 (narrow web), card logo 240×96 (desktop) / 180×72 (narrow web), footer uses inverted logo at 180×56 (desktop) / 144×48 (narrow web).
  - Update: Increased all logo sizes ~2× after review
    - RN Web login: nav 520×140 desktop / 440×120 narrow web; card 480×192 desktop / 360×144 narrow web; footer 360×112 desktop / 288×96 narrow web.
    - Marketing pages: nav logo heights `h-20 sm:h-24 md:h-32`.

- Introduced service plan separation (no runtime behavior change yet; generation remains legacy until flag is enabled).
  - Added `types/servicePlan.ts` defining `ServicePlan` with `scheduleType`, `frequencyWeeks`, `startDate` (next future anchor), `lastServiceDate`, `price`, `isActive`.
  - Added `services/servicePlanService.ts` with helpers:
    - `createServicePlan`, `getServicePlansForClient`, `getNextFutureAnchor` (rolls to next future date), `deactivatePlanIfPastLastService`.
  - Added read-only migration audit: `scripts/audit-service-plans-migration.ts` to compute candidate anchors per client/service from pending jobs or rolled seeds.
  - Updated `services/jobService.ts` `createJobsForClient` to support plan-based generation (dedup, respects `lastServiceDate`), gated by `shared/features.ts` flag `USE_SERVICE_PLANS_GENERATION` (currently false).
  - No existing jobs modified; plan-based generator starts from the next future occurrence to preserve current planning.
  - Added `app/(tabs)/clients/[id]/manage-services.tsx` screen to view and edit service plans (frequency, next anchor, price, last service date, active), and linked from client details with a "Manage Services" button. Compatible with web and mobile date inputs.
  - Added scripts:
    - `scripts/audit-service-plans-migration.js` (read-only audit)
    - `scripts/migrate-service-plans.js` (idempotent write migration to create plans)

## 2025-08-23

- Fix client account number allocation to use highest existing + 1
  - Files: `services/clientService.ts`, `app/add-client.tsx`, `app/runsheet/[week].tsx`
  - Added `getNextAccountNumber()` helper that scans current owner's clients, parses both numeric and `RWC###` formats, and returns max + 1.
  - `AddClient` now uses this helper instead of ordering by `accountNumber`, avoiding lexicographic sorting issues and duplicate reuse like `RWC100`.
  - Quote-to-client creation path in runsheet now assigns `accountNumber: RWC<next>` so all new clients receive a unique number consistently.
  - CSV import paths already compute next numbers independently and were left unchanged.

- Edit Customer: account number editing reliability and validation
  - File: `app/(tabs)/clients/[id]/edit-customer.tsx`
  - Added cross-platform alert helper to show messages on web (previously some Alerts were invisible on web).
  - Normalizes entered account numbers to `RWC###` format and blocks duplicates for the current owner before saving.
  - Keeps all other behavior unchanged; no impact on mobile.
  - Relaxed legacy frequency validation: accepts numeric values (>0) or 'one-off'; otherwise skips updating frequency so unrelated edits (like account number) aren't blocked.

## 2025-08-14

- Implemented draft persistence for first-time setup to prevent data loss if the screen remounts shortly after login.
  - File: `components/FirstTimeSetupModal.tsx`
  - Added `@react-native-async-storage/async-storage` usage to save and restore form state per user (`firstTimeSetupDraft:<uid>`).
  - Draft auto-loads when the modal becomes visible and auto-saves on field changes; cleared upon successful completion.
  - No changes to web-specific code paths; compatible with both mobile and web.

- Payments list: Added method filters and sorting controls.
  - File: `app/payments-list.tsx`
  - New method filter chips for Cash, Direct Debit, and BACS (bank transfer). Multiple can be toggled; when any are active, list filters accordingly.
  - New sort chips for Date and Amount; both sort descending (newest/largest first). Sorting applied after filtering and search.
  - UI integrates with existing search input; works on web and mobile without breaking layouts.

- Client list: Added sorting by weekly interval.
  - File: `app/clients.tsx`
  - New sort option key `weeklyInterval` included in the cycle list and label mapping.
  - Comparator reads `client.frequency` (number or string) and falls back to the smallest active `additionalServices.frequency` when primary is missing; clients without intervals sort last.
  - Preserves existing sort options and search/filter behavior for both mobile and web.

- Debounced auth redirect to login to prevent late redirect glitches during brief token refresh.
  - File: `app/_layout.tsx`
  - Increased debounce window to 5s to cover slower token/claims refreshes after login; still cleared once authenticated.

- Runsheet: Allow completing any job on the current day (per vehicle), track completion order per vehicle, and on day-complete show swap proposals for out-of-order completions. Quotes excluded. Confirming applies round-order swaps; closing skips. Clear completion tracking after day completion. Future-day jobs remain non-completable.

- Runsheet vehicle headers: Restore +/- toggle visibility for single-vehicle days
  - File: `app/runsheet/[week].tsx`
  - Change: Always render the vehicle collapse/expand `Pressable` with `+/-` instead of hiding it when there is only one vehicle in the day. Previously it was gated behind a `shouldShowCollapseButton` condition requiring 2+ vehicles, which caused the +/- to disappear on single-vehicle days.
  - Behavior: Users can collapse/expand the job list for a vehicle regardless of how many vehicles exist for that day. Web and mobile unaffected otherwise.

- Day Complete Summary modal: show loading state for direct-debit lookup
  - File: `app/runsheet/[week].tsx`
  - Changed conditional rendering so that while `summaryProcessing` is true, the modal displays "Looking up direct-debit jobs…" and does not prematurely show "No direct-debit jobs today." This prevents confusing flicker before GoCardless/job detection completes.
### (Date: 2025-08-03) – Dynamic Sign-off in ETA Messages

1. `app/runsheet/[week].tsx`
   • Added `getUserProfile` import, `userProfile` state, and fetch logic.
   • Introduced dynamic `signOff` built from profile name, business name, and website.
   • Templates now reference `${signOff}` instead of hard-coded lines.

---

### (Date: 2025-08-03) – Added Business Website field to Bank & Business Info Modal

1. `app/(tabs)/settings.tsx`
   • Added `businessWebsite` field to bank info form state, load and save functions, and modal UI.
   
2. `types/models.ts`
   • Added `businessWebsite` optional string property to `User` type.

---

### (Date: 2025-07-31) – Fix Feature Tour page not showing in production

1. `vercel.json`
   • Added rewrite rule mapping `/feature-tour` to `/_marketing/feature-tour/index.html` so the Feature Tour marketing page loads correctly on https://www.guvnor.app/feature-tour.

2. `scripts/merge-builds.js`
   • Added `'feature-tour'` to the list of routes validated after the marketing build is merged to ensure the page is present.



### (Date: 2025-01-17) – Added Feature Tour Marketing Page

1. `web/src/app/feature-tour/page.tsx`
   • Created comprehensive Feature Tour page showcasing all Guvnor features
   • Features listed: Quoting, Smart Round Order Manager, Automated ETA messaging, GoCardless Integration, Smart planning, Team members, Solutions for not paying customers
   • Implemented responsive design with feature cards and professional styling
   • Added call-to-action sections linking to sign-up and pricing pages
   • Follows same design pattern as existing marketing pages

2. Navigation Updates (all web pages)
   • Updated navigation menus to include "Features" link pointing to `/feature-tour`
   • Modified pages: `web/src/app/pricing/page.tsx`, `web/src/app/about/page.tsx`, `web/src/app/contact/page.tsx`, `web/src/app/home/page.tsx`
   • Updated footer links in all pages to point to feature tour instead of home page
   • Consistent navigation order: Home, Features, Pricing, About, Contact, Sign In

### (Date: 2025-07-30) – Added Payments CSV Export

1. `app/(tabs)/settings.tsx`
   • Implemented `handleExportPayments` exporting all payments (columns: Account Number, Date, Amount (£), Type, Notes).
   • Added "Export Payments" button under Export Data.
   • Uses same share/download pattern as other exports.

### (Date: 2025-07-30) – Runsheet “Complete Day” owner restriction & UX cleanup

1. `app/runsheet/[week].tsx`
   • Added owner detection (`getUserSession`) and `isOwner` state.
   • "Day complete?" button is now shown only for owners.
   • `handleDayComplete` blocks non-owner attempts with a permission alert.
   • Removed the modal prompt after the final job completes by disabling the `Alert` in `handleComplete`.
   • Updated session import to include `getUserSession`.

### (Date: 2025-07-31) – Fixed Stripe Premium Upgrade Flow

1. `functions/index.js`
   • Added `defineSecret` import from `firebase-functions/params`
   • Declared `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` secrets
   • Bound secrets to functions: `createCheckoutSession`, `stripeWebhook`, `createCustomerPortalSession`
   • Functions now use `SECRET.value()` with env-var fallback for local emulation
   • Commented out conflicting `invoice_creation` config in subscription mode
   • Added CORS and public invoker configuration to stripeWebhook (lines 794-798)

2. `functions/package.json`
   • Pinned `firebase-functions` to `4.9.0` to ensure v2 function compatibility

3. **Manual Configuration Required**
   • The stripeWebhook function needs public access for Stripe to call it
   • Since gcloud CLI is not available locally, use Google Cloud Console:
     1. Go to https://console.cloud.google.com
     2. Select project: roundmanagerapp
     3. Navigate to Cloud Run
     4. Find service: "stripeWebhook"
     5. Click service name → Permissions tab → Add principal
     6. Enter "allUsers" as principal, select "Cloud Run Invoker" role
     7. Click Save
   • This allows Stripe webhooks to invoke the function without authentication

### (Date: 2025-01-19) – CSV Import Auto-Assignment for Account Numbers and Round Orders

1. `app/(tabs)/settings.tsx`
   • Removed "Account Number" and "Round Order" from `requiredFields` array - blank values no longer cause import failures
   • Added auto-generation logic for missing account numbers:
     - Scans existing clients and CSV rows to find highest RWC number
     - Assigns sequential RWC### values to blank entries
     - Prevents duplicates by maintaining a Set of used numbers
   • Added auto-generation logic for missing round order numbers:
     - Finds highest existing round order from clients and CSV
     - Assigns sequential integers (1, 2, 3...) to blank entries
     - Tracks usage to avoid conflicts
   • Enhanced success messages to show auto-assignment counts:
     - "Auto-assigned account numbers: N." when N > 0
     - "Auto-assigned round order numbers: N." when N > 0
   • Applied consistent logic across all import paths:
     - Web CSV import
     - Mobile CSV import  
     - Mobile Excel (.xlsx/.xls) import

**Impact:** Users can now import client CSVs with blank account numbers and/or round orders. The system automatically assigns unique, sequential values while preserving any existing numbers specified in the CSV. This eliminates the need to manually fill these columns before import.

---

### (Date: 2025-07-31) – Added Subscription Renewal Date Display

1. `functions/index.js`
   • Updated `updateUserSubscription` helper to accept and store `renewalDate` parameter
   • Modified subscription webhook handlers to extract `current_period_end` from Stripe events
   • Convert Stripe timestamp to ISO string and store as `subscriptionRenewalDate` in Firestore

2. `services/subscriptionService.ts`
   • Added `renewalDate` field to `EffectiveSubscription` interface
   • Updated `getEffectiveSubscription` function to return renewal date from user data
   • Added renewal date to all return statements (including fallbacks)

3. `app/(tabs)/settings.tsx`
   • Added renewal date display for premium subscriptions in subscription card
   • Shows date in format: "Next renewal: 15 August 2025"
   • Added `subscriptionRenewal` style for formatting
   • Only displays for premium tier when renewal date is available

---

### (Date: 2025-08-12) – Stabilize Android EAS Build

1. `package.json`
   • Removed `@supabase/supabase-js`, `crypto-browserify`, `stream-browserify`, `firebase-functions`, `gocardless`, and `stripe` from app dependencies to eliminate Node/server-only modules and Supabase usage per project rules.
   • These packages are either unused in the client app or belong on the server (Cloud Functions already use their own `functions/package.json`).

2. `app.json`
   • Set `newArchEnabled` to `false` to avoid New Architecture incompatibilities on Android for SDK 53 + current native modules.

3. `metro.config.js`
   • Removed Node polyfill injection and kept Metro near defaults; this prevents brittle module resolution on EAS Android.

Rationale:
• Previous build issues were caused by version/config mismatches and Node polyfills introduced to support Supabase/Node libs. Supabase is no longer used. Removing those and disabling New Arch stabilizes Android bundling without impacting web or iOS.

Impact:
• Expo start/bundle should succeed locally; Android EAS builds should progress past JS bundling phase. Cloud Functions continue to use Stripe in `functions/` where appropriate.

Dev workflow note:
• Added `cross-env`-backed start scripts (`start`, `start:clean`, `android`, `android:clean`) to enforce classic bundling and static router imports during local dev to avoid Metro serializer errors on Android.

Follow-up:
• Pinned `@expo/metro-config` to 0.20.12 to pick up fixes in Expo’s serializer fork that impact `getModuleParams`/chunk path computation. For EAS, we no longer override the serializer in `metro.config.js` to ensure the format expected by the CLI (removed experimental serializer options and gating the override behind `METRO_UPSTREAM_SERIALIZER=1` for local only).

---

### (Date: 2025-08-12) – Firebase Config Fallback + Remove Legacy Env File

1. `core/firebase.ts`
   • Reads Firebase config in this order now: `EXPO_PUBLIC_*` env vars → `Constants.expoConfig.extra.firebase` (from `app.config.ts`/`app.json`) → `FIREBASE_CONFIG` from `config.ts`.
   • Prevents dev crashes when `EXPO_PUBLIC_*` vars aren’t set locally.

2. Repo hygiene
• Removed `ServiceKey.env.local` (contained legacy Supabase service role key). Supabase is no longer used.
• Recommendation: keep this filename in `.gitignore` going forward; rotate the exposed key if it was real.

---

### (Date: 2025-08-13) – Fix Android release crash-on-launch

1. `app.json`
   • Set `newArchEnabled` back to `false` for release builds to avoid native crash at startup observed on the internal APK. Reanimated Babel plugin remains enabled for release.

Context:
• Dev client ran, but standalone APK crashed immediately on some devices. Disabling New Architecture stabilizes the release binary without affecting web.

---

### (Date: 2025-08-13) – Add release-apk EAS profile

1. `eas.json`
   • Added `release-apk` profile to produce a standalone installable APK with conservative bundling and Firebase env baked in.
   • Use: `npx eas build --platform android --profile release-apk --non-interactive`.

---

### (Date: 2025-08-14) – Fix Android crash: initialize Firebase Auth on RN

1. `core/firebase.ts`
   • Call `initializeAuth(app)` on native before `getAuth(app)` so the `auth` component is registered (fixes "Component auth has not been registered yet").
