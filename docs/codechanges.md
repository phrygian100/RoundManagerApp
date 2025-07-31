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
