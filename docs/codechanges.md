# Code Changes Log

## July 8, 2026 (4)

### Location picker: "Re-guess" button for refined addresses

**Why**: Most of the 95 un-geocoded accounts failed because the stored address is shorthand (e.g. just "St Andrews"). The natural cleanup flow is: fix the address in Edit Customer → re-run the guess — previously impossible without closing the modal and saving first.

**Changes**:
- `components/LocationPickerModal.tsx` — new optional `onReguess?: () => Promise<PickedLocation | null>` prop. When provided, a "Re-guess" button renders between Cancel and Confirm. It calls the host's geocode, and on a hit moves the pin + recentres the live map via a new injected `__setPin(lat, lng)` (iframe `contentWindow` call on web, `injectJavaScript` on native — no HTML rebuild, viewport preserved). Shows "Guessing…" while in flight; on no match/failure shows guidance in the footer text instead of the coordinates. State resets on each modal open.
- `app/(tabs)/clients/[id]/edit-customer.tsx` — passes `onReguess` wired to `geocodeBestGuess(address1, town, postcode)` using the **current form state**, so an address edited in the fields behind the modal is what gets guessed.
- `app/add-client.tsx` — same prop for consistency (refine a typo'd address without reopening the picker).

**Non-regression notes**: prop is optional — the round-order-manager map's picker (no address fields to refine) doesn't pass it and is unchanged. Existing confirm/cancel behaviour untouched.

## July 8, 2026 (3)

### Fix: Round Order Manager map collapsing to a tiny strip (desktop + mobile)

**Symptom**: In map mode the map rendered as a small strip (~150px on desktop/portrait, a sliver on landscape phones) with dead space below — screenshots from desktop and mobile confirmed.

**Cause**: the map's height came from a `flex: 1` chain ending in an embedded `iframe`/WebView. Percentage/flex heights don't resolve reliably into an iframe, which then falls back to the HTML default of 150px.

**Fix**:
- `app/round-order-manager.tsx` — map container now gets an **explicit pixel height**: `max(320, windowHeight − 210)` (via the already-used `useWindowDimensions`). The web window-height pinning (`height/maxHeight/overflow`) now applies in **list mode only** — the list needs it for internal scrolling/drag, while map mode on small landscape screens is better letting the page scroll. Footer (Save/Discard) is hidden in map mode: pin edits save immediately so there's nothing to save, and the map gets the reclaimed space.
- `components/ClientMapView.tsx` — web container uses `height: '100%'` (of the now-explicit parent) and the iframe gets `display: block` + 100% height so it always fills.

**Non-regression notes**: list mode is untouched (pinning condition simply includes `viewMode === 'list'`, which is the initial state; footer renders exactly as before in list mode). Native WebView path unchanged apart from inheriting the explicit-height parent.

## July 8, 2026 (2)

### Round Order Manager: map view for verifying/correcting client pins (phase 2)

**Why**: After the bulk geocode (460/555 auto-pinned), the auto guesses need visual verification — a wrongly-placed pin is obvious on a map but invisible in a list.

**New component** (`components/ClientMapView.tsx`): read-only Leaflet map (same CDN/iframe/WebView pattern as `LocationPickerModal`, no new dependencies) rendering every pinned client as a colour-coded circle marker: green = `manual` (human-confirmed), amber = `postcode` guess, blue = `address` guess, with an on-map legend. Marker popups show name, address, cost (quote), visit interval and round position, plus an "Edit location" button that posts `{type:'edit', id}` to the host (popup text is HTML-escaped). The HTML is built once per mount; subsequent pin changes are pushed into the live map via an injected `__applyPins` call so the viewport/zoom is preserved after an edit (verified: marker moves, zoom untouched). Map fits bounds to all pins on load.

**Round Order Manager** (`app/round-order-manager.tsx`):
- New **List | Map** segmented toggle under the header. List mode is completely unchanged (search, drag-reorder, save/footer all as before — reordering logic untouched).
- Map mode shows a banner ("X of Y pinned · Z need a location (set via Edit Customer)") and the map in place of the list.
- "Edit location" in a popup opens the existing `LocationPickerModal` centred on the current pin; confirming writes `latitude`/`longitude`/`geoSource: 'manual'`/`geoUpdatedAt` via `updateDoc`, updates local state, and the marker moves + turns green live.

**Verified in browser**: pins render colour-coded with legend; popup content + escaping correct (tested with `O'Brien & Sons <test>`); edit button posts the correct tagged message; `__applyPins` updates markers without viewport reset. `tsc --noEmit` reports nothing for the touched files; lints clean.

**Non-regression notes**: map mode is purely additive — no changes to reorder/save logic; the round-order save baseline (`originalNumberById`) is unaffected by pin edits (different field, separate write path).

## July 8, 2026

### Client geolocation: map pins on every account (phase 1 of round-order repair)

**Why**: The round order data (~500 clients) is corrupt and rural addresses ("The Poplar Farm, North Dyke") are too opaque to reorder from text alone. Phase 1 establishes a latitude/longitude pin per client — automated best-guess first, human correction after — so the round order can later be rebuilt geographically.

**Schema** (`types/client.ts`): added optional `latitude`, `longitude`, `geoSource` (`'postcode' | 'address' | 'manual'`), `geoUpdatedAt` to `Client`. `manual` pins are human-placed and are never overwritten by automated geocoding.

**New service** (`services/geocodingService.ts`):
- `geocodePostcode` / `geocodePostcodesBulk` — postcodes.io (free, no key; bulk endpoint 100/request).
- `geocodeAddress` — Nominatim (OpenStreetMap) free-form search restricted to GB; handles "street number, street, town" when postcode is missing. Rural property names often won't resolve — by design they stay unpinned for manual placement.
- `geocodeBestGuess` — postcode first, then address.
- `bulkGeocodeClients(onProgress)` — pins every *active* client without coordinates (skips ex-clients and anyone already pinned, so manual pins and prior runs are preserved). Postcode batch first, then per-address lookups throttled to ~1/sec (Nominatim policy), then Firestore `writeBatch` in chunks of 400. Returns totals + a list of unresolved clients needing manual pins.

**New component** (`components/LocationPickerModal.tsx`): cross-platform draggable-pin map (Leaflet 1.9.4 + OpenStreetMap tiles, CDN). One HTML implementation hosted in an `iframe` (`srcDoc`) on web and `react-native-webview` on native — no new npm dependencies, no API keys. Opens at the predicted pin (zoom 16) or over the UK (zoom 6) when there's no guess; tap places / drag adjusts; pin coordinates stream to the host via `postMessage` (tagged messages, filtered by the host). Confirm/Cancel footer is native RN.

**Add Client** (`app/add-client.tsx`): new "Location" button under the postcode field. Tapping geocodes whatever address is typed so far and opens the picker at the predicted spot; a confirmed pin saves with `geoSource: 'manual'`. If the user never opens the map, a best-guess geocode runs fire-and-forget *after* the client is created (never blocks or fails the save) with `geoSource: 'postcode' | 'address'`.

**Edit Customer** (`app/(tabs)/clients/[id]/edit-customer.tsx`): "Location Pin" row in Basic Information showing pin status ("confirmed" vs "auto guess"). Same picker; location fields are only written when the pin was actually (re)placed this session, so an untouched automated pin keeps its original `geoSource`.

**Settings → Developer** (`app/(tabs)/settings.tsx`): "Geocode All Clients (drop map pins)" button, additionally gated to `session.uid === DEVELOPER_UID` (over and above the section's exempt-tier gate). Confirm dialog → progress text (postcode phase / address phase / saving) → summary alert including up to 15 unresolved clients that need manual pins via Edit Customer.

**Verified**: Leaflet map HTML smoke-tested in browser (renders, pin drops on tap, `postMessage` payloads match what the component parses); postcodes.io and Nominatim live-tested (SW1A 1AA → 51.501, -0.142; "Angel Lane, Penrith" resolves; a made-up house number correctly returns no result). `tsc --noEmit` shows no errors in any touched file (all reported errors are pre-existing in unrelated files).

**Non-regression notes**:
- All schema fields optional; no existing reads/writes of `clients` docs are affected.
- No new npm dependencies; native builds unaffected (`react-native-webview` was already shipped).
- Round-order tooling untouched — reordering by geography is a later phase once pin coverage is good.

## July 7, 2026

### Fix: severe runsheet (and general) load slowdown from repeated forced token refreshes

**Symptom**: Since the June 30 session/subscription changes, loading run sheets in the browser on mobile became excruciatingly slow.

**Root cause**: The June 30 fix made `getUserSession()` (`core/session.ts`) force a token refresh (`getIdTokenResult(true)`) whenever the ID token's custom claims (`accountId`/`isOwner`) looked unset. `getIdTokenResult(true)` is a full network round trip to Firebase Auth. For accounts whose custom claims were never set server-side, the refreshed token *still* has no claims, so the condition never clears and **every** `getUserSession()` call paid that round trip. The runsheet screen (`app/runsheet/[week].tsx`) calls `getUserSession()` ~8–12 times per load (directly, plus via `getDataOwnerId()` inside `getJobsForWeek`, `listMembers`, `fetchRotaRange`, completed-days fetch, client-balances fetch), largely sequentially — so on a mobile connection the load path accumulated many seconds of pure token-refresh latency.

**Fix** (`core/session.ts` only):
- Added module-level guards `claimsRefreshAttemptedForUid` / `claimsRefreshInFlight` so the forced refresh runs **at most once per signed-in user per app session**. Concurrent callers share the same in-flight refresh promise instead of each firing their own network request.
- The guard is marked in a `finally`, so even a failed refresh isn't retried (the outer `catch` already falls back to the Firestore-derived session, same as before).
- The guard is keyed by uid, so signing out and in as a different user still gets its own single refresh.

**Non-regression notes**:
- The June 30 Safari/iOS banner fix is preserved: the *first* `getUserSession()` call after a hard refresh still performs the forced refresh when claims are missing, so a team member is still resolved against the owner account. Only the wasteful repeats are eliminated.
- Users whose tokens already carry claims (the steady state) were never taking this branch and are unaffected.
- No changes to `services/subscriptionService.ts` or `app/(tabs)/index.tsx` from the June 30 change; their behaviour is unchanged.

## June 30, 2026

### Fix: intermittent "Free plan" banner flash for team members on hard refresh (Safari/iOS)

**Symptom**: A member of the (exempt) developer account reported that refreshing the browser on Safari/iOS sometimes showed the Free-plan upgrade notification on the home screen; refreshing again "looked normal".

**Root cause**: A member inherits the account owner's tier via `getEffectiveSubscription()`. On a hard refresh, two race conditions could make it briefly resolve to `free`:
1. **Identity mis-resolution** — `getUserSession()` reads custom claims from the in-memory ID token (`getIdTokenResult()`). Safari/iOS often restores the cached auth session before the claims (`accountId`/`isOwner`) are attached, so the member fell into the "owner of their own account" branch and read their *own* (free) user doc.
2. **Swallowed read error** — if reading the owner's user doc transiently failed, `getEffectiveSubscription`'s `catch` returned a confident `tier: 'free'`, which drove the banner.

**Fix** (defense-in-depth, no behaviour change in the steady state):
- `core/session.ts` — `getUserSession()` now awaits `waitForAuthReady()` before resolving, and if the token claims look unset (`accountId` and `isOwner` both undefined) it forces a single `getIdTokenResult(true)` refresh so a member is correctly resolved against the owner account instead of themselves. Steady-state users (claims already present) are unaffected — no extra token refresh.
- `services/subscriptionService.ts` — `getEffectiveSubscription()` awaits `waitForAuthReady()`, reads user/owner docs via a new `getDocWithRetry()` (one retry on transient failure), and the error fallback is now flagged `resolved: false`. Added optional `resolved?: boolean` to `EffectiveSubscription` (successful resolutions set `resolved: true`). The fallback still returns `free` for limit-checking safety, so existing callers (`checkClientLimit`, `checkMemberCreationPermission`, settings, import) are unchanged.
- `app/(tabs)/index.tsx` — the upgrade banner now renders only when `subscription?.tier === 'free' && subscription.resolved !== false`, so a transient/unresolved lookup never flashes "Free plan".

**Non-regression notes**:
- `resolved` is optional; any code path that doesn't set it (none, after this change) is treated as resolved (`!== false`), so no other consumer behaviour changes.
- The forced token refresh only fires when claims are entirely absent (the race window), not on every call.
- Pre-existing, unrelated TypeScript warnings remain untouched: `subscriptionService.ts` `subscriptionRenewalDate` on `User`, and `index.tsx` `minHeight: '100vh'`.

## June 26, 2026

### Guide discoverability: in-app help icons + wiki-style guides hub

**Why**: Two discovery problems. (1) Users in the app had no contextual route to the relevant guide while using a complex tool. (2) With 27 guides, the `/guides` index had become a long wall of equal-weight cards.

**In-app help icons** (`app/` — runs on web + mobile):
- New shared component `components/GuideHelpButton.tsx` — a `help-circle-outline` Pressable that opens `https://guvnor.app/guides/<slug>`. Cross-platform: on web it opens a new tab (`window.open(..., '_blank')`) so the app stays open; on native it hands off via `Linking.openURL` (matching the existing home-screen Guides button). Props: `slug`, `color`, `size`, `style`, `accessibilityLabel`.
- Added to the header of nine non-obvious / fiddly screens, mapped to the most relevant guide:
  - Runsheet (`app/runsheet/[week].tsx`) → `runsheet`
  - Round Order Manager (`app/round-order-manager.tsx`) → `roundordermanager`
  - Workload Forecast (`app/workload-forecast.tsx`) → `workloadforecast`
  - Quote Wizard (`app/quote-wizard.tsx`) → `quotewizard`
  - Quotes (`app/quotes.tsx`) → `quotes`
  - Materials (`app/materials.tsx`) → `materials`
  - Accounts (`app/accounts.tsx`) → `payments`
  - Manage Services (`app/(tabs)/clients/[id]/manage-services.tsx`) → `manageservices`
  - Import Clients + Import Completed Jobs (`app/import-clients.tsx`, `app/import-completed-jobs.tsx`) → `importing`; Add Bulk Payments (`app/bulk-payments.tsx`) → `payments` (the payments guide has the dedicated bulk-payments section).
- Deliberately skipped simple screens (e.g. the basic client list) and the Rota, per the agreed scope.

**Wiki-style guides hub** (`web/`):
- New client component `web/src/components/GuidesBrowser.tsx` — a sticky category sidebar (jump links), a search box that filters by title/description as you type, and a one-line description under every guide. All 27 guides render in the server HTML (search only hides them client-side), so links stay crawlable for SEO.
- `web/src/app/guides/page.tsx` slimmed down to metadata + nav + `<GuidesBrowser />` + footer; the old inline arrays / `GuideCard` / `GuideSection` were removed and the container widened to `max-w-6xl` for the sidebar layout.

**Notes / non-regressions**:
- `Linking.openURL` and the web `window.open` guard (`Platform.OS === 'web'`) keep the help button working on both platforms without breaking native builds.
- Pre-existing TypeScript errors in `app/runsheet/[week].tsx` (lines ~408 and ~818) are unrelated to these edits (header/import only) and don't block the Metro/Expo build.
- Verified: `web` lint clean, `npm run build:marketing` passes and still emits all 27 guides + OG images; app screens lint clean aside from the two pre-existing runsheet errors.

### Fix: guide pages 404 on trailing-slash URLs (Vercel rewrites)

**Symptom**: `guvnor.app/guides` loaded, but opening any individual guide returned a Vercel `404 NOT_FOUND`. Verified that `/guides/<slug>` (no trailing slash) returned 200 while `/guides/<slug>/` (trailing slash) returned 404 — and this affected the original guides too, not just the new ones.

**Cause**: the marketing site is exported with `trailingSlash: true` (`web/next.config.ts`), so internal guide links and canonical URLs resolve to `/guides/<slug>/`. The `vercel.json` rewrite used a single parametrized rule `"/guides/:path*" → "/_marketing/guides/:path*/index.html"`. With the trailing slash present, that destination didn't resolve to the exported `index.html`, so Vercel fell through to a 404 (the catch-all SPA rewrite explicitly excludes `guides`). The bug was latent for all guides and only surfaced now because we started clicking through from the index.

**Fix** (`vercel.json`): replaced the two guides rewrites with four explicit rules that handle both forms — `"/guides"` and `"/guides/"` → the index, and `"/guides/:path+/"` and `"/guides/:path+"` → `"/_marketing/guides/:path+/index.html"` (the trailing-slash variant listed first so it wins). Other marketing routes were unaffected because their rewrite destinations are fixed files, not parametrized, so a trailing slash on the source doesn't corrupt the destination.

**Notes**: `firebase.json` was left as-is — `guvnor.app` is served by Vercel (the 404 page was Vercel's), and Firebase hosting uses a different SPA-catch-all model. Requires a Vercel redeploy to take effect.

### Marketing site: 11 new functionality guides (guides section expansion)

**Why**: The primary goal for the marketing site was to expand the `/guides` library with granular, SEO-friendly how-to articles covering app functionality. The first batch (10 guides) was committed in `5f85faa`; this adds 11 more so the guides section comprehensively documents the app. All content was written against the actual app screens (researched first) so it doesn't describe features that don't work.

**Guides added** (each is `web/src/app/guides/<slug>/page.tsx` + a matching `opengraph-image.tsx`):
- `gettingstarted` — Getting started: your first day on Guvnor (register, verify email, first-time setup modal, optional pricing).
- `importing` — Importing your clients & data (paste-grid import of clients & completed jobs; bulk payments cross-ref; desktop-first).
- `manageservices` — Adding extra services to a client (one-off + recurring extras via the client's Ad-hoc Job action; editing/pausing/regenerating in Manage Services).
- `completedjobs` — Completed jobs & runsheet history (Accounts → Completed Jobs for taking payments; Workload Forecast → Runsheet History).
- `exclients` — Archiving & restoring clients (Archive Client keeps history; restore prompts for round order).
- `payments` — Recording & taking payments (balance formula, single Add Payment, Bulk Payments matching by account number, Unknown Payments, GoCardless vs recording).
- `settings` — Settings & your business profile (gear-drawer location; Profile/Bank & Business/GoCardless/Quote Wizard; Subscription; Import/Export; Team; Data Management; Sign Out).
- `billing` — Upgrading & managing your billing (web-only Stripe checkout/portal; team members inherit owner plan; client-limit behaviour).
- `auditlog` — The Activity Log (reached from the Rota header; what is/isn't logged; search/date/filter tools).
- `quotewizard` — The Quote Wizard: instant online pricing (image/price presets feeding the public quote page; distinct from Quotes pipeline and the national marketing forms; leads land in New Business).
- `materials` — Materials: flyers, invoices & branding (branding/bank config; flyer/canvassing/invoice outputs; QR to quote page; web-only upload/download).

**Files changed**:
- `web/src/app/guides/page.tsx` — added the 11 new guides into the existing section arrays (Getting started, Running your round, Winning new work, Money & accounts, Your account & team). The index now lists 27 guides.
- `web/src/app/sitemap.ts` — added all 11 new `/guides/<slug>/` routes.
- `scripts/merge-builds.js` — extended the route-verification list with the 11 new guides (the per-guide OG copy loop already auto-discovers them).

**Accuracy decisions (researched, deliberately scoped to avoid documenting non-working paths)**:
- Recurring extra services are documented via the client detail **Ad-hoc Job → Additional Recurring Work** flow (which confirms "jobs have been scheduled"), not the Manage Services "Add Service" path (which writes the legacy array without scheduling jobs). Frequency/date edits direct the user to **Regenerate Schedule**.
- Settings guide explicitly notes password change is via the sign-in **Forgot your password?** link and that email/notifications are not editable in-app (no such screens exist).
- Billing guide states upgrade and Manage Billing are web-only (the phone app redirects to web); avoids referencing the unverified `/upgrade-success` return pages.
- Audit Log guide lists only actions actually logged (client/quote/job/GoCardless-payment) and notes it isn't a full record — rota/team/payment-edit categories aren't currently logged.
- Quote Wizard guide separates the three "quote" concepts (Quote Wizard microsite pricing vs the internal Quotes pipeline vs the national Guvnor marketing lead forms) and notes bin pricing is set during initial quote setup.
- Materials guide flags web-only logo/photo upload and PNG download, mobile = preview only, and that per-item options are session-only.

**Verification**: `npm run build:marketing` passes (lint + types), all 11 new pages and their `opengraph-image` PNGs generate, and `sitemap.xml`/`robots.txt` still emit. Research carried out by four read-only explore subagents across onboarding/settings/audit, payments/billing, client management, and quote-wizard/materials.

## June 25, 2026

### Marketing site: JSON-LD structured data + per-guide Open Graph images

**Why**: Follow-up to the SEO foundations. Two additions: (1) schema.org structured data so Google understands the brand, the app and each guide as a proper Article (eligible for richer results); (2) a unique social-share image per guide instead of the single default card, so links shared to social/messaging look tailored.

**Files added**:
- `web/src/lib/jsonld.ts` — builders: `organizationSchema()`, `softwareApplicationSchema()` (includes Free £0 + Premium offers, price pulled from `shared/constants/pricing.ts`), and `articleSchema({ slug, title, description? })`.
- `web/src/components/JsonLd.tsx` — renders a schema object (or array) as a `<script type="application/ld+json">` tag.
- `web/src/lib/ogImage.tsx` — shared `renderGuideOgImage(title)` using `ImageResponse` from `next/og` (bundled with Next, no extra deps), plus `ogSize`/`ogContentType`. Dark indigo→navy gradient card with the Guvnor wordmark, the guide title and "A Guvnor guide · guvnor.app".
- `web/src/app/guides/<slug>/opengraph-image.tsx` × 16 — tiny per-guide files that re-export the size/contentType and call `renderGuideOgImage(<title>)`. `export const dynamic = "force-static"` so they generate as static PNGs under `output: export`.

**Files changed**:
- `web/src/app/home/page.tsx` — renders `Organization` + `SoftwareApplication` JSON-LD (the `/` route re-exports this page, so the homepage gets it too).
- `web/src/components/GuideLayout.tsx` — added an optional `jsonLd` prop; the 10 new guides pass `articleSchema(...)` through it.
- The 6 original guides — render `<JsonLd data={articleSchema(...)} />` directly (they don't use `GuideLayout`).
- `web/src/lib/seo.ts` — `pageMetadata` gained an `image` option (defaults to the site card; pass `null` to omit). `guideMetadata` now points `og:image`/`twitter:image` at the per-guide path `/og/<slug>.png`.
- `web/src/lib/jsonld.ts` `articleSchema` image also points at `/og/<slug>.png`.
- `scripts/merge-builds.js` — after copying `web/out` → `dist/_marketing`, it now copies each generated `guides/<slug>/opengraph-image` to `dist/og/<slug>.png`, and the route-verification list was extended to include all current guides.

**Notes / why the OG images are served from `/og/<slug>.png`**:
- The hosting rewrites (`vercel.json` + `firebase.json`) map `/guides/:path*` into `/_marketing/guides/:path*/index.html`, so the default extension-less `next/og` route URL (`/guides/<slug>/opengraph-image`) is **not reachable** by social scrapers in production. Instead we generate the PNG at build time, then publish it to a root-level `/og/<slug>.png` path. That path is excluded from the SPA rewrite (the `.png` exclusion in `vercel.json`; Firebase serves existing static files before rewrites), and lands at dist root via `copy-assets`/expo export conventions — the same mechanism the default `/og-image.png` relies on.
- Because the guide metadata sets `openGraph.images` explicitly, Next uses that URL and suppresses the file-convention tag (verified: each guide HTML has a single `og:image` = `https://guvnor.app/og/<slug>.png`).
- Using `next/og` (real fonts) rather than AI-generated art guarantees correct, crisp text on every card — verified by rendering the Workload Forecast card.
- Verified with `npm run build`: lint + types pass, all 16 `opengraph-image` PNGs generate (~210–235 KB each), JSON-LD (Organization/SoftwareApplication on home, Article on every guide) is present in the exported HTML, and the merge copy loop produces all 16 `/og/*.png` files.
- `SoftwareApplication` intentionally omits `aggregateRating` (no genuine ratings to cite) to stay within Google's structured-data policies.

### Marketing site: SEO foundations (per-page metadata, sitemap, robots, OG image)

**Why**: Every marketing page (including the new guides) was inheriting the single global title/description from `web/src/app/layout.tsx`, so Google saw duplicate titles and descriptions across the whole site. There was also no `sitemap.xml`, no `robots.txt`, no `metadataBase` (so Open Graph/canonical URLs were not absolute) and no default social-share image. This adds the standard SEO foundations for the static-exported (`output: 'export'`) Next.js site.

**Files added**:
- `web/src/lib/seo.ts` — `SITE_URL`, `OG_IMAGE`, and two helpers: `pageMetadata({ title, description, path, keywords })` and `guideMetadata({ slug, title, description })`. Each returns a Next `Metadata` object with a unique title/description, a canonical URL (`alternates.canonical`), Open Graph tags and a Twitter `summary_large_image` card. Paths include trailing slashes to match `trailingSlash: true`.
- `web/src/app/sitemap.ts` — generates `/sitemap.xml` listing all indexable routes with absolute URLs. Excludes the `/home` duplicate of `/`, plus the `forgot-password`/`set-password` utility pages. Uses `export const dynamic = "force-static"` (required under `output: export`).
- `web/src/app/robots.ts` — generates `/robots.txt` (allow all, disallow the two utility pages, points to the sitemap and sets `host`). Also `force-static`.
- `web/public/og-image.png` — default 1200x630 branded social-share card backing the OG/Twitter image hook.

**Files changed**:
- `web/src/app/layout.tsx` — added `metadataBase: new URL("https://guvnor.app")` (so relative canonical/OG URLs resolve to absolute), plus a default `openGraph.images` and a `twitter` `summary_large_image` card pointing at `/og-image.png`.
- Added unique per-page metadata via the helpers to: `home`, `feature-tour`, `pricing`, `about`, `contact`, the `guides` index, and all 16 guide pages (6 original + 10 new). `terms` and `privacy-policy` were switched onto `pageMetadata` so they also get canonical + OG tags (their existing titles/descriptions/keywords preserved).
- `web/src/app/page.tsx` (the `/` route) now re-exports `metadata` from `home/page` as well as the default, so the homepage carries real metadata; both `/` and `/home/` canonicalise to `https://guvnor.app/` to avoid duplicate-content.

**Notes / accuracy decisions**:
- Next.js shallow-merges metadata: a page-level `openGraph` *replaces* the root layout's, so the default share image is re-declared inside `pageMetadata`/`guideMetadata` rather than relying on inheritance (verified the absolute `og:image` now renders on guide/pricing/home pages).
- `forgot-password` is a client component so it cannot export `metadata`; it keeps inheriting the root defaults and is excluded from the sitemap (utility page only).
- Verified with `npm run build`: lint + types pass and the export emits `out/sitemap.xml`, `out/robots.txt`, `out/og-image.png`, with canonical + OG/Twitter tags present on sampled pages.
- JSON-LD / structured data (Organization, SoftwareApplication, Article/FAQ schema) was intentionally **not** added in this pass — noted as a possible follow-up.

### Marketing site: 10 new functionality guides under /guides

**Why**: The existing guides only covered getting-set-up topics (migration, finding customers, bin cleaning, member accounts, accounts, GoCardless). Core day-to-day functionality had no coverage. Added granular how-to guides for the main app features and reorganised the guides index. Content was grounded in the actual app screens (runsheet, round-order-manager, workload-forecast, rota, quotes, quote-wizard, new-business, add-client, chase-payment, subscriptionService) to keep it accurate.

**Files added**:
- `web/src/components/GuideLayout.tsx` — shared chrome for the new guides (MarketingNav + content container + Back to Guides / Ask a question CTAs + footer) plus small typographic helpers (`GuideH2`, `GuideP`, `GuideTerm`, `GuideList`, `GuideSteps`, `GuideCallout`). Keeps each new guide page focused on content and avoids re-duplicating the footer markup.
- `web/src/app/guides/runsheet/page.tsx` — Using the Runsheet (auto-built schedule, working a day, ETA/Navigate/notes, completing jobs, rollover, reset day, phone vs desktop).
- `web/src/app/guides/roundordermanager/page.tsx` — Setting your round order (drag/drop, move-to-position, search, save renumbering, gaps/duplicates normalisation).
- `web/src/app/guides/workloadforecast/page.tsx` — Workload Forecast & smart planning (52-week job counts, rota-driven availability badges, reset future weeks, runsheet history).
- `web/src/app/guides/etamessages/page.tsx` — Sending ETA & courtesy messages (set ETA, Message ETA SMS templates for service vs quote jobs, account summary text, mobile-only).
- `web/src/app/guides/quotes/page.tsx` — Creating & managing quotes (Scheduled → Pending → Won/Lost pipeline, quote visit on runsheet, lines, convert to client).
- `web/src/app/guides/chasingpayments/page.tsx` — Chasing late payments (balance calc, account summary text, downloadable Chase Payment statement PDF, GoCardless cross-link).
- `web/src/app/guides/quotepage/page.tsx` — Your quote page & New Business leads (public guvnor.app/business page, Quote Wizard presets, New Business inbox, Schedule Quote / Add Client, Guvnor leads).
- `web/src/app/guides/clients/page.tsx` — Adding & managing a client (form fields, auto job scheduling on save, free-plan limit, managing afterwards).
- `web/src/app/guides/rota/page.tsx` — Using the team Rota (ON/OFF/— grid, owner vs member edit rights, default schedules, feeds Workload Forecast).
- `web/src/app/guides/subscription/page.tsx` — Free vs Premium (20-client free limit, Premium unlimited + team, upgrade paths, members inherit owner plan; links to /pricing for the current price rather than hard-coding it).

**Files changed**:
- `web/src/app/guides/page.tsx` — rebuilt the index to group guides into sections (Getting started / Running your round day to day / Winning new work / Money & accounts / Your account & team) using a small local `GuideCard`/`GuideSection` map. Existing 6 guides preserved; 10 new ones added.

**Notes / accuracy decisions**:
- New guides use the shared `GuideLayout`; the original 6 guide pages were left untouched (still inline their own nav/footer) to avoid regressions — they can be migrated later.
- The chasing-payments guide deliberately does **not** claim email sending from the Chase Payment screen, because `handleSendEmail` there is currently a no-op TODO; the working channels (account-summary SMS from the runsheet + downloadable PDF statement) are documented instead.
- "Quote Wizard" (image/price presets for the public quote page) is described separately from the "Quotes" pipeline screen, since they are different features.
- Premium price not hard-coded in copy (links to `/pricing`) to avoid drift; current price is £4.99/month per `shared/constants/pricing.ts`.
- `npx next lint` passes for the new files (no unescaped-entity issues).

---

## June 24, 2026

### UK window-cleaner lead list scraped from Google Maps

**Why**: Building a comprehensive list of established UK window cleaners for outreach/marketing. Two-step task: first a list of the top 100 UK towns, then a scrape of window cleaners in each.

**Files added**:
- `data/top-100-uk-towns.csv` — top 100 UK towns (rank, town, county/area, nation, approx population).
- `data/uk-window-cleaners.csv` — scraped window cleaners across all 100 towns. Columns: `town,business_name,phone,address,website`. **9,652 rows** captured (duplicates expected across nearby towns — to be de-duped by the user).
- `data/sink.js` — tiny local Node HTTP server (port 8099) used during the scrape to append browser-extracted CSV rows straight to disk (avoids base64/clipboard transcription). Not part of the app runtime; can be deleted once the list is finalised.

**Method**: Browser automation against Google Maps search (`window cleaners in <town>`). For each town the results feed was auto-scrolled to load all listings, then name/phone/partial-address/website were extracted per card and POSTed to the local sink. London (town 1) was captured earlier with full addresses incl. postcodes; towns 2–100 use the faster, more reliable list-view (name, phone, website, town + partial street). A few towns (Wigan, Nuneaton, Paisley) initially returned truncated feeds and were re-run with county-qualified queries; Paisley genuinely returns a sparse listing.

**De-duplication (June 24)**: Removed **2,700** duplicate rows from `data/uk-window-cleaners.csv` (9,651 → **6,951** unique businesses). Match priority: normalised UK phone number, then website hostname, then business name + address. Exact duplicate lines (336) removed first. One-off script: `data/dedupe-window-cleaners.js`.

**Mobile-only filter (June 24)**: Kept only rows with a UK mobile (`07…` or `+44 7…`). **6,951 → 4,600** rows — removed 218 blank phones and 2,133 landlines/other numbers. Script: `data/filter-mobile-only.js`.

**Developer outreach dashboard (June 24)**: Settings → Developer → **Window Cleaner Outreach** (`/window-cleaner-outreach`, `DEVELOPER_UID` only). Loads `data/uk-window-cleaners.csv`, lists leads with **To contact / Contacted / All** filters, opens `wa.me` with an editable message template (saved locally via AsyncStorage), and records **sent date/time** in Firestore (`developerWindowCleanerOutreach`). Template placeholders: `*Town*`, `*Company name*`. Contacted rows are highlighted green; **Reset** clears a touch. CSV copied to `public/data/` for dev and `dist/data/` on production build; `vercel.json` updated to serve `.csv` statically. **Deploy `firestore.rules`** before first use.

---

## June 12, 2026

### Premium subscription price changed to £4.99/month

**Why**: Business decision — Premium moves from £2.99 to £4.99 a month.

**Stripe (live, via API)**:
- Created new recurring Price **`price_1ThYwRF7C2Zg8asU4f2W3AOF`** (£4.99/mo GBP) on product `prod_SjsT3QnGUMHajK` and set it as the product's default price.
- Archived the old £2.99 price (`price_1TQsyaF7C2Zg8asUXyVbFh3r`) and the stale £18 price (`price_1RoOifF7C2Zg8asU9qRfxMSA`) so neither can be used for new checkouts.
- There were **zero active subscriptions**, so no existing subscribers needed migrating.

**Files changed**:
- `shared/constants/pricing.ts` — `UNLIMITED_PLAN.price` 2.99 → **4.99**; all `PREMIUM_PRICE_*` labels (app upgrade prompts, web pricing/home/metadata) follow automatically.
- `config.ts` — default `premiumPriceId` → the new £4.99 price id.
- `config.example.ts` — comment updated.
- `.env.local` (not committed) — stale `EXPO_PUBLIC_STRIPE_PREMIUM_PRICE_ID` override pointed at the archived £18 price; now set to the new £4.99 price so local dev checkouts work.

**Verification**: production web bundle was inspected and contains only the code-default price id (no Vercel env override for `EXPO_PUBLIC_STRIPE_PREMIUM_PRICE_ID`), so deploying this commit is sufficient for production checkouts to charge £4.99.

---

### Quote Wizard auto-migrates legacy setup mega-docs into per-preset docs

**Why**: Accounts that completed the first-login quote setup *before* the one-doc-per-preset fix (below) were left with a single unnamed `quoteWizards` doc holding all priced presets. That doc rendered as one "Untitled quote +N more" card and didn't match what the editor/microsite expect. Verified on production with a fresh test account that the new setup flow writes the correct per-preset docs; only pre-fix accounts carry the legacy shape.

**Files changed**:
- `app/quote-wizard.tsx` — on list load, docs with an empty `customerName`, more than one item, and all item images under the setup `presets/` storage folder are split into one doc per item named "Property type N" (original doc deleted, images reused in place, `createdAt` preserved). Runs once per affected account, owner-side, under existing Firestore rules; hand-made quotes are never touched (they have names and per-quote storage paths). Verified locally against a seeded legacy doc: it split into correctly named cards on first visit.

---

### Quote setup now creates one wizard doc per preset (fixes broken /quote-wizard list)

**Why**: The first-login window quote setup wrote a single `quoteWizards` doc containing all 8 priced presets with an empty `customerName`. The Quote Wizard list screen treats each doc as one property type (name + up to ~3 pricing badges), so the setup output rendered as one unnamed mega-card with up to 24 badges sprawling across the row (user-reported screenshot). The doc's empty name also fed through to the microsite item `label` and failed the editor's save validation.

**Files changed**:
- `app/quote-setup.tsx` — saves one `quoteWizards` doc per priced preset, named "Property type N" (matching the setup screen's captions). List view, editor and microsite labels all behave like hand-made quote examples.
- `app/quote-wizard.tsx` — defensive polish for any oddly-shaped docs: list cards fall back to "Untitled quote" when the name is empty, and pricing badges cap at 6 with a "+N more" badge.

**Note**: wizards created by quote-setup before this fix remained a single multi-item doc; the auto-migration entry above now splits these on the owner's next visit to Quote Wizard.

---

### Window quote setup: choice of frequency pairing (4 & 8 / 6 & 12 / 1 & 2 weekly)

**Why**: The first-login pricing screen hardcoded the two regular columns as 4 weekly and 8 weekly. Window cleaners run different cadences; per spec the offering is a choice of one of three pairings — 4 & 8 weekly (default), 6 & 12 weekly, or 1 & 2 weekly — plus the one-off column. Window-cleaning-specific paradigm; the bin variant keeps its own 4/8 toggle from earlier today.

**Files changed**:
- `app/quote-setup.tsx` — new "How often do you visit?" pair selector card above the preset images (`WINDOW_FREQ_PAIRS`). The two price-column labels follow the selection live, and saved pricing lines get `frequencyWeeks` from the chosen pair. Internal field names renamed four/eight → first/second.

**No downstream changes needed**: pricing lines already carry arbitrary `frequencyWeeks` through `getQuoteOptions` (no redeploy required); the microsite, New Business and Guvnor Leads all render "N Weekly" generically; the quote-wizard editor takes frequency as free numeric input; client service plans accept any `frequencyWeeks`. Existing wizards are untouched — this only affects what new setups write.

---

### Bin cleaner quote setup: regular cleans now specify a frequency (4 or 8 weekly)

**Why**: The bin quote setup asked for a "regular clean" price with no way to say how regular, and the microsite hardcoded every regular bin lead as 4-weekly. A bin cleaner running an 8-weekly round would get every lead tagged with the wrong frequency.

**Files changed**:
- `app/quote-setup.tsx` — bin variant gains a required "How often do you visit?" toggle (Every 4 weeks / Every 8 weeks, defaults to 4), saved as `binPricing.frequencyWeeks`.
- `types/models.ts` — `binPricing.frequencyWeeks?: number` (missing = 4).
- `functions/index.js` — `getQuoteOptions` returns `binPricing.frequencyWeeks`, defaulting to 4 for accounts saved before this change. **Deployed to portalApi.**
- `app/[businessName]/quote.tsx` — the consumer's "Regular clean" option now reads "Regular clean — every N weeks" and submits the provider's actual frequency (`selectedFrequency: '4'` or `'8'`) instead of a hardcoded `'4'`. `'8'` is already a fully supported frequency downstream (window leads use it), so New Business scheduling behaves correctly.

**Regression note**: existing/legacy data is unaffected — any `binPricing` without `frequencyWeeks` resolves to 4-weekly, which is exactly the previous behaviour.

---

### "Wheelie bin cleaning" → "Bin cleaning" everywhere + bin cleaner guide + full sign-up tests

**Why**: Terminology decision — the vertical is called "bin cleaning", not "wheelie bin cleaning", everywhere a user sees it. Also added the first trade-specific guide for bin cleaners on the marketing site, and end-to-end browser-tested the complete sign-up journey (registration → email verification via temp-mail → first login → quote setup → microsite) for both trades.

**Terminology (all user-facing "wheelie" copy removed)**:
- `shared/constants/businessTypes.ts` — registration/settings card label "Wheelie bin cleaning" → "Bin cleaning"; flyer services default first line; Maps search term `wheelie bin cleaning` → `bin cleaning`.
- `app/[businessName]/quote.tsx` — bin-count step subtitle "Wheelie bins of any colour…" → "Bins of any colour…".
- `app/welcome-bin-cleaning.tsx` — page title/meta description, hero "Stinky wheelie bins?" → "Stinky bins?".
- `app/bin-cleaning-quote.tsx` — page title/meta description and hero subtitle.
- `app/guvnor-leads.tsx` — Google Maps search term for bin-cleaning leads.

**New guide**:
- `web/src/app/guides/bincleaning/page.tsx` (new) — "Bin Cleaners: Getting Started on Guvnor": register as a bin cleaner, set per-bin prices, share the quote page, density-first customer acquisition ("win the street, not the house"), running the round. Same layout/footer as the existing guides.
- `web/src/app/guides/page.tsx` — guide card added to the index.

**Sign-up tests (browser, temp-mail.org addresses, against localhost + production Firebase)**:
- Window cleaner: registered with trade selector, received "Verify your email for Guvnor" from noreply@guvnor.app, verified, logged in, completed first-time setup wizard, was auto-routed to /quote-setup, priced all 8 preset houses, saved — `getQuoteOptions` then returned all 8 image items with correct pricing lines, and the microsite rendered.
- Bin cleaner: same journey; quote setup correctly showed the image-free per-bin questionnaire (£4.50/£7 saved to `binPricing`), and the consumer microsite quote flow showed "How many bins need cleaning?" with live prices (1 bin £4.50 → 4+ bins £18.00) and the new de-wheelied subtitle.
- All test data deleted afterwards (auth users, user/portal/quoteWizards docs, accounts/{uid} subtrees via firebase CLI, storage preset uploads); dev browser session backed up/restored.

**Observation for future polish**: the email verification landing page is the default Firebase-hosted template on roundmanagerapp.firebaseapp.com (unbranded, "CONTINUE" button) — could be themed or pointed at a custom action handler later.

---

### Marketing copy polish + fixed provider sign-up flow from marketing site

**Why**: With multiple verticals now supported, the window-cleaning-specific copy on the public pages needed generalising. More importantly, every "Start Free" / "Sign In" CTA on the marketing site (`/home`, `/pricing`, `/about`, `/feature-tour`, `/contact`, `/terms`, `/privacy-policy`, the guides, and the marketing nav) linked to `/`, which since the consumer-first homepage change redirects signed-out visitors to `/welcome` ("Need a window cleaner?") — completely the wrong flow for a provider who just clicked "Start Free - No Credit Card Required".

**Files changed**:
- `app/welcome.tsx` — provider band title "Clean windows for a living?" → "Provide a local service for a living?" (the bin-cleaning landing page keeps its targeted "Clean bins for a living?").
- `web/src/app/home/page.tsx` — hero "Manage Your Cleaning Rounds / Like a Pro" → "Manage Your Rounds / Like a Pro".
- All `href="/"` links across `web/src` (26 instances in 14 files: home, pricing, about, contact, feature-tour, privacy-policy, terms, guides index + 5 guide pages, MarketingNav) now point to `/login`, where providers can sign in or follow "Register here" and pick their trade. `/login` is served by the Expo SPA on the same domain (vercel.json rewrite), so the links work unchanged.

**Verified**: `/welcome` renders the new provider band copy in the browser; marketing link changes are a mechanical `href="/"` → `href="/login"` swap with no remaining root links (grepped).

---

### Provider business types: bin cleaner accounts (registration → onboarding → microsite)

**Why**: The consumer side of the bin cleaning vertical (below) generates leads, but a bin cleaner opening a Guvnor account still got a window-cleaning-flavoured app. This adds a hard window-cleaner / bin-cleaner distinction on provider accounts. **Regression rule: a missing `businessType` on a user doc means window cleaning** — every existing account behaves identically with zero migration; all bin behaviour is new, additive branches. The internal `serviceId: 'window-cleaning'` is NOT renamed anywhere; it means "the primary recurring round service" for every vertical and only its display name changes.

**Files changed**:
- `shared/constants/businessTypes.ts` (new) — single source of truth per vertical: display labels (primary service name, job-tag noun), one-off and recurring additional-service picker lists, flyer defaults/section title, Maps search term. `getBusinessTypeConfig()` resolves any stored value (including undefined/legacy) to a config, defaulting to window cleaning. Also exports `WINDOW_QUOTE_PRESETS` — the developer's 8 quote-wizard house images, scraped from Firebase Storage, resized to 800px JPEG (~100KB each) and committed under `assets/images/quote-presets/`.
- `types/models.ts` — `User` gains `businessType`, `binPricing { perBin, oneOffPerBin? }`, `quoteSetupComplete`.
- `app/register.tsx` — required "What kind of business do you run?" selector (two cards: 🪟 Window cleaning / 🗑️ Wheelie bin cleaning); `businessType` written into the user doc at registration.
- `app/(tabs)/settings.tsx` — business type shown/editable in the Bank & Business Info modal; clears the cached config on save.
- `services/userService.ts` — `getAccountBusinessTypeConfig()`: resolves the config from the **owner's** user doc (members inherit the account's vertical), cached per owner.
- `app/quote-setup.tsx` (new) — first-login pricing questionnaire, owner-only, skippable ("I'll do this later"). **Window variant**: steps through the 8 preset house images with 4-weekly/8-weekly/one-off price inputs; on save, priced presets are uploaded into the user's own storage (`quoteWizards/{uid}/presets/`) and saved as a standard `quoteWizards` doc — their microsite quote wizard works from day one and stays fully editable in /quote-wizard. **Bin variant**: no images, just price-per-bin (+ optional one-off per bin), saved to `users/{uid}.binPricing`.
- `app/(tabs)/index.tsx` — dashboard gate (both load paths): owner + `businessType` set + first-time setup done + `quoteSetupComplete !== true` → redirect to /quote-setup. Runs *after* the existing first-time setup modal so members entering invite codes are never caught. Legacy accounts (no businessType) are never prompted.
- `functions/index.js` — `getQuoteOptions` additionally returns the business's `businessType` and `binPricing` (one extra user-doc read). **Deployed to portalApi.**
- `app/[businessName]/quote.tsx` — bin-cleaning businesses get a count-based flow after the contact form: "How many bins?" (1–4+, instant per-clean price from `binPricing`) → Regular/One-off service choice → submit. Bin count lands in the lead's `propertyType` ("2 bins"); frequency `4` or `one-off`. Window businesses' image flow is untouched (verified: dev account still returns its 8 image items).
- In-app copy keyed off the config: `app/runsheet/[week].tsx` (ETA-message service name, GoCardless payment description, quote-line placeholder; one-off detection list now a cross-vertical union), `app/completed-jobs.tsx` (job tags, e.g. "4 Weekly Bin Clean"), `app/(tabs)/clients/[id]/manage-services.tsx` (one-off + recurring service pickers and defaults), `app/materials.tsx` (flyer section title + bin-flavoured defaults for invoice/flyer/canvassing text), `app/login.tsx` (consumer link generalised to "Looking for a local service?").

**Tested in browser end-to-end (throwaway account, since deleted)**: registered a bin-cleaning account → first-time setup → automatically routed to /quote-setup (bin variant) → saved £5/bin + £8 one-off → dashboard. Its microsite (/testbinsrus/quote) served the bin flow: 1–4+ bins with instant prices (2 bins = £10.00), Regular/One-off choice (£10/£16), submit → lead appeared in its New Business with "2 bins" and "4 Weekly at £10.00". Window regression spot-checked: deployed getQuoteOptions returns the dev account's 8 image items with null businessType, and the dev dashboard loads with no quote-setup redirect. All test data cleaned up (auth user, user doc, portal, vehicle/member/rota docs, test lead).

---

### Bin cleaning vertical: landing page + quote funnel (first non-window-cleaning vertical)

**Why**: Strategic expansion of Guvnor's lead-gen marketplace beyond window cleaning, one vertical at a time. Bin cleaning chosen first: bin cleaners' economics depend entirely on round density, making them the most natural fit for Guvnor's round-management tooling. Per the agreed strategy, the existing window cleaning homepage, funnel and Facebook campaign are untouched; each new vertical gets its own landing page and funnel feeding the same Guvnor Leads inbox.

**Files changed**:
- `app/welcome-bin-cleaning.tsx` (new) — consumer-facing landing page (`guvnor.app/welcome-bin-cleaning`), mirroring `/welcome`'s structure: hero ("Stinky wheelie bins?"), how-it-works steps, provider band, footer. CTAs route to `/bin-cleaning-quote`. UTM capture + Meta Pixel on mount, SEO title/description.
- `app/bin-cleaning-quote.tsx` (new) — public quote funnel mirroring `/window-cleaning-quote`, with bin-specific questions instead of property type/conservatory: how many bins (1/2/3/4+), which bins (General waste / Recycling / Garden waste / Food caddy, multi-select), and frequency. The bin answers are summarised into the existing `propertyType` field (e.g. "2 bins — General waste, Recycling") so the rest of the lead pipeline displays them unchanged. Submits with `serviceCategory: 'bin-cleaning'`; fires Meta Pixel `Lead` on success.
- `app/_layout.tsx` — `/bin-cleaning-quote` and `/welcome-bin-cleaning` added to `unauthAllowed` so unauthenticated visitors aren't redirected to login.
- `functions/index.js` — `submitQuoteRequest` accepts and sanitises an optional `serviceCategory` string (40 chars), stored on the quoteRequest. Absent/null = window cleaning (the original funnel — old leads and the untouched window funnel need no migration). **Deployed to portalApi.**
- `app/guvnor-leads.tsx` — each lead card now shows a green service tag (🗑️ Bin cleaning / 🪟 Window cleaning, defaulting to window cleaning for legacy leads). The Google Maps cold-call button is vertical-aware ("Find wheelie bin cleaning near TE1 1ST" for bin leads). Header subtitle generalised from "from guvnor.app/window-cleaning-quote" to "from the public Guvnor quote pages". `serviceCategory` survives lead assignment automatically since assignment updates the same document.

**Tested in browser end-to-end**: loaded /welcome-bin-cleaning (renders, CTA routes), filled and submitted /bin-cleaning-quote (2 bins, General waste + Recycling, every 4 weeks) against the freshly deployed portalApi → lead appeared in /guvnor-leads with the Bin cleaning tag, bin summary, frequency, UTM label, and the vertical-aware Maps button. Test lead deleted afterwards.

**Notes**: New-business handoff needs no changes — assigned bin leads carry the readable bin summary in `propertyType`. When ads point at this vertical, use e.g. `guvnor.app/welcome-bin-cleaning?utm_source=facebook&utm_campaign=bins-launch`.

---

## June 11, 2026

### Runsheet notes rework: inline account notes + per-job notes

**Why**: Two awkward note systems on the runsheet. (1) Account-level runsheet notes (`client.runsheetNotes`) were hidden behind a "!" icon that opened a modal — an extra tap to see critical info like gate codes. (2) "Add note below" created free-standing fake job documents (`clientId: 'NOTE_JOB'`, `originalJobId` reference) that could become disassociated/orphaned from their job when jobs moved days or weeks.

**Files changed**:
- `types/models.ts` — `Job` gains optional `jobNote?: string`.
- `app/runsheet/[week].tsx`:
  - **Account runsheet notes now display inline** on every job card from that account (amber strip below the client name). The "!" button, its modal, and related state/styles removed. Still permanent and managed from the client account screen as before.
  - **"Add note below" replaced with "Add job note" / "Edit job note"** (label adapts) in all four action menus (iOS ActionSheet + web/Android modal, regular + quote jobs). The note is stored as a `jobNote` field ON the job document itself, so it always travels with the job through move/defer/vehicle allocation and can never be orphaned. Shown inline as a blue "📝" strip on the job card (regular and quote jobs). One-off by design: future recurring visits are new job docs without the note.
  - Note modal: prefills the existing note when editing; saving empty text removes the note (`deleteField()`). Hint text explains both behaviours.
  - **Legacy NOTE_JOB documents are untouched**: existing free-standing notes still render (yellow card), still sort below their original job, and can still be deleted by tapping them. They just can't be created any more, so they'll die out naturally.

**Verified in browser end-to-end**: account "ex GC" runsheet notes render inline on their job cards with no "!" icon; added a job note via the action sheet → blue strip appeared instantly; survived a full page reload (Firestore-persisted); action menu label switched to "Edit job note" and prefilled; cleared text + save removed the note from card and Firestore. Test note removed afterwards.

---

### Meta Pixel on the Guvnor lead-gen funnel

**Why**: The developer launched his first Facebook traffic campaign (Guvnor – Leads – Traffic – June 2026) and created a Meta dataset/pixel (`Guvnor Pixel`, ID 1006997388546229). Installing the Pixel lets Meta tie ad clicks to real quote submissions, unlocks conversion reporting in Ads Manager, and enables future Leads-objective campaigns that optimise toward people who actually complete the form rather than just clicking.

**Files changed**:
- `utils/metaPixel.ts` (new) — `initMetaPixel()` injects the standard fbevents.js bootstrap (web-only, SSR-guarded, idempotent, swallow-all error handling so ad blockers can't break the page), inits pixel `1006997388546229` and fires `PageView`. `trackMetaPixelEvent(name)` fires standard events; no-op when the pixel isn't loaded.
- `app/welcome.tsx` + `app/window-cleaning-quote.tsx` — call `initMetaPixel()` on mount alongside the existing UTM capture. The pixel is deliberately loaded ONLY on these public funnel pages, not the logged-in app — conversion signal, not user surveillance.
- `app/window-cleaning-quote.tsx` — fires the standard `Lead` event after `submitQuoteRequest` succeeds (just before the success screen renders). That's the conversion Meta's Leads objective optimises against.

**Tested in browser end-to-end**: loaded /window-cleaning-quote → confirmed `fbevents.js` loaded, pixel config fetched for ID 1006997388546229, and `PageView` hit `facebook.com/tr`. Submitted a test lead → confirmed `ev=Lead` request sent to `facebook.com/tr` and the success screen rendered. Test lead deleted from /guvnor-leads afterwards.

**Notes**: Meta's Events Manager "Test events" tab can be used to watch events live once the deploy is out (events from localhost during testing may also appear). Conversions API (server-side events from `portalApi`) is a possible future upgrade for resilience against ad blockers; not needed at current scale.

---

### UTM campaign tracking on the Guvnor lead-gen funnel

**Why**: The developer is about to run Facebook ads (and other channels) pointing at guvnor.app. Without attribution, there's no way to tell which leads came from which ad/campaign versus organic search, so ad spend can't be evaluated.

**How it works**: Ad links carry standard `utm_*` query params, e.g. `guvnor.app/window-cleaning-quote?utm_source=facebook&utm_medium=cpc&utm_campaign=june-launch&utm_content=before-after-photo`. Those labels are captured on page load, stamped onto the lead at submission, and shown on the Guvnor Leads card.

**Files changed**:
- `utils/utmTracking.ts` (new) — `captureUtmParams()` reads `utm_source/medium/campaign/content/term` from the URL and stashes them in `sessionStorage` (web-only, guarded, 100-char cap per value, never throws); `getStoredUtmParams()` returns them at submit time. sessionStorage means attribution survives in-funnel navigation (homepage → quote form) but doesn't follow the visitor across days.
- `app/_layout.tsx` — captures UTMs once on first mount, *before* the unauth `/` → `/welcome` redirect strips the query string, so ads pointed at the bare domain still attribute.
- `app/welcome.tsx` + `app/window-cleaning-quote.tsx` — also capture on mount (covers direct links); the quote form sends `utm: getStoredUtmParams()` in the submission payload.
- `functions/index.js` — `submitQuoteRequest` sanitises the optional `utm` object (whitelisted keys, strings only, 100-char cap) and stores it on the `quoteRequests` doc as a `utm` map (or `null`). Deployed `portalApi`.
- `app/guvnor-leads.tsx` — lead cards show a pill with `source · campaign · content` (e.g. "📣 facebook · june-launch · before-after-photo") when UTM data exists, otherwise an "Organic / direct" note.

**Not affected**: microsite quote wizards (per-business portals) are unchanged — this is only the central Guvnor funnel. Assigned leads keep their `utm` field in Firestore but recipients' New Business cards don't display it (not their concern).

**Tested in browser end-to-end**: loaded `/window-cleaning-quote?utm_source=facebook&utm_medium=cpc&utm_campaign=june-launch&utm_content=before-after-photo` → sessionStorage captured all four values → submitted a test lead → card in /guvnor-leads showed the "facebook · june-launch · before-after-photo" pill → test lead deleted.

---

### Offline-tolerant runsheet: instant job completion + Firestore persistent cache

**Why**: In the field with poor/no signal, marking a job complete replaced the whole runsheet with a spinner for up to ~2 minutes (blocking server read + awaited write + awaited recurring-job top-up), so crews couldn't reach the Nav button for the next job.

**Files changed**:
- `core/firebase.web.ts` (the module Metro actually uses on web) and `core/firebase.ts` (native/fallback twin, web-guarded) — Firestore now initialised with `persistentLocalCache` + `persistentMultipleTabManager` on web. Data viewed while online is cached in IndexedDB and readable offline; writes are journaled locally and auto-synced when connectivity returns, surviving page reloads. SSR/static export and React Native keep the default cache (no IndexedDB there). Falls back to in-memory cache with a console warning if IndexedDB init fails (e.g. private browsing).
- `services/jobService.ts` — `updateJobStatus` gains an optional `options.previousStatus`: callers that already know the job's prior status skip the blocking `getDoc` server read. The recurring-jobs top-up after completion is now fire-and-forget (was awaited despite being documented as "never block").
- `app/runsheet/[week].tsx` — `handleComplete` no longer sets the full-screen `loading` state. It applies the optimistic `setJobs` update FIRST, then fires the Firestore write in the background; on genuine rejection (e.g. permission denied) it reverts and alerts. New `pendingSyncIds` state drives an amber "Syncing…" pill on job cards until the server acknowledges the write (instant online; persists while offline). The completion audit log is also fire-and-forget so the local out-of-order swap detection isn't blocked offline.

**Not covered (known limits, by design for this pass)**: the app shell itself still needs network to load (no service worker yet — that's the next stage if wanted); GoCardless payment creation and other Cloud Function calls remain online-only; data not viewed while online isn't in the cache.

**Tested in browser** (CDP offline emulation): marked a job complete while fully offline → tick + Undo + "Syncing…" pill appeared instantly, runsheet stayed interactive; restored network → pill cleared on server ack; Undo restored the job. Verified the `firestore/[DEFAULT]/roundmanagerapp/main` IndexedDB database is created. Discovered `core/firebase.web.ts` shadows `core/firebase.ts` on web builds — both updated consistently.

---

### Guvnor Leads: self-assignment + 'Guvnor' lead source attribution

**Why**: The developer had no way to take a Guvnor lead for his own round (the assign modal deliberately excluded his account, and a plain reassign would be a no-op since the lead already has his `businessId`). Downstream, leads handed over by Guvnor were being credited to 'Client Portal' instead of Guvnor.

**Files changed**:
- `app/guvnor-leads.tsx` — new pinned green "Assign to my own round" row at the top of the assign modal's user list. Since the lead already has `businessId === DEVELOPER_UID`, taking it for his own round clears the `businessName: 'Guvnor'` marker (set to `null`) instead of touching `businessId`; that drops it out of the guvnor-leads client-side filter and out of the developer's new-business exclusion filter, so it lands in his /new-business inbox. Also sets `status: 'pending'`, `assignedByGuvnor: true`, `assignedToName: 'Developer (own round)'`, `assignedAt`, `updatedAt`. Confirm + alert flows match the existing assign-to-user pattern (web `window.confirm`/`alert`, native `Alert.alert`). The existing assign-to-user flow is unchanged.
- `app/new-business.tsx` — 'Guvnor' added to `sourceOptions`; the Schedule Quote form and the Add Client navigation now default `source` to `'Guvnor'` when the request has `assignedByGuvnor`, otherwise still 'Client Portal'.
- `app/add-client.tsx` — 'Client Portal' and 'Guvnor' added to its `sourceOptions` so the `source` param prefill from new-business displays correctly in the picker ('Client Portal' was already being passed but was missing from this list). `app/quotes.tsx` has its own `sourceOptions` for manually-created quotes; left unchanged as it's not part of the portal/Guvnor handover flow.

**Verified in browser end-to-end**: submitted a test lead via /window-cleaning-quote (production portalApi) → appeared in /guvnor-leads → "Assign to my own round" → disappeared from guvnor-leads, appeared in /new-business with the "Lead from Guvnor" badge → Schedule Quote modal's Lead Source picker pre-selected 'Guvnor' (option present in the list) → modal cancelled without creating a quote → test lead deleted. No real users' data touched.

---

### Guvnor Leads: property details on the quote form + assign-to-user

**Why**: The generic consumer quote form didn't capture anything about the property (the microsite wizard does this with per-business photos), and the developer had no way to hand a captured lead to a registered Guvnor user.

**Files changed**:
- `app/window-cleaning-quote.tsx` — added a "What type of property is it?" picker (Flat / apartment, Bungalow, 2/3/4/5+ bed house) and a "Do you have a conservatory?" Yes/No choice. Both optional, tap-to-toggle, sent as `propertyType` + `hasConservatory`.
- `functions/index.js` — `submitQuoteRequest` now accepts and sanitises `propertyType` (string, 60 chars) and `hasConservatory` (boolean), persisting them on `quoteRequests` docs. Deployed `portalApi`.
- `app/guvnor-leads.tsx` — lead cards now show property type + conservatory. New "Assign to a Guvnor user" button opens a modal that loads all registered users via the existing developer-gated `listAllUsers` Cloud Function, with search by name/business/email. Assigning sets `businessId` to the chosen user (plus `assignedByGuvnor`, `assignedToName`, `assignedAt`, status reset to `pending`), which moves the lead out of Guvnor Leads and into that user's New Business inbox. Allowed by Firestore rules because the developer owns the doc pre-update.
- `app/new-business.tsx` — quote request cards now display property type/conservatory and show a "Lead from Guvnor" badge on assigned leads.

**Security note (verified)**: `/guvnor-leads` is developer-only on three layers: screen gate (`session.uid === DEVELOPER_UID`), developer-only dashboard tile, and Firestore rules (`quoteRequests` readable only when `auth.uid == businessId`). `listAllUsers` is server-side gated to the developer UID.

**Tested in browser**: submitted a quote with "3 bed house" + conservatory + 4-weekly; lead appeared in Guvnor Leads with property details; assign modal listed real users with working search (assignment itself not exercised to avoid placing a test lead in a real user's inbox); test leads deleted.

---

### Consumer-first public homepage at /welcome

**Why**: With the Guvnor Leads funnel live, visitors arriving at guvnor.app from search/ads are now mostly consumers wanting a window cleaner, but the root previously bounced straight to the provider sign-in screen with no path to the quote form.

**Files changed**:
- `app/welcome.tsx` (new, public) — consumer-first landing: "Need a window cleaner?" hero with a "Get my free quote" CTA → `/window-cleaning-quote`, trust pills, a 3-step "How it works", then a provider band ("Clean windows for a living?" → marketing `/home`) and a slim footer (About/Contact/Privacy/Terms). Discreet "Sign in" button in the nav for existing users. SEO title/meta via `expo-router/head`.
- `app/_layout.tsx` — unauthenticated **web** visitors hitting the root `/` now land on `/welcome` instead of `/login`. Deep links to app screens (expired sessions) still go to `/login`, native apps are unaffected (their audience is providers), and the post-sign-out debounce path still targets `/login`. `/welcome` added to `unauthAllowed`.
- `app/login.tsx` — small safety-net link under the hero ("Looking for a window cleaner? Get a free quote →") for consumers who land on the sign-in page from old links. Web only.
- `vercel.json` needed no change (SPA catch-all already serves `/welcome`).

**Verified in browser**: signed out → visited `/` → redirected to `/welcome` → CTA navigates to the quote form → Sign in button reaches `/login` → signed back in normally.

---

### Guvnor Leads: public consumer quote page + developer lead inbox

**Concept**: Guvnor itself now captures window cleaning enquiries from consumers anywhere in the UK (ads/SEO land them on a Guvnor-branded "get a quote" page). Leads drop into a developer-only bucket; the developer cold-calls geographically suitable window cleaners (Google Maps), onboards them as Guvnor users, and hands them the customer — solving user activation by onboarding new users *with* a live customer.

**Files changed**:
- `app/window-cleaning-quote.tsx` (new, public, no auth) — consumer-facing landing + quote form (name, phone, address, town, postcode, frequency preference chips, email, notes; GDPR consent line). Submits through the **existing deployed** `portalApi` `submitQuoteRequest` action with `businessId = DEVELOPER_UID` and `businessName = 'Guvnor'` — no Cloud Function or Firestore rules changes/deploys needed (public writes stay blocked; the function validates + rate-limits server-side). Includes `expo-router/head` title/meta for SEO.
- `shared/constants/developer.ts` — new `GUVNOR_LEADS_BUSINESS_NAME = 'Guvnor'` marker constant. A quoteRequest doc with `businessId === DEVELOPER_UID && businessName === 'Guvnor'` is a Guvnor lead; the developer's own microsite enquiries keep their TGM business name, so the two coexist in one collection.
- `app/_layout.tsx` — `/window-cleaning-quote` added to `unauthAllowed` so unauthenticated visitors aren't bounced to `/login` (route contains hyphens, so the business-slug regex never matches it). `vercel.json` needed no change — the SPA catch-all already serves it.
- `app/guvnor-leads.tsx` (new, developer-only) — real-time lead inbox gated by `session.uid === DEVELOPER_UID`. Each card: contact details (tappable phone → tel:), address, frequency preference, notes, a **"Find window cleaners near {postcode}"** Google Maps button (the cold-call workflow), status chips (New → Calling around → Onboarded → Dead, stored as the existing pending/contacted/converted/declined values), and delete.
- `app/new-business.tsx` — Guvnor leads are filtered out of the developer's own New Business list (they're managed on /guvnor-leads instead).
- `app/(tabs)/index.tsx` — "Guvnor Leads" dashboard tile (megaphone icon) shown only to the developer account, in both `baseButtons` and the focus-effect `buttonDefs`. The quoteRequests badge listener now splits counts: Guvnor leads badge on the new tile, everything else stays on New Business.

**Verified in browser end-to-end**: signed out → visited `/window-cleaning-quote` (no login redirect, incl. past the 5s debounce) → submitted a test lead against the production portal API → signed back in → dashboard showed Guvnor Leads tile with badge 1 and New Business badge unchanged → lead visible on /guvnor-leads with Maps link, status change to "Calling around" updated live → confirmed the lead does NOT appear on /new-business. Test lead left in place (marked safe to delete) as a first example.

**Notes / future**: at >50 users this manual concierge flow can evolve (cleaners claim leads, pay-per-lead, auto-matching). If lead volume brings spam, add a captcha or tighten the portalApi rate limit. Marketing site (`web/`) could link to the page from `/home` for SEO juice.

---

### Fix: Add Payment now carries client context from the client detail screen

**Files changed**:
- `app/(tabs)/clients/[id].tsx` — `handleMakePayment` passed `clientAddress` / `clientAccountNumber` params, but `app/add-payment.tsx` reads `address` / `accountNumber`. Param names corrected so the reference ("Account: …") and notes ("Address: …") pre-fill works.
- `app/add-payment.tsx` — when arriving with a `clientId` (from a client detail screen), the client search box is now pre-filled with the selected client's display name. Previously the client *was* selected internally but the search box stayed empty, so it looked like no client was chosen and users re-picked it. The user can still type to change client.

**Verified in browser**: from J15 Chapel Hill Caravan Site → Add Payment shows "na - J15, Chapel Hill Caravan Site" in the client box, Reference "Account: RWC674", Notes "Address: J15"; saved a £1 test payment which redirected back to the client (the `from` param) and appeared on the account.

---

### Fix: Manage Services no longer saves + reloads the whole screen on every keystroke

**Root cause**: in `app/(tabs)/clients/[id]/manage-services.tsx`, the Frequency and Price inputs called `updatePlan()` on **every character typed** (`onChangeText`), and `updatePlan()` ended with `await loadPlans()` → `setLoading(true)` → the entire screen swapped to "Loading..." and back per keystroke (plus a Firestore `writeBatch` + jobs query per character).

**Files changed**:
- `app/(tabs)/clients/[id]/manage-services.tsx`:
  - Frequency and Price are now draft-buffered (same pattern the Service name field already used) and **commit on blur**, only when the value is valid and actually changed. One Firestore write per edit instead of one per character.
  - Removed the full `loadPlans()` reload at the end of `updatePlan()` — the optimistic `setPlans` update already keeps the UI in sync, so the screen no longer flashes to "Loading..." after a save. The flows that genuinely need a reload (Active toggle, Regenerate Schedule) call `loadPlans()` themselves and are unaffected.
  - The per-plan "Next Service" date inputs (web) ignore empty values fired mid-edit instead of writing `''` to the plan.
- **Web date-input crash guard** (same modal family the user reported): typing/clearing inside an HTML `<input type="date">` can fire `onChange` with an empty/incomplete value; `new Date('' + 'T00:00:00')` is an Invalid Date and the subsequent `format()` call throws, blowing up the screen. All such handlers now ignore empty/invalid values:
  - `app/(tabs)/clients/[id].tsx` — one-off job date, recurring first-visit date, edit-additional-service next-visit date.
  - `app/(tabs)/clients/[id]/manage-services.tsx` — same three modal date inputs.
  - `app/runsheet/[week].tsx` — defer-job date and bulk-move date.

**Verified in browser** (J15 Chapel Hill Caravan Site → Manage Services): typed multiple characters into Price with no loading flash and no per-keystroke saves; blur committed the change ("✓ Price saved", value persisted after a hard reload, then restored); clearing the Next Service date is ignored without crashing.

---

## June 9, 2026

### Round Order Manager: full-list drag-and-drop reordering (new dashboard tile)

**Files changed**:
- `app/round-order-manager.tsx` (new screen, replaces the old route's purpose) — full-list round order editor gated by `PermissionGate perm="viewClients"`. Loads all non-ex clients sorted by `roundOrderNumber`, edits happen in local state, nothing is written until **Save**.
  - **Web (desktop + mobile browser)**: custom pointer-event drag on the `⠿` handle (container-level `pointerdown` listener + `data-dragindex` attributes). Floating overlay row follows the pointer (imperative DOM transform — no per-pixel React re-renders), blue drop-indicator line, and auto-scroll when dragging near the top/bottom edges. The handle uses `touchAction: 'none'` so touch drags don't fight page scrolling; the rest of the row scrolls normally.
  - **Native (iOS/Android)**: `react-native-draggable-flatlist` (already a dependency, previously unused) with long-press to lift.
  - **Long-distance moves**: search box (address / name / account number) plus tap-a-row quick actions: "Move to position N", Top, Bottom — essential with ~550 clients where dragging across hundreds of rows is impractical.
  - **Save**: resequences the final list to a clean `1..N` and writes **only clients whose stored number differs**, in `writeBatch` chunks of 400 (Firestore's 500-op limit is a real risk at 500+ clients). Confirm dialog before saving, success alert after. Save also heals pre-existing gaps/duplicates in stored numbering (a banner explains this when no rows were moved but writes are still needed).
  - **Safety**: "N moved (unsaved)" header counter, orange dot on rows the user repositioned, Reset (revert to last saved order), and discard confirmation when leaving with unsaved moves.
  - **Web layout note**: the screen pins itself to the window height (`height`/`maxHeight` + `minHeight: 0` on the list container) so the FlatList scrolls internally — required for drag auto-scroll; otherwise the page itself scrolls and `scrollToOffset` is a no-op.
- `app/round-order-position.tsx` — the **old** `round-order-manager.tsx` renamed (git mv, logic unchanged; title now "Set Round Order Position"). Still serves the single-client position flows.
- `app/add-client.tsx`, `app/(tabs)/clients/[id]/edit-customer.tsx`, `app/ex-clients.tsx` — navigation updated `/round-order-manager` → `/round-order-position` (add / edit / restore flows keep their existing picker behaviour).
- `app/(tabs)/index.tsx` — new "Round Order Manager" dashboard tile (`swap-vertical-outline` icon, `viewClients` permission). Note: the dashboard builds its tile list in **two** places (`baseButtons` in `buildButtonsForUser` and `buttonDefs` in the focus effect); both were updated.

**Why**: Round order drifts over time and the only maintenance tools were the one-client-at-a-time position picker and adjacent swaps on the runsheet. This gives a dedicated bulk housekeeping screen reachable from the dashboard.

**Verified in browser (dev server against live data)**: drag + drop on desktop width, touch-pointer drag at 390px mobile width, auto-scroll during drag, search + move-to-position, Reset, and a full normalization Save (548 clients renumbered 1-550; relative order preserved — runsheet order unaffected, confirmed after reload).

---

### Fix: `npm run web` crashed with "window is not defined"

- `app/(tabs)/settings.tsx` line 56 — module-scope diagnostic block called `typeof window.addEventListener` directly; during expo-router static rendering (Node) `window` doesn't exist, so the whole web dev server / `expo export` died on any route importing settings. Added a `typeof window !== 'undefined'` guard. No behavioural change in browsers.

---

### Rota availability indicators in Workload Forecast and Runsheet

**Files changed**:
- `utils/availability.ts` (new) — `summarizeDayAvailability(rotaForDay, members)` counts available active members for a day (a member is available when their rota status is `'on'` or missing; `'off'`/`'n/a'` are unavailable — same rule as runsheet capacity allocation). `availabilityColor(ratio)` returns a continuous green→amber→red HSL colour.
- `app/workload-forecast.tsx` — each week row now shows a coloured availability pill (e.g. `86%`): available member-days ÷ (active members × 7 days), using one `fetchRotaRange` call across the 52-week window (includes default `rotaRules` patterns). Roster = active members from `listMembers()` plus the account owner if absent. Rota/member load failures degrade gracefully (no pill, forecast unaffected).
- `app/runsheet/[week].tsx` — day section headers now show a traffic-light dot + `X/Y available` derived from the already-loaded `rotaMap` and a new `availabilityRoster` (active members + owner). Display only — `allocateJobsForDay`, completion and locking logic untouched.

**Why**: Users previously had to open the Rota screen to see who is on/off. Availability is now visible at-a-glance per week in the forecast (100% green → 0% red) and per day on the runsheet.

**Notes**:
- No Firestore schema or rules changes; read-only reuse of existing `rota` + `rotaRules` data.
- Pure React Native views — renders identically on web and mobile.
- Pre-existing TS lint errors in `app/runsheet/[week].tsx` (lines ~405, ~817) were not introduced by this change and remain.

---

### Housekeeping: centralized DEVELOPER_UID, archived legacy docs, removed stray file

**Changes**:
- `shared/constants/developer.ts` (new) — single source of truth for the developer account UID (`X4TtaVGKUtQSCtPLF8wsHsVZ0oW2`).
- `services/subscriptionService.ts`, `app/register.tsx` — removed local hardcoded `DEVELOPER_UID` copies; both now import from the shared constant. No behavioural change.
- `functions/index.js` — keeps its own copy (Cloud Functions deploys only the `functions/` folder and cannot import outside it); added a comment requiring it stays in sync with `shared/constants/developer.ts`.
- Archived legacy docs into `docs/archive/`: `code-changes.md`, `code-changes_Vol1_DO_NOT_WRITE_TO_THIS_ONE.md`, `cod-changes_Vol2.txt`, `project-handover-2025-01-15.md`. `docs/codechanges.md` is the only live changelog.
- `README.md` — changelog/handover links updated to `docs/codechanges.md` and the archived handover path.
- `.cursor/rules/documentation.mdc` — changelog rule repointed from `docs/code-changes.md` to `docs/codechanges.md` so the archived file does not get recreated.
- Deleted stray `tatus` file from repo root (accidental output of a mistyped git command).

**Impact**: If the developer account ever changes, update `shared/constants/developer.ts` and the `DEVELOPER_UID` constant in `functions/index.js` (two places instead of three+, with the sync requirement documented in both).

---

## May 13, 2026

### Client microsite (`businessPortals`): create on first-time setup + backfill on Settings

**Problem**: `businessPortals/{normalizedBusinessName}` was only created when `businessName` changed through `updateUserProfile` (e.g. Settings bank/business save). The first-time setup flow wrote `businessName` with a direct `updateDoc` on `users/{uid}`, so many owners had a profile business name but no portal document—public URLs showed “Business not found”.

**Changes**:
- `services/userService.ts` — Added exported `syncBusinessPortalFromUserDocument()` to upsert the portal from the current user document (and remove the old portal doc when `previousBusinessName` is supplied). `updateBusinessPortal` now preserves `createdAt` when the same `ownerId` updates an existing portal.
- `components/FirstTimeSetupModal.tsx` — After saving setup, calls `syncBusinessPortalFromUserDocument` so new owners get a microsite immediately.
- `app/(tabs)/settings.tsx` — On screen focus, account owners (`uid === accountId`) call `syncBusinessPortalFromUserDocument` once per visit to backfill missing portals without requiring a manual re-save.

**Impact**: New owners completing first-time setup get `businessPortals` rows; existing owners missing rows get them the next time they open Settings. Slug still derives from stored `businessName` (spaces removed, lowercased)—URLs must match that normalization.

---

## April 16, 2026

### Premium subscription: £18/mo → £2.99/mo (display + config)

**Files changed**:
- `shared/constants/pricing.ts` — `UNLIMITED_PLAN.price` set to **2.99**; exported `PREMIUM_PRICE_*` labels and `PREMIUM_PRICE_PENCE` for a single source of truth.
- `config.ts` — `premiumPriceId` reads `EXPO_PUBLIC_STRIPE_PREMIUM_PRICE_ID` first, else default **`price_1TQsyaF7C2Zg8asUXyVbFh3r`** (£2.99/mo).
- `services/stripeService.ts` — `getPricingConfig()` amount derived from shared pence constant.
- `components/UpgradeModal.tsx` — checkout `priceId` from `config.stripe.premiumPriceId`; UI uses shared labels.
- `app/add-client.tsx`, `app/(tabs)/settings.tsx`, `app/runsheet/[week].tsx` — limit/upgrade copy uses `PREMIUM_PRICE_ONLY_LABEL` / `PREMIUM_PRICE_PER_MONTH_LABEL`.
- `web/src/app/layout.tsx`, `web/src/app/home/page.tsx`, `web/src/app/pricing/page.tsx` — marketing metadata and pages use shared constants.
- `config.example.ts` — notes for Premium price id and env override.

**Operations**:
- Default Stripe Premium Price id in `config.ts` is **`price_1TQsyaF7C2Zg8asUXyVbFh3r`** (£2.99/mo GBP). Override with `EXPO_PUBLIC_STRIPE_PREMIUM_PRICE_ID` for a different environment or test price.

**Impact**:
- Web and app upgrade messaging stay aligned with `shared/constants/pricing.ts`.
- No change to free-tier limits or subscription logic beyond copy and checkout price id resolution.

---

## April 15, 2026

### Rota: Full UI Redesign + Default Schedule Rules + Tightened Security

**Files Changed**:
- `app/rota.tsx` (rewritten)
- `services/rotaService.ts` (enhanced `fetchRotaRange` with default pattern merge)
- `services/rotaRulesService.ts` (new)
- `firestore.rules`

**Issues**:
- Rota screen was visually inconsistent with the rest of the app — no theme integration, hardcoded colors, no dark mode support.
- No way to set a default schedule (e.g. "Mon–Fri on, Sat–Sun off") that applies automatically to all future weeks.
- Non-editable cells for members were not visually distinct enough.
- Firestore rules allowed any team member to write any other member's rota field.

**Solution**:

**UI Redesign (`app/rota.tsx`)**:
- Wrapped in `ThemedView`/`ThemedText` with full `Colors[colorScheme]` integration for light/dark mode.
- Added structured header with home button, title, and icon links to History and Activity Log.
- Redesigned week navigator as a themed card with "This Week" badge.
- Replaced flat colored cells with rounded status pills (ON/OFF/—) using iOS system colors.
- Added today row highlight, per-day availability counts, weekend text dimming.
- Non-editable cells show lock icon and reduced opacity for clear permission visibility.
- Added legend bar explaining status colors and lock icon.
- Grid wrapped in a themed card with proper header row, borders, and spacing.

**Default Schedule System**:
- New `rotaRules` Firestore subcollection at `accounts/{accountId}/rotaRules/{memberId}`.
- `WeeklyPattern` type: Mon–Sun map of availability status.
- `fetchRotaRange` enhanced to merge default patterns: for any member/day without an explicit rota document entry, the member's default schedule fills the gap. Explicit manual overrides always take precedence.
- This merge happens at the service layer so capacity service, runsheet, and rota UI all see consistent data.
- "Default Schedule" modal: owners can set defaults for any member (with picker), members can set their own. Tap to toggle days through on/off/n/a. Saving the default applies it automatically to all weeks — no need to specify a number of weeks.

**Firestore Security (`firestore.rules`)**:
- Rota writes now enforce per-field ownership: owners (uid == accountId) can write any field; members can only create/update their own UID field via `affectedKeys().hasOnly([request.auth.uid])`.
- Only owners can delete rota documents.
- Added `rotaRules` collection rules: owners can manage all rules; members can only manage their own (doc ID == their UID).

**Contracts Preserved**:
- `fetchRotaRange` return type `Record<string, Record<string, AvailabilityStatus>>` unchanged.
- `setAvailability(date, memberId, status)` signature unchanged.
- `AvailabilityStatus = 'on' | 'off' | 'n/a'` unchanged.
- Default-to-`'on'` fallback in capacityService and runsheet unaffected (but now fewer gaps thanks to pattern merge).
- Firestore document structure `accounts/{accountId}/rota/{yyyy-MM-dd}` with flat `{uid: status}` fields unchanged.
- `cleanupOldRota` behavior preserved.

**Impact**:
- Rota screen now matches the app's visual language (themed, card-based, dark mode ready).
- Owners can set default schedules for all team members; defaults apply to every week automatically.
- Members can set their own default schedule but cannot modify other members' rota.
- Capacity service and runsheet get correct availability for members with defaults, even on days with no explicit rota documents.
- Security enforced at both UI and Firestore rules level.
- No regression to capacity service, runsheet, or job redistribution logic.

---

## April 7, 2026

### Completed Jobs: Prevent infinite spinner on Firestore permission/auth race failures

**File Changed**:
- `app/completed-jobs.tsx`

**Issue**:
Opening `/completed-jobs` could show an infinite spinner on web, with console errors like `FirebaseError: Missing or insufficient permissions`.

**Root Causes**:
- The screen started Firestore reads before Auth hydration could complete on web.
- The jobs listener had no error callback, so permission failures never cleared loading state.
- Client hydration used batched `where('__name__', 'in', ids)` lookups, where one unreadable client doc could fail the entire batch.

**Solution**:
- Wait for `waitForAuthReady(5000)` before attaching Firestore listeners.
- Guard missing auth/account owner states and explicitly clear loading in those cases.
- Add `onSnapshot` error handling and setup-level catch handling so failures are non-blocking in UI.
- Replace batched client list query with per-doc `getDoc` + `Promise.allSettled` so one unreadable/missing client does not break the whole completed-jobs list.

**Impact**:
- ✅ `/completed-jobs` no longer hangs indefinitely on permission/auth timing failures.
- ✅ Job list remains visible even if a subset of client docs cannot be read.

---

## April 6, 2026

### Client Portal: Prospect selects property type and service from Quote Wizard images

**Files Changed**:
- `functions/index.js`
- `app/[businessName].tsx`
- `app/new-business.tsx`

**Change**:
- Added `getQuoteOptions` portal API endpoint that returns the business owner's Quote Wizard images and pricing lines (public, rate-limited).
- Updated `submitQuoteRequest` endpoint to accept optional `selectedImageUrl`, `selectedFrequency`, and `selectedCost` fields.
- After a prospect fills in the quote form on the client portal, instead of immediately showing "Request Sent!", the portal now enters a multi-step flow:
  1. **Pick property type** -- shows the business owner's Quote Wizard images as clickable cards with labels.
  2. **Pick service** -- shows pricing lines for the selected image (e.g. "4 Weekly - £30.00", "One-off - £50.00").
  3. **Review** -- summary of selection with provisional quote disclaimer and "Confirm & Submit" button.
  4. **Done** -- confirmation message.
- If the business owner has no Quote Wizard entries, the form submits immediately as before (backwards compatible).
- On the `/new-business` page, quote request cards now show a "Prospect selected: X Weekly at £Y" badge (with optional thumbnail) when the prospect chose a service.

**User Impact**: Prospects get an instant provisional quote based on property type, and business owners see exactly which service the prospect agreed to.

---

### Quote Wizard: In-app image-based quoting tool (per customer, behind login)

**Files Changed**:
- `app/quote-wizard.tsx` (new)
- `app/(tabs)/settings.tsx`
- `core/firebase.ts`
- `core/firebase.web.ts`
- `firestore.rules`
- `vercel.json` (reverted marketing rewrite)
- `web/src/app/quote-wizard/page.tsx` (removed)

**Change**:
- Removed the previous marketing-site Quote Wizard page and Vercel rewrite.
- Added a **"Quote Wizard"** button to the **Profile** section in Settings. It navigates to `/quote-wizard` via `router.push` (in-app, behind auth).
- Created `app/quote-wizard.tsx` — a full Expo Router screen with two views:
  - **List view**: shows all saved quote wizards for the user, with thumbnail strips, customer name, item counts, and totals.
  - **Create/Edit view**: form with customer name/address, image upload (gallery on all platforms, camera on mobile), and per-image pricing:
    - **Recurring**: £ cost per visit + frequency (1–12 weeks chip selector on mobile, dropdown on web).
    - **One-Off**: toggle + £ cost, independent of or alongside recurring.
  - Live **Quote Summary** with per-item breakdown and grand totals.
  - **Save** persists to Firestore `quoteWizards` collection; **Delete** removes the Firestore document and all associated Firebase Storage images.
- Initialised **Firebase Storage** in `core/firebase.ts` and `core/firebase.web.ts` (previously unused despite `storageBucket` being in the config).
- Added `expo-image-picker` dependency for cross-platform image selection.
- Added Firestore rules for the `quoteWizards` collection (same `hasResourceAccess`/`hasCreateAccess` pattern as other collections).

**Data Model** — `quoteWizards/{autoId}`:
- `ownerId`, `accountId` — scoped to user account
- `customerName`, `customerAddress` — prospect details
- `items[]` — each with `id`, `storagePath`, `imageUrl`, `recurringCost`, `frequencyWeeks`, `isOneOff`, `oneOffCost`
- `createdAt`, `updatedAt`

Images stored at `quoteWizards/{accountId}/{quoteId}/{itemId}.{ext}` in Firebase Storage.

**Note**: Firebase Storage security rules are managed via the Firebase Console for this project (no local `storage.rules` file). Ensure authenticated read/write is enabled for the `quoteWizards/` path.

**User Impact**: Users can build visual, image-based quotes for customers with recurring and/or one-off pricing, saved per account.

---

## April 1, 2026

### Web (Marketing): Minor copy consistency on Guides pages

**Files Changed**:
- `web/src/app/guides/page.tsx`
- `web/src/app/guides/findingcustomers/page.tsx`

**Change**:
- Adjusted title casing from "How To" → "How to" for consistent wording across the Guides index and guide page.

## February 14, 2026

### Service Plans: Auto-regenerate recurring jobs on completion (rolling 24 months)

**Files Changed**:
- `services/jobService.ts`
- `app/(tabs)/clients/[id]/manage-services.tsx`

**Problem**:
Some clients had active recurring service plans visible in **Manage Services**, but would eventually end up with **no pending jobs** because nothing automatically extended the schedule after jobs were completed.

**Solution**:
- Added a **best-effort schedule “top-up”** that runs **after a job transitions to `completed`**:
  - Only applies when the completed job matches an **active recurring** service plan (`isActive: true`, `scheduleType: 'recurring'`).
  - Uses the **next already-scheduled upcoming job** for that service as the anchor (if present); otherwise derives the next occurrence from the completed job date + `frequencyWeeks`.
  - Generates missing jobs for a **rolling 24-month window**, de-duping by **date** using both `scheduledTime` and `originalScheduledTime` (moved jobs still reserve their original date).
  - Respects `lastServiceDate` as an inclusive hard stop.
  - Does **not** generate for ad-hoc/one-off jobs that have **no matching recurring service plan**.
- Updated `createJobsForServicePlan()` to **roll stale `startDate` forward** (keeps “Next Service” in the future for better UX consistency).
- Updated Manage Services plan activation/regeneration to generate **~2 years** (`104` weeks) instead of `52` weeks.

**Impact**:
- ✅ Recurring service schedules maintain a forward-looking horizon automatically as work is completed
- ✅ Inactive plans remain inactive (no jobs generated)
- ✅ Ad-hoc/one-off jobs do not trigger automatic regeneration

### Service Plans: Admin backfill for clients with no upcoming jobs

**Files Changed**:
- `services/jobService.ts`
- `app/(tabs)/settings.tsx`

**Problem**:
Some migrated clients already had **active recurring service plans** but **no upcoming jobs** (so their schedule looked empty until a future completion event occurred).

**Solution**:
- Added an owner-only **Settings → Admin Tools** button: **“Backfill Missing Schedules (Generate 24 months)”**
- The tool scans **active (non-archived) clients** and active recurring service plans, and only backfills clients with **zero upcoming jobs**.
- It anchors off the **last completed job** for each recurring service (fallback: last past job) and generates missing jobs out to ~24 months.

**Impact**:
- ✅ One-time repair for accounts with missing schedules
- ✅ Does not generate for inactive plans or ad-hoc/one-off jobs

---

## January 18, 2026

### Web: Fix payment date picker not updating after other form changes

**File Changed**:
- `app/add-payment.tsx`

**Issue**:
On web, the **Payment Date** picker could become unreliable after interacting with other fields (method/reference/notes), making it feel like the date “won’t change”.

**Solution**:
- Switched web to a native `<input type="date">` to avoid React Native DateTimePicker web quirks.
- Added safe parsing for the stored `yyyy-MM-dd` string so the native date picker receives a stable Date object.

**Impact**:
- ✅ Payment date can be changed reliably on web, without affecting iOS/Android behavior.

---

### Ex-Clients: Restore no longer fails due to web auth hydration / missing ownership fields

**File Changed**:
- `app/ex-clients.tsx`

**Issue**:
Restoring an ex-client could fail on web due to Auth hydration timing (locked-down Firestore) and/or inconsistent ownership fields needed for security rules and scoped queries.

**Solution**:
- Wait for Auth hydration before starting the Firestore listener and before performing the restore write.
- Use `window.confirm`/`window.alert` on web (Alert dialogs can be unreliable in RN web), keeping native `Alert.alert` on mobile.
- On restore, normalize `ownerId`/`accountId`, clear `roundOrderNumber`, and set `updatedAt`.
- Improve user-facing messaging for permission-related failures.

**Impact**:
- ✅ Ex-client restore is reliable on web and remains unchanged on mobile.

---

### Clients: GoCardless Settings toggle works on web (confirm dialogs)

**File Changed**:
- `components/GoCardlessSettingsModal.tsx`

**Issue**:
On web, disabling GoCardless required a confirmation prompt implemented with `Alert.alert`, which can fail to render in React Native Web. This made the toggle appear to do nothing.

**Solution**:
- Use `window.confirm`/`window.alert` on web for the disable confirmation and error prompts, keeping native `Alert.alert` on mobile.

**Impact**:
- ✅ Users can toggle GoCardless off on web reliably.

---

## January 12, 2026

### Firestore/Auth: Prevent transient “Missing or insufficient permissions” on web by waiting for Auth hydration

**Files Changed**:
- `core/session.ts`
- `app/(tabs)/clients/[id].tsx`
- `app/(tabs)/clients/[id]/manage-services.tsx`

**Issue**:
After Firestore was locked down (no public reads), some screens were making Firestore reads (e.g. `getDoc(clients/<id>)`) immediately on mount / focus. On web, Firebase Auth can take a moment to hydrate persistence, so these reads could fire **unauthenticated** and throw **`FirebaseError: Missing or insufficient permissions`** even though the user is signed in moments later.

**Solution**:
- Added `waitForAuthReady()` helper to `core/session.ts` (waits briefly for `onAuthStateChanged` to fire).
- Updated client detail screens to call `waitForAuthReady()` before reading protected collections.
- Added defensive try/catch around initial client document reads so we don’t crash/unhandled-promise on transient auth timing.

**Impact**:
- ✅ Existing clients should load reliably on web (no auth-race permission errors)
- ✅ Future clients continue to work (with `accountId` being set on create from the previous fix)

---

## January 13, 2026

### New Business → Quotes: Schedule-quote flow now creates quotes as `scheduled` (not `pending`)

**File Changed**:
- `app/new-business.tsx`

**Change**:
- When processing a New Business quote request via **Schedule Quote**, the created quote now uses `status: 'scheduled'` (matching the `/quotes` pipeline).
- Also writes `date` alongside the existing `scheduledTime` field for compatibility with `/quotes` list rendering and grouping.
- Also creates the corresponding `jobs` “quote job” on the runsheet for the selected date (same shape as quote jobs created from `/quotes`).
- Quote + job creation is now done in a single Firestore batch to prevent partial writes (no more “quote created but job missing” state).

**User Impact**:
- ✅ Portal-originated quotes appear under **Scheduled** in `/quotes` (instead of being pre-advanced to Pending).
- ✅ The scheduled quote visit now appears on the **Runsheet** for the chosen day.

---

### Firestore/Data Repair: Owner-only backfill for legacy ownerId/accountId mismatches (fix existing clients/jobs created by team members)

**Files Changed**:
- `functions/index.js`
- `services/accountService.ts`
- `app/(tabs)/settings.tsx`

**Issue**:
Some legacy documents may have `ownerId` set to a **team member UID** (instead of the account owner UID / accountId). Under locked-down Firestore rules, that can **lock owners and other members out** of those documents permanently (reads + writes).

**Solution**:
- Added callable Cloud Function `backfillAccountIds` (owner-only) that:
  - Loads active member UIDs under `accounts/{accountId}/members`
  - For each member UID, rewrites `ownerId` and `accountId` on `clients/jobs/payments/servicePlans/quotes` where `ownerId == memberUid` to the canonical `accountId`
- Added an **Admin Tools** button in Settings: “Repair Firestore Permissions (Fix existing clients/jobs)” to run the repair in safe chunks.
- Updated the repair flow to **refresh claims first** (ensures app + callable functions agree on `accountId/isOwner`) and to **ensure the owner membership doc exists** under `accounts/{accountId}/members/{uid}` before backfilling (rules rely on `exists()` checks).

**Impact**:
- ✅ Existing clients/jobs created under member UIDs become readable/writable again
- ✅ Prevents ongoing “Missing or insufficient permissions” caused by legacy ownership mismatches

---

### Jobs: Fix “Add a New Job” failing due to completedWeeks permission read on “today” checks

**Files Changed**:
- `services/jobService.ts`
- `firestore.rules`
- `app/(tabs)/clients/[id].tsx`

**Issue**:
When adding an adhoc job for **today**, the UI checks whether “today is marked complete” via `completedWeeks/<ownerId>_<weekStart>`. Under locked-down rules, a non-existent `completedWeeks` doc can surface as **`FirebaseError: Missing or insufficient permissions`**, which was aborting job creation before the `jobs` write even ran.

**Solution**:
- Made `isTodayMarkedComplete()` **never throw**; on read errors it logs a warning and returns `false` (do not block job creation).
- Reordered `completedWeeks` `allow get` rule to evaluate the docId pattern match **before** touching `resource.data`, preventing permission errors on non-existent docs.
- Wrapped the client screen’s “today complete” check in a defensive try/catch to avoid unhandled promise rejection.

**Impact**:
- ✅ Owners can create adhoc jobs for today from the client detail modal
- ✅ Removes noisy “Missing or insufficient permissions” errors caused by optional completedWeeks docs

---

## January 10, 2026

### CRITICAL FIX: Job and Client Creation Permission Errors After CORS Security Changes

**Files Changed**:
- `app/(tabs)/clients/[id].tsx`
- `services/jobService.ts` (multiple functions)
- `app/(tabs)/clients/[id]/manage-services.tsx` (3 locations)
- `app/quotes.tsx`
- `app/(tabs)/settings.tsx` (2 locations for jobs, 3 locations for clients)
- `app/import-completed-jobs.tsx`
- `app/runsheet/[week].tsx`
- `app/add-client.tsx`
- `app/import-clients.tsx`

**Issue**: 
After tightening Firestore security rules to prevent malicious users from accessing data via DevTools, users were unable to create new adhoc jobs via the "Add a new job" modal from the clients info screen. The error was "Missing or insufficient permissions" (FirebaseError). Additionally, reading client documents was also failing for team members.

**Root Cause**:
The Firestore security rules' `hasCreateAccess()` and `hasResourceAccess()` functions check for `accountId` first (preferred field), then fall back to `ownerId`. However:
1. All job creation code was only setting `ownerId`, not `accountId`
2. All client creation code was only setting `ownerId`, not `accountId`
3. When team members tried to read existing clients (which only had `ownerId`), the permission check could fail

For team members, the `hasAccountAccess()` function uses `exists()` to check member documents, which works better when `accountId` is explicitly set.

**Solution**:
Added `accountId: ownerId` to:
1. All job creation locations throughout the codebase (12 locations)
2. All client creation locations throughout the codebase (5 locations)

Since `getDataOwnerId()` returns the accountId (which is the owner's UID for owners, or the team's accountId for members), we set both fields for compatibility with Firestore rules.

**Impact**:
- ✅ Fixed job creation permission errors for all users (owners and team members)
- ✅ Fixed client creation to include `accountId` for proper rule evaluation
- ✅ All job creation methods now work: adhoc jobs, recurring jobs, quote jobs, imported jobs, note jobs
- ✅ All client creation methods now work: manual creation, import, quote conversion
- ✅ Maintains backward compatibility with existing `ownerId` field
- ✅ Aligns with Firestore rules' preference for `accountId` field
- ⚠️ **Note**: Existing clients in the database that only have `ownerId` (not `accountId`) may still cause read permission issues for team members. A migration script may be needed to add `accountId` to existing clients.

---

## January 10, 2026

### Core: Fixed syntax error in session.ts preventing builds

**File Changed**: `core/session.ts`

**Issue**: Vercel build was failing with "SyntaxError: Unexpected token (66:4)" due to malformed if-else chain with two consecutive `else` statements.

**Fix**: Corrected the conditional logic by removing the duplicate `else` clause and moving the comment inside the final else block.

---

## January 9, 2026

### Team: Make “+” button clearly add vans + add “Enter code” link-to-owner action

**Files Changed**:
- `app/(tabs)/team.tsx`
- `app/enter-invite-code.tsx`

**Change**:
- Updated the floating “+” action on `/team` to be an explicit **“Add van”** button (plus icon + label) and autofocus the van name field when opened.
- Added a `/team` card/button to **link this account to another owner using a code** (routes to the existing `/enter-invite-code` flow, with a confirmation prompt).
- The “Enter code” option is **hidden/blocked** if the current account already has team members (prevents joining another team while you have members linked to you).
- Updated the invite-code screen header comment to reflect the current Firebase implementation (no Supabase).

---

### Jobs/Runsheets: Prevent duplicate recurring jobs after client import

**File Changed**: `services/jobService.ts`

**Change**:
- Made `generateRecurringJobs()` **idempotent** by de-duping at the **date level** per `(clientId + serviceId)`, using both `scheduledTime` and `originalScheduledTime` (so rerunning imports/settings generation won’t duplicate runsheet jobs).
- This does **not** block users from manually creating multiple jobs on the same day; it only prevents the auto-generation routine from re-creating the same recurring occurrence.

---

## January 8, 2026

### Home: Added “?” Guides Button Next to Settings Icon

**File Changed**: `app/(tabs)/index.tsx`

**Change**:
- Added a new **“?” help/guides button** next to the existing settings gear icon on the logged-in home screen.
- Tapping it opens `https://guvnor.app/guides` (via React Native `Linking`) so it works on mobile, desktop, and web targets.

**User Impact**: Users can quickly access the Guides from the home screen without digging through settings.

---

### Web (Marketing): Use Guvnor logo for browser tab icon

**Files Changed**:
- `web/src/app/icon.png`
- `web/src/app/favicon.ico` (removed)
- `web/src/app/layout.tsx`

**Change**:
- Added a Next.js App Router `icon.png` and removed the stale `favicon.ico` so the marketing site uses the Guvnor icon in the browser tab.
- Added `metadata.icons` with a versioned icon URL to **cache-bust** stubborn browser favicon caching after deploys.

---

### Web (App): Use Guvnor logo for favicon (`/favicon.ico`)

**Files Changed**:
- `assets/images/favicon.png`
- `vercel.json`

**Change**:
- Replaced the Expo web favicon source image with the Guvnor mark so the exported app uses the Guvnor icon in browser tabs.
- Set a no-cache policy for `/favicon.ico` to reduce stubborn Chrome favicon caching after deploys.

### Marketing: Rename guides hub label for collaboration guide

**Files Changed**:
- `web/src/app/guides/page.tsx`
- `web/src/app/guides/memberaccounts/page.tsx`

**Change**:
- Renamed the `/guides` button and the `/guides/memberaccounts` page title from “How to Manage Subcontractors And Staff” to **“Collaborating with others on Guvnor”** (URL unchanged).

### Marketing: Copy edits for guides (spelling/grammar)

**Files Changed**:
- `web/src/app/guides/migrationguide/page.tsx`
- `web/src/app/guides/findingcustomers/page.tsx`

**Change**:
- Applied agreed spelling/grammar improvements (e.g. Setup, Guvnor capitalization, home screen, e.g. usage, and minor sentence fixes).

### Marketing: Start `/guides/accountsguide` content

**File Changed**: `web/src/app/guides/accountsguide/page.tsx`

**Change**:
- Added introductory copy and section headers for bulk vs individual payments.
- Added “Adding Bulk Payments” section copy and screenshot.
- Added “Individual payments” section copy and screenshot (`addingIndividualPayments.jpg`).
- Reduced the size of the “Add Payment” screenshot under “Individual payments”.

### Marketing: Add GoCardless setup guide + screenshots

**File Changed**: `web/src/app/guides/gocardlesssetup/page.tsx`

**Change**:
- Added `/guides/gocardlesssetup` guide content and screenshots for linking GoCardless + setting up customer IDs.
- Copied the GoCardless screenshots into `web/public` so the marketing build serves them.
- Reduced the size of the GoCardless setup screenshots for desktop layouts.

### Marketing: Add member accounts guide content + screenshots

**File Changed**: `web/src/app/guides/memberaccounts/page.tsx`

**Change**:
- Added the “Collaborating with others on Guvnor” guide content (inviting team members + joining with code).
- Added supporting screenshots and ensured they are served via `web/public` (Team Members / invite email / join code / join owner / team member added).
- Reduced the size of the memberaccounts screenshots for desktop layouts.
- Applied agreed spelling/grammar tweaks to the memberaccounts guide copy (punctuation, capitalization, and clearer phrasing).
- Increased the invite email screenshot size on desktop.

## December 31, 2025

### Runsheet: Enhanced Account Summary SMS with Portal Link and Payment Notice

**File Changed**: `app/runsheet/[week].tsx`

**Feature**: Updated the account summary text message (sent via the £ button on runsheet jobs) to include additional helpful information for clients.

**New Content Added**:
1. **Customer Portal Link**: Added a line directing clients to sign in to their customer portal for a detailed breakdown, with the URL dynamically generated from the business name (e.g., `www.guvnor.app/tgmwindowcleaning`)
2. **Payment Reference Notice**: Added a message explaining that some payments may not be matched due to missing or generic references like "window cleaner" or "windows", and asking clients to provide statement details if they believe a payment is unaccounted for

**Updated Message Template**:
- Hi, {Client Name}
- Below is an account summary.
- {Balance Status}
- {Services Summary}
- {Payments Summary}
- {Banking Details - if owed}
- Sign in to our customer portal to see a further breakdown at www.guvnor.app/{businessname}
- We are aware of a large number of payments that have no reference...
- Many thanks. / {Your Name} / {Business Name}

---
 
 ## January 2, 2026
 
 ### Payments List: Restore payments under locked-down Firestore rules (no security rollback)
 
 **Files Changed**:
 - `app/payments-list.tsx`
 - `services/paymentService.ts`
 
 **Problem**:
 - `/payments-list` could show **“No payments found”** after Firestore rules were tightened because:
   - It performs a batched client lookup using `where('__name__', 'in', [...])` which can fail the *entire batch* if any client doc is missing/not readable.
   - Some legacy payment docs may be scoped by `accountId` instead of `ownerId`, so `getAllPayments()` could return an empty array even though payments exist.
 
 **Solution**:
 - Added a safe fallback in `/payments-list` to fetch clients **per-doc** if the batched lookup fails, so payments still render (clients may appear as “Unknown” rather than blanking the whole list).
 - Updated `getAllPayments()` to merge results from both `ownerId == accountId` and `accountId == accountId` (compat only), without loosening security.
 
 **User Impact**: Payments should display again in `/payments-list` while keeping the database locked down against DevTools scraping/tampering.
 
 ---

### Auth: Restore verification email sender `noreply@guvnor.app` (Resend) instead of Firebase default sender

**File Changed**:
- `functions/index.js`

**Problem**:
- New user verification emails were being sent from `noreply@roundmanagerapp.firebaseapp.com`.
- Root cause: the Resend Secret Manager key (`RESEND_KEY`) was not present, so the callable `sendVerificationEmail` failed and the client registration flow fell back to Firebase `sendEmailVerification()`.

**Solution**:
- Re-enabled Secret Manager usage for `RESEND_KEY` and wired the email-sending Cloud Functions to use `RESEND_KEY.value()` when deployed.

**Notes**:
- This requires setting the `RESEND_KEY` secret in Firebase Secret Manager (one-time) before deploying functions.

## January 5, 2026

### Firestore rules: Fix reset-day permissions when `accountId` exists but is null/empty

**File Changed**:
- `firestore.rules`

**Problem**:
- Runsheet “Reset day” (↻) started failing with `FirebaseError: Missing or insufficient permissions`.
- Root cause: some legacy job documents have an `accountId` field present but set to `null`/empty. The rules helper treated “accountId exists” as authoritative and ignored `ownerId`, causing `hasResourceAccess` to deny updates even for valid owners/members.

**Solution**:
- Updated the rules helper to prefer `accountId` only when it is non-empty; otherwise it falls back to `ownerId`.

**User Impact**: Reset-day should work again without reopening public data access.

### Runsheet Day Complete: Fix GoCardless DDs not creating local payment records

**Files Changed**:
- `app/runsheet/[week].tsx`
- `services/paymentService.ts`

**Problem**:
- When users completed a day and confirmed the summary modal, GoCardless direct debits could be successfully initiated, but **no local `payments` records** would appear on the account.
- Root cause: the DD initiation path allows job-level **or** embedded `client`-level GoCardless fields, but `createGoCardlessPaymentsForDay()` only considered jobs where `job.gocardlessEnabled && job.gocardlessCustomerId` were set.

**Solution**:
- Updated `createGoCardlessPaymentsForDay()` to detect DD jobs using the same job/client fallback logic as the runsheet’s GoCardless initiation.
- Updated the runsheet mirroring step to create local payment records **only for clients whose GoCardless API payment succeeded**, preventing accidental local-only records for failed DDs.

**User Impact**: Completing a day now correctly creates payment entries on the account for successful direct debits.

---

## January 6, 2026

### Marketing Website: Add `/guides` learning resource page + footer links

**Files Changed**:
- `web/src/app/guides/page.tsx`
- `web/src/app/home/page.tsx`
- `web/src/app/feature-tour/page.tsx`
- `web/src/app/pricing/page.tsx`
- `web/src/app/about/page.tsx`
- `web/src/app/contact/page.tsx`
- `web/src/app/terms/page.tsx`
- `web/src/app/privacy-policy/page.tsx`

**Change**:
- Added a new marketing page at `/guides` designed as a beginner learning resource.
- Replaced the `/guides` page layout with a simple button hub linking to sub-guides:
  - `/guides/migrationguide`
  - `/guides/findingcustomers`
  - `/guides/memberaccounts`
  - `/guides/accountsguide`
- Added the above sub-guide pages.
- Added `/guides/migrationguide` content and screenshot (`import-clientsScreenShot.png`) and ensured the asset is available via `web/public` (copied into root `public` during build).
- Expanded `/guides/migrationguide` with field-by-field guidance for importing clients.
- Added “Importing your clients” subheader + desktop usage note to `/guides/migrationguide`.
- Added “Importing Historic Payments” section and screenshot (`importPayments.png`) to `/guides/migrationguide`.
- Added “Importing Past Completed Jobs” section and screenshot (`ImportingPastCompletedpJobs.png`) to `/guides/migrationguide`.
- Added `/guides/findingcustomers` content and screenshots (Flyer + New Business flow) and ensured the assets are available via `web/public`.
- Reduced the size of the New Business alert screenshot on `/guides/findingcustomers`.
- Added a “Guides” link (`/guides`) into the footer navigation across all existing marketing pages that render the footer.
- Updated `vercel.json` rewrites so `/guides/*` routes to the matching marketing export (prevents the main app router treating it as a business slug).

**User Impact**: New users can find onboarding resources from any marketing page footer and access the new `/guides` page.

## December 30, 2025

### Add Client: Fixed web date picker not updating

**File Changed**: `app/add-client.tsx`

**Problem**: On the `/add-client` screen, users couldn't change the start date. The date field displayed the current date but wouldn't update when users tried to change it by typing or using the calendar picker widget.

**Root Cause**: The native HTML `<input type="date">` element wasn't working reliably in the React Native Web environment. Other screens in the codebase (quotes.tsx, new-business.tsx) successfully use the `react-datepicker` library instead.

**Solution**: Replaced the native HTML date input with the `react-datepicker` library pattern used elsewhere in the app:
- Added `react-datepicker` import (conditionally loaded for web only)
- Added `webDate` state to track the selected date for the picker
- Replaced the `<input type="date">` with a Pressable that opens a DatePicker overlay modal
- Added overlay styles for the web date picker modal
- Synced webDate state when nextVisit is updated from params

**User Impact**: Users can now properly select and change the start date when adding new clients on web. The date picker now appears as a calendar overlay modal, consistent with other date pickers in the app.

---

## January 10, 2026

### Runsheet: Fix reset day error handling - refresh failures no longer mask successful resets

**Files Changed**:
- `app/runsheet/[week].tsx`
- `services/resetService.ts`

**Problem**:
- The runsheet day reset (orange ↻ button) was successfully clearing ETAs and vehicle assignments in the database
- However, refresh errors (Firestore permissions during client re-fetch) were causing the operation to show as "failed"
- Users had to manually refresh the page to see that ETAs were actually cleared

**Solution**:
- Wrapped the refresh logic in `handleResetDay` in a try-catch block
- Refresh failures are now logged as warnings but don't fail the operation
- Success message is shown even if refresh fails (since the database updates succeeded)
- Added note in success message to refresh page if UI doesn't update automatically

**User Impact**: The reset button now correctly shows success when ETAs/vehicle assignments are cleared, even if the UI refresh step fails. The browser automatically refreshes after showing the success message (web only) to display the updated runsheet with jobs sorted by round order.

### Runsheet: Fix reset day to clear ETAs for all non-completed jobs

**File Changed**: `services/resetService.ts`

**Problem**: 
- Reset day function only cleared ETAs for jobs with status 'pending' or 'scheduled'
- Jobs with missing/legacy statuses (or other statuses like 'in_progress') kept their ETAs after reset

**Solution**:
- Changed filter to clear ETAs/vehicle assignments for ALL non-completed jobs (any status except 'completed')
- Uses `getJobsForWeek` pattern (same as runsheet) for consistency
- Updated individual jobs instead of batch to get better error reporting

**User Impact**: Reset day now clears ETAs and vehicle assignments for all jobs on the selected day, regardless of their status (except completed jobs).

---

## December 29, 2025

### Runsheet: “Reset day” (orange ↻) no longer reshuffles the whole week

**Files Changed**:
- `services/resetService.ts`
- `app/runsheet/[week].tsx`

**Problem**:
- Pressing the orange **↻** button on a specific day (e.g. Friday) was unintentionally reorganising other days in the same week.
- Root cause: `resetDayToRoundOrder()` cleared ETAs/vehicle assignments for that day, then triggered **week capacity redistribution** (`manualRefreshWeekCapacity()`), which can move jobs across multiple days.

**Solution**:
- `resetDayToRoundOrder()` now only clears **ETAs** and **manual vehicle assignments** for the selected day — it no longer triggers week redistribution.
- Updated the confirmation copy to explicitly state the reset is **day-only** and will not reshuffle other days.

**User Impact**: The orange ↻ button now affects **only the chosen day**, preventing accidental week-wide changes. (Week-level reset/redistribution remains available via the week reset tooling where intended.)

---

## January 10, 2026

### Runsheet: “Reset day” now clears manual ETAs even when job status isn’t `pending`/`scheduled`

**File Changed**:
- `services/resetService.ts`

**Problem**:
- Pressing the day reset (orange ↻) was expected to remove **all manual ETAs** and **manual vehicle assignments** for that specific day.
- ETAs were sometimes not cleared because `resetDayToRoundOrder()` only targeted jobs with `status` in `['pending', 'scheduled']`. Jobs in other states (e.g. `in_progress`, `accounted`, legacy/missing status) were skipped and kept their `eta`.

**Solution**:
- `resetDayToRoundOrder()` now targets **all jobs on that day** and clears `eta` and `vehicleId` for all **non-completed** jobs.
- Added a safe fallback query (owner-only + client-side date filtering) to avoid failures if Firestore indexes are missing for the range query.

**User Impact**: Day reset reliably removes manual ETAs/vehicle assignments for the selected day, matching the confirmation copy and user expectations.

### Runsheet: ETA ordering now overrides “Rollover” priority within a day

**File Changed**:
- `app/runsheet/[week].tsx`

**Problem**:
- Rollover jobs (red + “ROLLOVER”) were being forced above non-rollover jobs even when they had a later ETA, preventing users from arranging the day’s sequence by ETA.

**Solution**:
- Changed the per-vehicle sort so **ETA is the primary sort key** (when set), and rollover priority only applies when jobs have **no ETA**.

**User Impact**: Users can order jobs within a day by ETA “as normal”, while rollover jobs still remain clearly labelled/styled.

### Security: Lock down Firestore (stop DevTools data exfiltration / public client record updates) while keeping Client Portal UX unchanged

**Files Changed**:
- `firestore.rules`
- `functions/index.js`
- `firebase.json`
- `app/[businessName].tsx`

**Problem**:
- Several core collections were **publicly readable**, and `clients` was **publicly updatable** via Firestore rules. This allowed anyone with browser DevTools to query/download data and modify client records.
- `accounts/{accountId}/members/{memberId}` rules also allowed a signed-in user to **self-add** to other accounts by writing their own member doc under a victim `accountId`.
- Resend email sending functions had a **hardcoded API key fallback**, and unauthenticated contact/email entry points had no rate limiting.

**Solution**:
- **Client Portal** (`/app/[businessName].tsx`) now uses a server-side **Portal API** (`/api/portal/*`) instead of direct Firestore reads/writes, preserving the existing portal flow (account number → last 4 digits → dashboard).
- Updated `firestore.rules` to remove public access to `clients/jobs/servicePlans/payments/users`, removed public `clients` updates, and restricted `members` writes to **owners only** (members can still delete their own record to leave a team).
- Added Firebase Hosting rewrite for `/api/portal/**` → `portalApi` (Cloud Function v2).
- Removed hardcoded Resend fallback and added basic Firestore-backed rate limiting for `submitContactForm`.

**User Impact**:
- Public client portal experience remains the same, but backend data is no longer exposed to DevTools scraping/tampering.
- Significantly reduced risk of account takeover via malicious membership writes.

### Clients: Restore Service History + Service Schedule under locked-down Firestore rules

**Files Changed**:
- `app/(tabs)/clients/[id].tsx`
- `app/(tabs)/clients/[id]/manage-services.tsx`

**Problem**:
- Client detail screens were querying `jobs`, `payments`, and sometimes `servicePlans` using `clientId` only.
- After tightening Firestore rules (no public access), those unscoped queries could return empty results or fail, causing **Service History** and **Service Schedule** to show no records.

**Solution**:
- Updated queries to always include `ownerId == getDataOwnerId()` alongside `clientId` when fetching `jobs`, `payments`, and `servicePlans`.
- Updated related job cleanup queries (deleting pending jobs for removed additional services / archive cleanup) to include owner scoping.

**User Impact**:
- Service History and Schedule should populate normally again for authorized users, without reopening public data access.

## December 27, 2025

### Firebase: Daily `numberOfClients` field on user documents (midnight scheduled Cloud Function)

**File Changed**:
- `functions/index.js`

**Change**:
- Added a scheduled Cloud Function v2 (`updateNumberOfClientsDaily`) that runs **daily at 00:00** (`Europe/London`).
- For each `users/{uid}` document, it computes the **active client count** for that user’s **account** (matches app-side `getDataOwnerId()` / `accountId`) by counting `clients` where `ownerId == accountId` and `status != 'ex-client'`.
- Writes the results to:
  - `users/{uid}.numberOfClients`
  - `users/{uid}.numberOfClientsUpdatedAt`

**User Impact**: Firestore user documents will now show an up-to-date active client count each day, which can be used for reporting, admin visibility, and future UI without relying on client-side counting.

## December 22, 2025

### Runsheet / Workload Forecast: Reset week/day now reapplies capacity spillover (and fixed week query bounds)

**Files Changed**:
- `services/resetService.ts`

**Problem**:
- Pressing the orange **reset week** button (workload forecast) or **reset day** button (runsheet) only cleared manual ETAs/vehicle assignments, but did **not** re-run the capacity redistribution logic.
- `resetWeekToRoundOrder()` used a `<= yyyy-MM-dd` upper bound against timestamp strings (e.g. `2025-12-29T09:00:00`), which could exclude jobs on the week’s final day.

**Solution**:
- After resetting, trigger capacity redistribution so jobs **spill into subsequent days** based on daily turnover limits.
- Force redistribution for the **current week** using `manualRefreshWeekCapacity()` (since the automated trigger intentionally skips current week).
- Fixed the week query to use a proper exclusive upper bound (`< (weekEnd + 1 day)T00:00:00`).

**User Impact**: Resetting a week/day now immediately rebalances work across the week to respect the daily turnover limit, instead of leaving all jobs on the original day.

### Rota: Changing availability no longer auto-reshuffles jobs

**Files Changed**:
- `services/rotaService.ts`

**Problem**: Updating a rota cell was auto-triggering capacity redistribution, which could reshuffle jobs across days and feel like the runsheet was “reset” without the user explicitly requesting it.

**Solution**: Removed the automatic redistribution trigger from rota updates. Users can now review rota changes and then manually run the runsheet refresh/reset action when they’re ready.

**User Impact**: Rota edits won’t unexpectedly move jobs or disrupt ETAs/vehicle assignments; rebalancing is now explicitly user-driven.

### Web: Added Google Ads base tag (gtag.js) for conversion measurement

**File Changed**: `web/src/app/layout.tsx`

**Change**:
- Added the Google Ads base tag (`AW-17819223960`) using Next.js `next/script` so it loads across the marketing site.
- Implemented **web-only** (in the `web/` Next.js project) to avoid impacting the Expo mobile/desktop app.
- Follow-up: switched script loading strategy to `beforeInteractive` to improve Google Ads “Test connection” detection reliability.

**User Impact**: Google Ads can now measure conversions/visits from your web pages, enabling Performance Max optimization once conversion actions are configured.

### Web (Expo export): Injected Google Ads base tag into root app HTML

**File Added**: `app/+html.tsx`

**Problem**: `www.guvnor.app/` primarily serves the Expo web export (`dist/index.html`) due to `vercel.json` rewrites, so Google Ads “Test connection” couldn’t detect the tag when it only existed in the Next.js marketing build.

**Solution**: Added an Expo Router HTML shell (`app/+html.tsx`) that injects the Google Ads base tag (`AW-17819223960`) into the exported HTML head for the web app.

**User Impact**: Google Ads tag detection should now succeed on the root domain, enabling conversion tracking setup in Google Ads.

## December 21, 2025

### Runsheet: Keep “Move” available for incomplete past-day jobs

**File Changed**: `app/runsheet/[week].tsx`

**Problem**: On the runsheet, jobs scheduled on past days (that were never completed) lost the **Move** button, leaving users unable to bring those overdue jobs forward.

**Solution**:
- Updated the **Move** button visibility logic to include **past-day** jobs as long as they are **not** `completed` (and also not `accounted` / `paid`).
- Preserved the existing behavior that prevents moving jobs on **completed days** (`completedDays`).

**User Impact**: Users can now move overdue (incomplete) jobs forward, while completed/accounted/paid jobs still cannot be moved.

## December 17, 2025

### Pricing: Updated FAQ downgrade/non-renewal copy

**File Changed**: `web/src/app/pricing/page.tsx`

**Change**:
- Replaced the FAQ answer under “Can I downgrade back to the free plan?” with updated wording about non-renewal behavior when exceeding 20 active clients.

**User Impact**: Pricing FAQ now accurately reflects feature access limitations when a subscription isn’t renewed and the account exceeds the free plan client limit.

### Home: Upgrade to Premium modal - removed money-back guarantee section

**File Changed**: `components/UpgradeModal.tsx`

**Change**:
- Removed the blue “30-day money-back guarantee” block (“Not satisfied? Get a full refund within 30 days.”) from the Upgrade modal shown to Free users from the Home screen.

**User Impact**: Upgrade modal is simpler/cleaner and no longer shows the money-back guarantee section.

### Marketing login page copy (UK spelling)

**File Changed**: `app/login.tsx`

**Changes**:
- Changed hero heading from "Welcome back to Guvnor" to "Welcome to Guvnor"
- Changed feature bullet to UK spelling: "Smart Scheduling & route optimisation"

**User Impact**: Marketing/login page now uses UK English spelling and updated welcome headline.

### Home: Settings drawer (animated slide-out) opened from the gear icon

**File Changed**: `app/(tabs)/index.tsx`

**Change**:
- Replaced Home’s gear icon navigation to `/settings` with an **animated slide-out side-sheet** on the Home screen.
- Updated the drawer to **slide out from the left** side of the screen (more natural navigation pattern).
- The drawer renders the existing `SettingsScreen` UI, so the settings content stays consistent.
- “View details” in the Home upgrade banner now opens the same drawer.

**User Impact**: Settings feel faster/more modern (no full page switch), while keeping the existing settings functionality intact.

### Updated Materials Page Descriptions

**File Changed**: `app/materials.tsx`

**Changes**:
- **Invoice description**: Changed from "Preview of your customizable invoice template" to "Fold into a quarter for convenient posting. Handwrite the account number, Cost and date of services"
- **Flyer description**: Changed from "Promotional flyer for existing customers" to "Tested and effective flyer with a 1 in 55 conversation rate over 1 month in a new build estate. Especially attractive to younger customers while allowing older generations to pick up the phone"
- **Canvassing Flyer description**: Changed from "Door-to-door marketing flyer for new areas" to "Extremely effective when canvassing to post when no one answers the door. Handwrite the provisional cost of your service at the bottom to maximise your opportunities"

**User Impact**: Users now see more descriptive and actionable guidance for each printable material type.

### Fixed Materials Page Description Text Wrapping on Mobile

**File Changed**: `app/materials.tsx`

**Problem**: The longer description text for materials (Invoice, Flyer, Canvassing Flyer) was running off the screen on mobile devices instead of wrapping to new lines.

**Solution**: 
- Added `sectionTitleWrapper` style with `flex: 1`, `flexShrink: 1`, and `minWidth: 0` to constrain the text container width
- Added `flexShrink: 1` and `flexWrap: 'wrap'` to `sectionSubtitle` style
- Applied the wrapper style to all three section headers

**User Impact**: Description text now wraps properly on mobile screens instead of extending off-screen.

---

### Runsheet: Compact Header on Mobile / Narrow Screens

**File Changed**: `app/runsheet/[week].tsx`

**Problem**: The runsheet week header consumed too much vertical space on mobile due to a large font, large top padding, and a long title string that wrapped onto multiple lines.

**Solution**:
- Added a responsive “compact header” mode on mobile/narrow widths.
- Uses a shorter title format (`WC 15 Dec`) on compact layouts.
- Forces the title to stay on one line with ellipsis truncation.
- Reduces header padding and title font size on compact layouts.
- Multi-select toggle shows an icon on all layouts and hides the “Select multiple” label on compact layouts to prevent title wrapping.

**User Impact**: More screen space is available for jobs on mobile, with the week context still visible.

---

### Register Page: Require Address + Add Postcode Field + UI Polish

**File Changed**: `app/register.tsx`

**Problems**:
- `/register` UI looked like a basic unstyled form (default inputs/buttons, no hierarchy).
- Address fields were shown as optional and were not validated.
- Production `/register` was missing a visible postcode input (now explicitly present in the source UI).

**Solution**:
- Rebuilt the Register screen layout to match the more polished style used on `app/login.tsx` (hero + centered card + labeled fields + modern buttons), while keeping it cross-platform for web and mobile.
- Made **Address line 1**, **Town/City**, and **Postcode** required at registration.
- Always saves `address1`, `town`, `postcode`, and the legacy combined `address` field to the user document.
- Normalizes postcode to uppercase and collapses extra spaces before saving.

**User Impact**:
- New users must provide a complete address including postcode (improves downstream features like weather).
- Register page now looks consistent with the rest of the web experience.

### Register: Friendlier auth errors (email already used, weak password, invalid email)

**File Changed**: `app/register.tsx`

- Switched registration alerts to use `window.alert` on web (matching `/login`) for better reliability.
- Added user-friendly error messages for common Firebase auth failures (e.g. **email already in use**) and avoided noisy `console.error` stack traces.

### Auth emails: Verification now sent from `noreply@guvnor.app`

**Files Changed**: `functions/index.js`, `app/register.tsx`, `app/login.tsx`

- Added callable function `sendVerificationEmail` that generates the Firebase verification link and sends it via **Resend** using the `@guvnor.app` sender domain.
- Updated registration flow to call `sendVerificationEmail` (with fallback to Firebase `sendEmailVerification` if Resend fails).
- Added a “Resend verification email” prompt on login when a user attempts to sign in with an unverified email.

---

### Bulk Payments: Allow on mobile (manual entry) + “Best on desktop” modal prompt

**Files Changed**:
- `app/accounts.tsx`
- `app/bulk-payments.tsx`
- `services/unknownPaymentService.ts`

**Change**:
- Removed the “desktop only” blocking behavior so users can still open Bulk Payments on mobile.
- On mobile/small screens, tapping **Add Bulk Payments** now shows an in-app modal prompt (“best used on desktop for quicker use”) with a **Continue** button before opening `/bulk-payments` (implemented with `Modal` so it works on mobile web too).
- Added a native (iOS/Android) fallback UI for Bulk Payments using a simple card-per-row entry form that reuses the same validation and submission logic.
- Updated unknown payments method typing to include `direct_debit` to match supported payment methods in bulk entry.

### Bulk Payments: Fix “Bank Transfer” invalid type on submit

**Files Changed**:
- `app/bulk-payments.tsx`

**Change**:
- Fixed submit-time payment type canonicalization to accept `bank_transfer` (the dropdown value), preventing “invalid type” errors when users select **Bank Transfer**.

---

### Settings: Replace CSV import pickers with spreadsheet-style import screens

**Files Changed**:
- `app/(tabs)/settings.tsx`
- `app/import-clients.tsx`
- `app/import-completed-jobs.tsx`
- `utils/spreadsheetImport.ts`

**Change**:
- Settings → **Import Data** buttons now open new spreadsheet-style import screens instead of a file picker.
- Web supports **paste from Excel/Google Sheets** into a grid (similar to Bulk Payments).
- Mobile supports **manual entry** (best on desktop for speed).
- Import behavior mirrors existing CSV import rules (client limits, account/round auto-assign, unknown payments, and historic completed job shape).
 - Payments import is handled via **Bulk Payments** (`/bulk-payments`) rather than a dedicated import screen.

---

### First-time Setup: UI refresh for invite choice + business info steps

**File Changed**: `components/FirstTimeSetupModal.tsx`

- Replaced the “blank page + giant buttons” onboarding screens with a centered **card** layout.
- Added a simple 4-step **progress indicator** and consistent headers/icons per step.
- Made the Business Information and subsequent steps **responsive** (max width + stacked actions on narrow screens).
- Replaced default RN `Button` controls with consistent styled actions matching the web look.

---

### Home: Show Free plan client limit + Upgrade to Premium CTA

**File Changed**: `app/(tabs)/index.tsx`

- Added a home-screen banner for **Free plan** users showing the **20 client limit** (and current usage where available).
- Included an **Upgrade to Premium** button that opens the existing `UpgradeModal` (owners only; members see a note to ask the owner).
- Keeps the subscription upsell visible on the dashboard in addition to `/settings`.

---

### First login: one-time import tip after onboarding

**File Changed**: `app/(tabs)/index.tsx`

- Moved the import guidance into the **First Time Setup flow** (in-app), rather than showing a browser popup on web.

**Files Changed**: `components/FirstTimeSetupModal.tsx`, `app/(tabs)/index.tsx`

- Added a final setup step that shows:
  - “If you would like to import your existing customers, past payments and completed jobs, visit the import section in the settings menu”
- Includes an in-app button to open `/settings` → Import.
- Removed the previous home-screen popup/confirm approach.

---

## December 16, 2025

### Fixed Additional Services Occlusion on Flyer Back

**File**: `app/materials.tsx`

**Problem**: The additional services section on the back of the flyer was being covered by the footer, making it partially or fully invisible.

**Solution**: Reduced the height of the flyer footers by adjusting padding, curve dimensions, and icon/text sizes.

**Changes Made**:
- `flyerStyles.footer`: Reduced padding from `24/12/16` to `8/6/12`
- `flyerStyles.footerCurve`: Reduced curve height from 40px to 24px, adjusted top offset from -20 to -12
- `flyerStyles.phoneNumber`: Reduced font size from 27 to 16
- `flyerStyles.contactText`: Reduced font size from 15 to 11
- `flyerStyles.contactRow`: Reduced gap and margin
- Footer icons: Reduced from 24/21 to 14/12 size
- `flyerStyles.servicesSection`: Adjusted marginTop from -400 to -80

**User Impact**: Additional services section is now fully visible above the footer on the back of the flyer.

---

### Dark Mode Readability Fix for Clients Pages

**Files Changed**:
- `constants/Colors.ts` - Extended with dark mode color palette
- `app/clients.tsx` - Updated to use theme-aware colors
- `app/(tabs)/clients/[id].tsx` - Updated to use theme-aware colors

**Problem**: Users on dark mode phones couldn't read text in the clients list and client detail pages because styles used hardcoded light-mode colors (`#f9f9f9`, `#333`, `#666`, etc.) that don't adapt to dark mode.

**Solution**: Extended the theme color system and updated client-related components to use theme-aware colors.

**New Colors Added to Theme**:
- `card` / `cardBorder` - Card/item backgrounds and borders
- `secondaryText` / `tertiaryText` - Muted text colors
- `inputBackground` / `inputBorder` / `inputText` - Form input styling
- `sectionCard` / `sectionCardHeader` / `sectionCardBorder` - Section card styling
- `jobItemBackground` / `jobItemBorder` - Job history items
- `paymentItemBackground` / `paymentItemBorder` - Payment history items
- `modalBackground` / `modalOverlay` - Modal styling
- `divider` - Divider lines
- `notesBackground` - Notes section background
- `buttonSecondary` / `panelBackground` - Secondary button and panel backgrounds

**Components Updated**:
- Client list cards now use theme-aware backgrounds
- Sort buttons and search input use theme colors
- Client detail page section cards, history items, notes sections all adapt to dark mode
- Modal backgrounds and text are now readable in dark mode
- All icons use theme-aware secondary text color

**User Impact**: Client list and client detail pages are now fully readable on both light and dark mode devices.

---

### Client Portal Mobile Layout Fixes

**File**: `app/[businessName].tsx`

**Problems Fixed**:
1. **Logo not centered on mobile**: The navigation header logo was left-aligned on mobile when nav links were hidden, instead of being centered.
2. **Quote form overflow**: The Email and Notes fields were appearing outside the form card border on mobile viewports. This was caused by `flex: 1` on the form cards splitting available height equally between login and quote cards in column layout.

**Solutions**:
1. **Logo centering**: Added `navContentMobile` style with `justifyContent: 'center'` applied when `isNarrowWeb` is true.
2. **Form card height**: Added `formCardMobile` style that removes `flex: 1` so cards can expand naturally to fit their content. Applied to both login and quote cards.

**New Styles Added**:
- `navContentMobile`: Centers logo in the navigation header on narrow viewports
- `formCardMobile`: Removes flex constraint so form cards grow to fit content

**User Impact**: The client portal page now displays correctly on mobile devices with:
- Centered Guvnor.app logo in the header
- Full quote form visible within its bordered card (Email and Notes fields no longer overflow)

---

### Home: Progress Card Opens Runsheet

**File**: `app/(tabs)/index.tsx`

- Made the "Today's Progress" card tappable/clickable and route directly to the current week's runsheet (`/runsheet/[week]` with the correct Monday anchor).
- Added a subtle pressed state for feedback while keeping existing styling intact.

---

## December 15, 2025

### Materials: Fix logo upload crash (web)

**File**: `app/materials.tsx`

- Fixed Configure Materials logo upload failing on web due to React Native `Image` import shadowing the browser `Image()` constructor.
- Aliased React Native `Image` to `RNImage` and used a DOM `<img>` element for upload processing.
- Updated modal helper text to reflect 2MB limit.

### Materials: Fix missing logos in PNG export

**File**: `app/materials.tsx`

- Fixed exported PNGs sometimes missing uploaded logos by waiting for images to load/decode before capture and preserving `<img>` `src`/eager-loading behavior in the `html2canvas` clone.
- Added a fallback for small images (logos) to be rendered as `background-image` on their parent container in the clone, avoiding intermittent `<img>` drops in `html2canvas`.
- Mapped logo `<img>` `object-fit`/`object-position` to `background-size`/`background-position` to keep the exported logo framing identical to the preview.

### Reimagined Dashboard UI

**Files**: `app/(tabs)/index.tsx`, `package.json`, `package-lock.json`

- Redesigned the home dashboard to match the new graphical concept: gradient background, hero progress card, weather pill, and icon-driven tile grid with responsive sizing for web and mobile.
- Added outlined icons per tile plus badge support for New Business requests; preserved existing navigation and permission gating.
- Introduced `expo-linear-gradient` for the cross-platform background treatment.

### Mobile visual fixes

- Reduced gradient accent sizes/opacity and added overflow clipping to stop the light overlay washing out tiles and to prevent horizontal scrolling on mobile.

---

## December 15, 2025

### Added SMS Invoice Shortcut for Outstanding Accounts

**File**: `app/accounts.tsx`

- Load owner profile (business name + bank details) for the accounts screen.
- Added a "Send SMS Invoice" button on each outstanding account card that opens the native SMS app with a pre-filled invoice-style reminder including balance due, bank transfer details (sort code, account number, reference), and account reference.
- The SMS also links to the client portal so the customer can view their full statement online.
- Updated copy: removed “due on receipt” and the “Account Name” bank line; added a note asking customers to contact if they paid with a different reference so unknown payments can be linked.

---

## December 15, 2025

### Move Payments Between Clients from Service History

**File**: `app/(tabs)/clients/[id].tsx`

- Added “Move” action to payment entries in Service History.
- New modal lets users search/select another client and reassign the payment; job link is cleared to avoid mismatches.
- Service history refreshes after the move and guards prompt for client selection.

---

## December 15, 2025

### Added Multi-Select Move for Runsheet Jobs

**File**: `app/runsheet/[week].tsx`

- Added a `Select multiple` toggle next to the runsheet home button with a live count badge and selected jobs notice.
- Jobs can now be multi-selected (highlighted with a check and "Selected" tag) and moved in one action via a new `Move jobs` button that appears while selection is active.
- Bulk move now asks for both the target date and vehicle (or automatic allocation), with a shared date/vehicle picker (web and mobile) and batched updates, preserving defer/original date logic when crossing weeks.
- Guards prevent moving to past dates or to today when today is marked complete, and non-movable items (notes, quotes, completed jobs) are ignored automatically.
- Selection state clears after a successful move or when toggling selection off to avoid stale selections.

---

## December 13, 2025

### Fixed Mobile Overflow Issues in Expo App Login Screen

**File**: `app/login.tsx`

**Problem**: The login screen was cutting off content and overflowing on mobile devices:
- Logos were way too large (520px width) causing horizontal overflow
- Footer content was cut off at the bottom
- "Start free with up to 20 clients →" text was clipped on the right
- No proper overflow constraints on containers
- Navigation links were cut off on mobile

**Solution**: 
1. **Optimized logo sizes** for better mobile/desktop balance:
   - Nav logo: 520px → 400px (mobile: 320px)
   - Form logo: 480px → 360px (mobile: 280px) 
   - Footer logo: 360px → 300px (mobile: 240px)

2. **Fixed container overflow**: Added overflow hidden and proper constraints to prevent content spilling

3. **Improved footer responsiveness**:
   - Added proper padding and flex-wrap for mobile
   - Centered footer columns on mobile
   - Reduced gaps and padding for smaller screens

4. **Fixed features section**:
   - Made feature text wrap properly
   - Added horizontal padding for mobile
   - Prevented pricing link from being cut off

5. **Fixed navigation for mobile**:
   - Hide full navigation on narrow mobile screens
   - Show only Home and Pricing links on mobile to prevent overflow
   - Full navigation remains visible on desktop/tablet

**Impact**: The login page now fits properly within mobile viewports without horizontal scrolling or cut-off content, with appropriately sized logos and responsive navigation.

---

## December 13, 2025

### Past Date Validation for Job Deferral in Runsheets

**Problem**: Jobs could potentially be moved to past dates through the date picker, which doesn't make sense for scheduling future work.

**Solution**: Added validation to prevent moving jobs to dates that have already passed.

**Changes Made**:

**File**: `app/runsheet/[week].tsx`

1. **Backend Validation in handleDeferDateChange()**:
   - Added date comparison check before processing job move
   - Compares selected date with today's date (both normalized to midnight)
   - Shows alert "Cannot Move to Past Date" with message "You cannot move jobs to a date that has already passed."
   - Prevents the job move action and resets the deferral state

2. **UI Prevention (Already Existed)**:
   - Web: HTML date input already had `min={format(new Date(), 'yyyy-MM-dd')}` attribute
   - Mobile: DateTimePicker already had `minimumDate={new Date()}` property
   - These UI restrictions prevent selecting past dates in the date picker itself

**User Experience**:
- Date pickers only allow selecting today or future dates
- If a past date is somehow selected (e.g., edge cases, developer tools manipulation), a clear error message is shown
- Jobs can only be scheduled for today or future dates, maintaining logical scheduling flow

---

## December 13, 2025

### Fixed Marketing Site Mobile Layout Overflow + Missing Navigation Links

**Problem**: On narrow smartphone screens the marketing pages could overflow horizontally (spilling to the right) and the header navigation links were not accessible on mobile.

**Solution**:
- Added an explicit viewport configuration for correct mobile scaling.
- Added global CSS guardrails to prevent horizontal overflow.
- Implemented a shared, mobile-friendly marketing navigation with a hamburger menu.
- Fixed a non-wrapping flex row on `/pricing` that could force horizontal scrolling.
- Routed the site root (`/`) to the marketing home page.
- Updated Vercel rewrites to support marketing routes with and without trailing slashes.

**Files Changed**:
- `vercel.json`
- `web/src/app/layout.tsx`
- `web/src/app/globals.css`
- `web/src/components/MarketingNav.tsx`
- `web/src/app/page.tsx`
- `web/src/app/home/page.tsx`
- `web/src/app/about/page.tsx`
- `web/src/app/contact/page.tsx`
- `web/src/app/pricing/page.tsx`
- `web/src/app/feature-tour/page.tsx`
- `web/src/app/terms/page.tsx`
- `web/src/app/privacy-policy/page.tsx`

---

## December 11, 2025

### Added Item-Specific Configuration Modals for Materials

**File**: `app/materials.tsx`

**Feature**: Each material type (Invoice, Flyer, Canvassing Flyer, New Business Leaflet) now has an "Options" button that opens a configuration modal with checkboxes to customize what sections to include.

**Invoice Options**:
- Direct Debit (show/hide)
- Cash (show/hide)
- Include Business Address (show/hide)

**Flyer Options** (placeholder):
- Contact Details
- Services List
- FREE Quote Badge

**Canvassing Flyer Options** (placeholder):
- Price Boxes
- Additional Services
- Contact Information

**New Business Leaflet Options** (placeholder):
- Pricing Table
- Payment Methods
- Service Area Map

**Implementation**:
- Added item configuration interfaces: `InvoiceItemConfig`, `FlyerItemConfig`, `CanvassingFlyerItemConfig`, `LeafletItemConfig`
- Added `ItemConfigurationModal` component with checkbox UI
- Added "Options" button next to "Download PDF" for each material section
- Added `itemConfigStyles` stylesheet for the modal

**Note**: The options UI is complete but the actual toggle functionality to show/hide sections in the previews will be implemented next.

---

### Made Materials Page Settings Button More Prominent

**File**: `app/materials.tsx`

**Problem**: The settings button on the materials page was just a small icon in the top right corner of the header, making it too hidden when it's actually a very important feature for configuring business details.

**Solution**: Added a prominent configuration banner below the header that clearly highlights the settings functionality.

**Changes**:
- Removed the small settings icon from the header
- Added a large, eye-catching blue banner with:
  - Settings icon in a circular container
  - "Configure Your Business Details" title
  - Subtitle explaining what can be configured (business name, contact info, banking details & services)
  - Chevron arrow indicating it's tappable
  - Blue background (#007AFF) with shadow for visual prominence

**New Styles Added**:
- `configBanner` - Main banner container with blue background and shadow
- `configBannerContent` - Flexbox row layout for icon, text, and chevron
- `configBannerIcon` - Circular icon container with semi-transparent background
- `configBannerText` - Container for title and subtitle
- `configBannerTitle` - Bold white title text
- `configBannerSubtitle` - Slightly transparent white subtitle text

**User Impact**: The configuration modal is now much more discoverable, making it easier for users to set up their business details for invoice and flyer generation.

---

### Materials Page Config Banner No Longer Pinned While Scrolling

**File**: `app/materials.tsx`

**Problem**: The blue “Configure Your Business Details” banner stayed visible at the top while the user scrolled through the materials, which felt like a pinned element.

**Solution**: Moved the configuration banner inside the `ScrollView` so it scrolls away naturally with the page content.

**User Impact**: Users can scroll the materials without a persistent banner taking up screen space.

---

### Invoice Front Layout Improvements

**File**: `app/materials.tsx`

**Changes**:
1. **Restructured to row-based layout**: Changed from two independent columns to a two-section layout:
   - **Top Section (row)**: Header + Branding (left) | Bank Transfer + Notes (right)
   - **Bottom Section (row)**: Direct Debit + Cash + Post (left) | Work Completed (right)
   
2. **Proper alignment**: Direct Debit and Work Completed now start at exactly the same vertical position because they're in the same row container.

3. **Added "Post" Box**: The business address section is now in a blue-bordered box with the title "Post" instead of just plain text, matching the design pattern of other sections.

**New Styles Added**:
- `topSection` - Flex row for top portion (branding + bank/notes)
- `bottomSection` - Flex row for bottom portion (payment methods + work completed)
- `topLeftColumn`, `topRightColumn` - Column containers for top section
- `bottomLeftColumn`, `bottomRightColumn` - Column containers for bottom section

---

## December 10, 2025

### Added Materials Page with Invoice Preview

**Files Changed**:
- `app/(tabs)/index.tsx` - Added Materials button to homescreen with permission key
- `app/(tabs)/team.tsx` - Added Materials permission toggle for team members
- `app/materials.tsx` - Materials page with Invoice preview component

**Purpose**: Materials page for users to find invoices, leaflets, and lead generation flyers.

**Invoice Component Features**:
- Two-column layout replicating physical invoice design
- Left column:
  - Services provided date header with checkmark icon
  - Business logo/branding section (logo circle, business name, tagline)
  - Phone number and social media links
  - Direct Debit payment box with GoCardless URL
  - Cash payment instructions box
  - Business address footer
- Right column:
  - Bank Transfer details box (account name, sort code, account number, payment reference)
  - Notes section
  - Work completed table with 9 service line items and total row
- Blue (#2E86AB) accent color for borders, links, and highlights
- Clean, professional styling matching the physical invoice template

**Permission System**:
- Owner accounts always have access to Materials
- Team members need the `viewMaterials` permission enabled by the owner
- Permission can be toggled in Team → member card → Permissions section

**Next Steps**: Invoice data will be populated from user settings/context (business name, bank details, services, etc.)

---

### Moved Activity Log Button from Homescreen to Rota Page

**Files Changed**:
- `app/(tabs)/index.tsx` - Removed Activity Log button from homescreen
- `app/rota.tsx` - Added Activity Log button to rota page header

**Changes**:
- Removed the "Activity Log" button from the homescreen button grid (both in `baseButtons` and `buttonDefs` arrays)
- Added an "Activity Log" link to the rota page header, positioned next to the existing "Rota History" link
- The Activity Log remains accessible at `/audit-log` route

**Reason**: Declutters the homescreen by moving less frequently used functionality to a more contextually appropriate location within the Rota page.

---

### Implemented New Business Quote Requests Page

**File**: `app/new-business.tsx`

**Feature**: Complete page for viewing and managing quote requests submitted through the client portal.

**Quote Request Cards Display**:
- Customer name and submission date
- Status badge (New, Quote Scheduled, Converted, Declined)
- Phone number, email (if provided), and full address
- Notes from the prospective customer (if any)

**Action Buttons**:
1. **Schedule Quote** (Blue)
   - Opens a modal to create a new quote in the quotes system
   - Pre-populates: Name, Address, Town, Phone Number, Notes
   - Includes date picker for scheduling the quote visit
   - Lead source auto-set to "Client Portal"
   - Updates request status to "contacted" after creation
   - Explainer tip: "Raise a visit to quote on a later date"

2. **Add Client** (Green)
   - Navigates directly to `/add-client` with pre-populated fields
   - Pre-fills: Name, Address Line 1, Town, Postcode, Mobile Number, Email, Source
   - Updates request status to "converted"
   - For when you've already quoted and agreed terms

3. **Delete Request** (Red text)
   - Removes the quote request with confirmation prompt

**Header Features**:
- Title and subtitle explaining the page purpose
- Home button to return to main dashboard
- Pending count badge showing new unprocessed requests

**Technical Implementation**:
- Real-time Firestore listener for quote requests
- Queries `quoteRequests` collection filtered by `businessId`
- Creates quotes in the `quotes` collection (same format as /quotes page)
- Logs quote creation to audit log
- Updates request status on action completion

### Removed Add New Client Button from Home Screen

**File**: `app/(tabs)/index.tsx`

**Change**: Removed the "Add New Client" button from the home screen grid since this functionality is accessible from within the Client List page. This creates a cleaner 2x4 grid layout with the new "New Business" button.

---

## December 9, 2025

### Reworked Accounts Financial Summary

**File**: `app/accounts.tsx`

- Pulled the three financial quick links (Completed Jobs, All Payments, Unknown Payments) out into their own standalone cards so they read clearly as tappable boxes on both desktop and mobile.
- Replaced the old financial summary grid with an over-time bar chart showing completed job value (blue) vs payments received (green), plus a £ axis for clarity.
- Added timeframe chips (Daily, Weekly, Monthly, Year-to-date, Annual, Lifetime) to switch the chart aggregation, using existing Firestore job/payment data.
- Included a simple legend and updated styling for the quick links to feel more prominent/clickable.
- Fixed bar rendering by correcting available width and making the chart area flex to its container.
- Improved chart readability with nicer y-axis ticks, capped x-label density, range totals line, hover/tap tooltips showing exact £ values per bucket, and replaced the multi-chip timeframe selector with a single cycle button to avoid overflow on mobile.
- Adjusted chart insets (symmetric start/end gaps) so bars center within the plot instead of appearing squashed to the right.
- Fixed bar/label horizontal alignment so x-axis labels are directly under their corresponding bar groups.
- Increased chart height for better visual separation and readability.
- Fixed bar baseline so bars start from the £0 line instead of floating above it.
- Changed y-axis scaling to use max value + 10%, rounded up to nearest £100, ensuring bars never exceed chart height.
- Fixed bar/gridline alignment by using consistent top-based positioning so bar heights match y-axis values.
- Split combined bar chart into two separate charts (Completed Jobs and Payments Received), each with its own y-axis scale for clearer reading.

### Added Bulk Payments Feature (UI Only)

**Files**: 
- `app/accounts.tsx` - Added "Add Bulk Payments" button
- `app/bulk-payments.tsx` - New spreadsheet-style bulk payment entry page

**Feature**: Added a new bulk payments interface accessible from the Accounts page. This allows users to enter multiple payments at once using a spreadsheet-like interface.

**Accounts Page Changes**:
- Added "Add Bulk Payments" button in the header
- Desktop: Navigates to `/bulk-payments`
- Mobile: Shows alert explaining feature is desktop-only

**Bulk Payments Page Features**:
- Native HTML table for proper paste support on web
- Spreadsheet grid with columns: Account Number, Date, Amount, Type, Notes, Status
- Starts with 15 empty rows, "Add 5 Rows" button to expand
- **Paste support**: Click any cell and paste from Excel/Google Sheets/LibreOffice - data fills across columns and down rows
- Real-time validation:
  - Account numbers matched against existing clients (green = valid, yellow = unknown)
  - Date validation (expects DD/MM/YYYY format)
  - Amount validation (must be positive number)
  - Type dropdown with options: Cash, Card, Bank Transfer, Cheque, Direct Debit, Other
  - Type column preserves raw pasted values - if invalid, shows red border with dropdown to fix
- Invalid account numbers scan for embedded references like "RWC123" inside noisy text and surface a one-click "Use RWC123" suggestion to auto-correct the cell
- For unknown accounts without an RWC hint, a "Find account" button opens a modal that lets the user search clients by name or address and apply the correct account number in one click
- Find-account modal now supports searching by account number too and is anchored to the right side of the screen
- Back button now falls back to `/accounts` if browser history cannot navigate back
- Submission implemented:
  - Valid rows create payments in `payments` collection
  - Unknown accounts create entries in `unknownPayments`
  - Duplicate detection within the submission (account + date + amount) with confirmation prompt
  - Input validation for date, amount, and type before submit
- Status column showing Valid/Unknown/Invalid for each row
- "Clear All" button to reset the spreadsheet
- Legend explaining color coding
- Mobile fallback with message to use desktop

**Note**: Submission functionality not yet implemented - this is UI-only for testing.

---

### Added Quick Action Buttons to Runsheet Job Rows

**File**: `app/runsheet/[week].tsx`

**Feature**: Added inline quick action buttons to each job row in the runsheet for faster access to common actions.

**Buttons**:
1. **Nav** - Opens Google Maps navigation to the client's address
2. **ETA** - Sends an ETA text message to the client
3. **£** - Sends account summary text message (colored by balance status)
   - 🔴 Red when client has outstanding balance
   - 🟢 Green when client is up-to-date or has credit
4. **+** - Opens the full options modal with all available actions

**Implementation**:
- Added `clientBalances` state to track balance for each client
- Added `useEffect` to fetch client balances when jobs load:
  - Fetches completed jobs and payments for all clients in batches
  - Calculates balance (payments - jobs + starting balance) for each client
- Added `quickActionsRow` with four compact buttons at the top of each job card
- New styles: `quickActionsRow`, `quickActionBtn`, `quickActionBtnRed`, `quickActionBtnGreen`, `quickActionText`, `quickActionTextLight`

**Modal Cleanup**:
- Removed "Navigate", "Message ETA", and "Send account summary" from the job options modal (accessed via + button)
- These actions are now exclusively available via the quick action buttons
- Remaining modal options: View details, Edit Price, Defer, Add note below, Delete Job

---

### Added "Send account summary" Button to Runsheet Job Modal

**File**: `app/runsheet/[week].tsx`

**Feature**: Added a new "Send account summary" button to the job action modal in runsheets. This allows users to send a text message to clients with their complete account summary.

**Message Content**:
- Customer name greeting
- Current balance (outstanding/credit)
- Services provided count and total billed
- Payments received count and total paid
- Banking details (if balance is outstanding):
  - Account Name (business name)
  - Sort Code
  - Account Number
  - Amount Due
  - Customer Reference (account number with RWC prefix)
- Sign-off with provider name and business name

**Implementation**:
- Added `handleSendAccountSummary` async function that:
  - Fetches completed jobs and payments for the client from Firestore
  - Calculates balance from jobs, payments, and starting balance
  - Builds a formatted SMS message with all account details
  - Opens the native SMS app with the pre-filled message
- Added button to iOS ActionSheet (after "Message ETA")
- Added button to Android/Web Modal (after "Message ETA")
- Added `displayAccountNumber` import from `../../utils/account`
- Added `Payment` type import from `../../types/models`

**Note**: This feature is only available for regular jobs (not quotes) since quotes don't have an associated client account yet.

---

### Added Client Portal Dashboard

**New Feature**: Full client dashboard after successful login at `guvnor.app/{businessname}`

**Dashboard Sections**:
1. **Welcome Header** - Shows client name and account number
2. **Account Balance** - Displays current balance (credit or amount owing) with color coding
3. **Your Services** - Lists active service plans with:
   - Service type
   - Price
   - Frequency (Weekly, Fortnightly, 4 Weekly, etc.)
   - Next service date
4. **Your Details** - Shows contact info with Edit button to change:
   - Name (editable)
   - Mobile number (editable)
   - Email (read-only)
   - Address (read-only)
5. **Service History** - Shows last 10 items:
   - Completed jobs (in red as charges)
   - Payments (in green as credits)
   - Date and description for each
6. **Sign Out** - Returns to login screen

**Technical Implementation**:
- Fetches service plans from `servicePlans` collection (filtered by clientId, isActive)
- Fetches completed jobs from `jobs` collection (filtered by clientId, status=completed)
- Fetches payments from `payments` collection (filtered by clientId)
- Calculates balance: `totalPaid - totalBilled + startingBalance`
- Allows profile updates via Firestore `updateDoc`

**Firestore Rules Updated**:
- Added public read for `jobs`, `servicePlans`, `payments` collections
- Added public update for `clients` collection (for profile edits)

**Files Changed**: 
- `app/[businessName].tsx` - Dashboard UI and data fetching
- `firestore.rules` - Public access for portal data

---

### Implemented Multi-Step Client Portal Login

**New Feature**: Two-step client authentication for business customer portals

**How It Works**:
1. **Step 1 - Account Lookup**: Client enters their account number (with "RWC" pre-filled as prefix)
   - Queries the business owner's clients collection to find matching account
   - Shows "Account not found" error if no match
   - If found, shows client name and moves to step 2

2. **Step 2 - Phone Verification**: Client enters last 4 digits of their phone number
   - Compares against the `mobileNumber` stored in their client record
   - Shows error if phone doesn't match
   - On success, displays "Successfully Logged In" message

**UI Features**:
- Step indicator showing progress (dots connected by line)
- Pre-filled "RWC" prefix in account number field
- Green confirmation box showing found client name/account
- Back button to return to step 1
- Error messages in styled red containers
- Success state with checkmark and welcome message

**File Changed**: `app/[businessName].tsx`

---

### Fixed Client Portal Route Redirect Issue

**Problem**: Navigating to `guvnor.app/tgmwindowcleaning` (or any business portal URL) was immediately redirecting to `/login` instead of showing the client portal page.

**Root Cause**: Race condition in `_layout.tsx` - the `usePathname()` hook from Expo Router may not return the correct pathname immediately on initial page load on web, causing the auth redirect logic to incorrectly identify business routes as unauthorized pages.

**Solution**:
1. Changed auth guard to use `window.location.pathname` directly on web instead of relying solely on Expo Router's `usePathname()`
2. Improved business route regex pattern to be more specific: `/^\/[a-zA-Z][a-zA-Z0-9]*$/`
3. Removed hardcoded business names from `unauthAllowed` array (now dynamically detected)
4. Fixed logged-in users being incorrectly redirected away from business portal routes

**File Changed**: `app/_layout.tsx`

---

### Added Client Portal System

**New Features Added**:

1. **Dynamic Business Route**: Created `/app/[businessName].tsx` for client portal access via URLs like `guvnor.app/TGMWindowCleaning`
2. **Business Name Lookup**: Implemented flexible business name matching that handles spaces and case variations (e.g., "TGMWindowCleaning" matches "TGM Window Cleaning")
3. **Owner vs Member Discrimination**: Added logic to ensure only business owners can have client portals, not team members
4. **Client Authentication UI**: Built login form for clients to enter account number (RWC...) and password

**Technical Implementation**:

#### 1. Dynamic Route Creation (`app/[businessName].tsx`)
- Uses Expo Router's dynamic routing with square brackets
- Extracts business name from URL and normalizes it for database lookup
- Validates that the business user is an owner, not a team member

#### 2. Business User Lookup Logic
- Queries Firestore users collection for business name matches
- Normalizes both URL and stored business names for flexible matching
- Prevents member users from having client portals

#### 3. Owner Discrimination
- Checks if `user.accountId !== user.uid` (member indicator)
- Verifies no member records exist in `accounts/{userId}/members/{userId}`
- Ensures only business owners can access client portal functionality

#### 4. Vercel Routing Updates
- Updated `vercel.json` to properly route business name URLs to the main app
- Maintains existing marketing page routing

**Security Considerations**:
- Only owner accounts can have client portals
- Client authentication logic ready for implementation (account number + password)
- Data isolation ensures clients only see their own business's data

#### 5. Authentication Guard Updates (`app/_layout.tsx`)
- Modified authentication logic to allow unauthenticated access to business portal routes
- Added explicit allowance for known business routes in `unauthAllowed` array
- Added business route detection using regex pattern `/^\/[^\/_][^\/]*$/` for future business routes
- Updated redirect logic to handle business routes appropriately for both logged-in and logged-out users

#### 6. Auto-Create Business Portals (`services/userService.ts`)
- Modified `updateUserProfile` to automatically create/update business portal documents
- When a user saves their business name in Settings, a `businessPortals/{normalizedName}` document is created
- This enables public lookup of business info for client portal pages
- If business name changes, old portal is deleted and new one is created
- No manual scripts needed - portals are created automatically!

#### 7. Firestore Rules (`firestore.rules`)
- Added public read access for `businessPortals` collection
- Only business owners can write to their own portal documents

**How Business Portals Work Now**:
1. User goes to Settings → Bank & Business Info
2. User saves their business name (e.g., "TGM Window Cleaning")
3. System automatically creates `businessPortals/tgmwindowcleaning` document
4. Clients can now access `guvnor.app/tgmwindowcleaning`

**For Existing Users**:
To enable the client portal, simply go to Settings → Bank & Business Info and click Save. This will create your portal document.

**Next Steps**:
- Implement client authentication against the business owner's client database
- Create client dashboard showing account balance, job history, and payments
- Add client self-service features (payment requests, booking, etc.)

---

## Previous Changes

### Fixed Critical Bugs in Accounts Screen (accounts.tsx)

**Problems Fixed**:

1. **Import Typo**: Line 1 had "thimport" instead of "import", causing all Ionicons references to fail and breaking the entire component
2. **Starting Balance Calculation Bug**: `Number(client.startingBalance) || 0` returned `NaN` when `startingBalance` was `undefined`, causing incorrect balance calculations
3. **Broken Add Payment Button**: The "Add Payment" button in the account details modal only closed the modal but didn't navigate to the add payment screen

**Root Causes**:
- Typo in import statement prevented proper module loading
- Unsafe type coercion with `Number(undefined)` returning `NaN`
- Missing `onAddPayment` prop in modal component interface

**Solutions**:

#### 1. Fixed Import Statement
**Location**: `app/accounts.tsx` line 1
- **Before**: `thimport { Ionicons } from '@expo/vector-icons';`
- **After**: `import { Ionicons } from '@expo/vector-icons';`
- **Impact**: Restored proper Ionicons import, fixing all icon references

#### 2. Fixed Starting Balance Type Safety
**Location**: `app/accounts.tsx` line 252
- **Before**: `const startingBalance = Number(client.startingBalance) || 0;`
- **After**: `const startingBalance = typeof client.startingBalance === 'number' ? client.startingBalance : 0;`
- **Impact**: Prevents `NaN` values in balance calculations when `startingBalance` is undefined

#### 3. Fixed Add Payment Button Functionality
**Location**: `app/accounts.tsx` - AccountDetailsModal component
- **Added**: `onAddPayment: (client: ClientWithBalance) => void` to `AccountDetailsModalProps` type
- **Updated**: Modal component to accept and use `onAddPayment` prop
- **Updated**: "Add Payment" button to call `onAddPayment(client!)` instead of just `onClose()`
- **Updated**: Modal instantiation to pass `handleAddPayment` as `onAddPayment` prop
- **Impact**: "Add Payment" button now properly navigates to add payment screen with client details pre-filled

**User-Facing Behavior**:
- Accounts screen now loads without TypeScript errors
- Balance calculations are accurate even for clients without starting balance
- Add Payment button in account details modal now works correctly
- No functional regressions in existing features

---

## December 3, 2025

### Fixed Job Completion Order Tracking for Collaborative Workflows

**Problem**: The job completion order tracking feature was broken when multiple users (owners and members) worked simultaneously from the same runsheet:

1. **Global completion sequencing**: Completion sequence numbers were assigned globally across all vehicles, causing conflicts when multiple vehicles completed jobs simultaneously
2. **Local-only swap proposals**: Out-of-order job completion suggestions were stored only in local React state, so member users' suggestions were never visible to owner accounts
3. **No real-time updates**: Users couldn't see each other's job completions in real-time, leading to stale data and decision-making based on outdated information

**Root Cause Analysis**:
- Completion sequences counted all jobs for the day globally instead of per-vehicle
- Swap proposals existed only in local component state, not persisted or shared
- No Firestore listeners for real-time job updates between collaborating users

**Solution**: Implemented three interconnected fixes for full collaborative workflow support:

#### 1. Per-Vehicle Completion Sequencing
**Location**: `app/runsheet/[week].tsx` - `handleComplete` function
- **Before**: Counted all completed jobs globally for the day
- **After**: Counts completed jobs only within the same vehicle block for the day
- **Impact**: Each vehicle now gets independent sequence numbers (→1, →2, →3...) regardless of other vehicles' progress

#### 2. Persistent Shared Swap Proposals
**Location**: `app/runsheet/[week].tsx`
- **New Firestore Structure**: `swapProposals/{accountId}_{weekStart}/proposals/{dayTitle}`
- **Real-time Sync**: Added Firestore `onSnapshot` listener to sync swap proposals across all user sessions
- **Cross-user Visibility**: Swap proposals created by member users are now visible to owner accounts and vice versa
- **Automatic Cleanup**: Swap proposals are deleted from Firestore after being applied or dismissed

#### 3. Real-time Job Updates
**Location**: `app/runsheet/[week].tsx` - main data loading useEffect
- **Added Firestore Listener**: Real-time subscription to job changes for the current week
- **Live Synchronization**: All users see job completions, status changes, and sequence updates immediately
- **Preserved Client Data**: Real-time updates merge with existing client relationship data to avoid breaking UI

### Technical Implementation Details:

#### Current Implementation Status:
- **Per-vehicle completion sequencing**: ✅ Implemented with error handling and fallbacks
- **Per-vehicle round order numbering**: ✅ Fixed - blue numbers now reset to 1 for each vehicle
- **Shared swap proposals**: 🔄 Temporarily reverted to local state (Firestore real-time listeners causing white screen)
- **Real-time job updates**: 🔄 Disabled to prevent crashes (can be re-enabled after stabilization)

#### Round Order Numbering Fix:
**Problem**: Blue numbers on the far left were continuing sequentially across vehicles instead of resetting per vehicle.

**Root Cause**: `dayJobPosition` was calculated globally across all jobs in the day, not per vehicle block.

**Solution**: Modified the calculation to filter jobs to only those within the same vehicle block before sorting and finding position.

**Code Change**: `app/runsheet/[week].tsx` lines ~1894-1930
- Moved vehicle boundary calculation to beginning of render logic
- Filter `vehicleJobs` to only jobs within the current vehicle block
- Sort and find position within vehicle-specific job list only
- Result: Each vehicle now shows 1, 2, 3... independently

#### White Screen Issue with Real-Time Listeners:
**Problem**: Enabling Firestore real-time listeners for swap proposals caused blank white screen.

**Root Cause**: Async operations in useEffect listeners interfering with component initialization and state updates.

**Current Status**: Real-time swap proposals temporarily disabled. Core per-vehicle logic works with local state swap proposals.

**Next Steps**: Real-time collaborative features will be implemented after core functionality is validated in testing.

#### Firestore Data Structure (Future):
```
swapProposals/
  {accountId}_{yyyy-MM-dd}/  // Week document
    proposals/
      {dayTitle}/            // Day document
        proposals: [{ jobId, swapWithJobId }]
        updatedAt: timestamp
        updatedBy: userId
```

### User-Facing Behavior:
- **Independent vehicle tracking**: Each vehicle's completion sequence is independent (Vehicle A: →1, →2, →3...; Vehicle B: →1, →2, →3...)
- **Independent round order numbering**: Blue position numbers reset to 1 for each vehicle
- **Local swap proposals**: Out-of-order suggestions work within single user session (collaborative sharing temporarily disabled)
- **Stable operation**: App loads without crashes, core functionality preserved

---

## November 26, 2025

### Job Deferral/Move Tracking - Service Plan Anchor as Source of Truth

**Problem**: When a user moved/deferred a job, the system stored the wrong original date, causing:
1. Moved jobs to show "moved from 06-Dec to 06-Dec" (same date)
2. Service plan anchor dates to become corrupted
3. Future job recurrence to be calculated from the wrong base date

**Root Cause**: The move handler was storing `job.scheduledTime` as the `originalScheduledTime`, which was already the moved-to date if the job had been moved before.

**Solution**: Service plan `startDate` is now the single source of truth. When moving a job, the system:
1. Fetches the service plan to get the canonical anchor date
2. Stores THAT as `originalScheduledTime` (not the corrupted current date)
3. Marks the job with `isDeferred: true`
4. Displays use the service plan anchor for move detection

### Changes Made:

#### 1. Data Model (`types/models.ts`)
- Added `originalScheduledTime?: string` field to the `Job` type
- This field stores the original date before a job was moved/deferred

#### 2. Defer/Move Logic (`app/runsheet/[week].tsx`)
- **Fixed critical bug**: Now fetches the service plan to get the canonical `startDate` BEFORE storing `originalScheduledTime`
- Updated `handleDeferToNextWeek()` to calculate and store the correct original date from service plan
- Updated `handleDeferDateChange()` to calculate and store the correct original date from service plan
- **Key change**: `originalScheduledTime` is now calculated from service plan anchor, NOT from `job.scheduledTime` (which could be corrupted)

#### 3. Job Generation Dedup (`services/jobService.ts`)
- Updated dedup logic in `createJobsForClient()` (both service plan and legacy paths)
- Updated dedup logic in `createJobsForWeek()`
- Updated dedup logic in `createJobsForServicePlan()`
- Updated dedup logic in `createJobsForAdditionalServices()`
- Now checks BOTH `scheduledTime` AND `originalScheduledTime` to prevent duplicate job creation when a job has been moved
- **Important**: Moving a job does NOT change the service plan's anchor date - recurrence continues from the original schedule

#### 4. Client Detail Page (`app/(tabs)/clients/[id].tsx`)
- Added `originalScheduledVisit` state to track the original date
- Updated `fetchNextScheduledVisit()` to also fetch `originalScheduledTime` from the next pending job
- Updated "Next Service" / "Next Scheduled Visit" display (both desktop and mobile layouts) to show:
  - `"06 December 2025 (moved from 15 December 2025)"` if job was moved
  - Normal date display if job was not moved
- **Service Schedule list**: Added orange "(moved from [date])" indicator for moved jobs

#### 5. Clients List Page (`app/clients.tsx`)
- Added `originalVisits` state to track original dates per client
- Updated `fetchNextVisits()` to also capture `originalScheduledTime` for each client's next job
- Updated renderItem to display:
  - `"6 Dec 2025 (moved from 15 Dec)"` format if job was moved
  - Normal date display if job was not moved

### User-Facing Behavior:
- When viewing the clients list or client detail page, if a job has been moved/deferred, users will see:
  - The ACTUAL scheduled date (when the job will occur)
  - Plus "(moved from [original date])" to show where it was originally scheduled
  - OR just "(moved)" for jobs moved before this tracking was added
- The Service Schedule list now highlights moved jobs with an orange indicator
- Job generation will no longer create duplicate jobs for the original date when a job has been moved
- **Recurrence is NOT affected**: Moving a job is an exception - the service plan anchor date (editable only in Manage Services) controls future job generation

### Final Fix - Fetching Service Plan Anchor on Move (Same Day):
- **Critical bug fixed**: Move handlers now FETCH the service plan before storing `originalScheduledTime`
- **Week-based rollover detection**: `isDeferred` flag is now ONLY set when moving jobs to a **different week**, not just a different day
- **Within-week moves**: Moving a job from Monday to Tuesday in the same week does NOT set `isDeferred` - no "moved" indicator shown
- **Cross-week moves**: Moving a job from one week to another sets `isDeferred: true` and stores the service plan anchor as `originalScheduledTime`
- **Service Details display**: Uses service plan's `startDate` directly - if job has `isDeferred: true` and plan has `startDate`, shows `"8th December 2025 (moved to 6th December 2025)"`
- **Service Schedule display**: Shows `"(Moved from 8th Dec 2025)"` using service plan anchor as the "from" date
- **Display uses plan anchor**: Even if `originalScheduledTime` is corrupted in existing data, display logic now references service plan `startDate` directly

### Key Architectural Principle:
**Manage Services screen is the single source of truth** - the "Next Service" date there controls:
1. Future job generation (recurrence pattern)
2. Move detection (what date jobs SHOULD be on)
3. Display of "moved from" indicators

**Rollover/Moved Definition**: Jobs are only considered "rolled over" or "moved" when moved to a **different week**, not when redistributed within the same week.

**To fix corrupted existing data**:
1. Jobs with wrong `originalScheduledTime`: Will be fixed next time they're moved cross-week (or delete and regenerate)
2. Service plans with wrong `startDate`: Manually correct in Manage Services → Regenerate Schedule
3. Future: All new cross-week moves will calculate the correct original date from the service plan

---

## November 2, 2025

### Added Active Clients Count Display with Info Modal
- **Location**: `app/clients.tsx`
- **Features**: 
  - Added "Active: X clients" count below the total clients count
  - Added blue info icon (ⓘ) next to the Active count
  - Tapping the icon opens an informational modal
- **Logic**: Counts only clients with valid future service dates (nextVisit >= now)
- **Excludes**: Clients with null, "N/A", or past nextVisit dates
- **Modal Content**: Explains that this shows clients who have future services scheduled

## November 2, 2025 (Earlier)

### Client Status Issue Investigation
- **Issue**: User suspected ex-clients were being included in the total client count
- **Root Cause**: The client filter in `app/clients.tsx` uses `client.status !== 'ex-client'` which includes:
  - Clients with `status = 'active'` ✅
  - Clients with `status = undefined` or `null` (legacy data) ⚠️
  - Clients with any other unexpected status value ⚠️

- **Problem**: Some clients may not have a status field (legacy data from before the field was introduced), causing them to be counted as active even if they should be ex-clients.

- **Created Diagnostic Tools**:
  1. `scripts/check-client-status.js` - Analyzes all clients and categorizes them by status
  2. `scripts/fix-client-status.js` - Interactive tool to fix clients with missing/invalid status

### How to Run the Diagnostic Scripts

**Note**: The scripts now have the Firebase configuration hardcoded from app.config.ts so they can connect directly.

1. **Check for problematic clients**:
```powershell
node scripts/check-client-status.js <your-email> <your-password>
```

2. **Fix clients with missing status**:
```powershell
node scripts/fix-client-status.js <your-email> <your-password>
```

Replace `<your-email>` and `<your-password>` with your actual Firebase login credentials.

### Recommendation
If the diagnostic script finds clients without a status field:
1. These are being counted in the "Total: X Clients" number
2. Run the fix script to set them to either "active" or "ex-client" 
3. Clients with round order numbers are likely active
4. Clients without round order numbers might be ex-clients that were archived before proper status tracking

## April 10, 2026

### Add Client form reliability + UX improvements
- **Location**: `app/add-client.tsx`
- **Fix: weekly interval getting reset (e.g. 4 -> 8 not sticking)**  
  - Root cause was repeated route-param hydration overriding user edits after typing.
  - Added signature-based guard so identical params are applied once and no longer re-applied on each render.
  - Switched the effect dependency from the whole `params` object to specific route keys.
- **Fix: first service date sometimes not applying**
  - Route-param date hydration now validates parsed dates before updating the web date state.
  - This prevents bad/empty route values from clobbering date selection state.
- **UX updates**
  - Simplified frequency selection to a single dropdown selector (`1`, `2`, `3`, `4`, `6`, `8`, `12`, `One-off`).
  - Updated label from `Starting Date` to `First Service Date`.
  - Replaced default save `Button` with styled `Pressable` for a clearer, more consistent submit action.

## April 22, 2026

### Client Portal: Split into 3-page flow (landing / login / quote)
- **Problem**: The single-page client portal (`app/[businessName].tsx`) crammed the login form and quote flow side-by-side. On mobile, the property-selection images were clipped (top/bottom cut off) because they were constrained to a 140px fixed-height card with `resizeMode="cover"`.
- **Solution**: Restructured into three dedicated pages within a nested route folder `app/[businessName]/`:
  1. **`index.tsx`** — Landing page with two large buttons: "Existing Customer" and "Get a Quote".
  2. **`login.tsx`** — Dedicated login flow (RWC number → last-4-digits verification → dashboard).
  3. **`quote.tsx`** — Dedicated quote request flow with full-width, aspect-ratio-based images (`resizeMode="contain"`) so property images display completely without clipping.
- **New shared files**:
  - `hooks/useBusinessPortal.ts` — Shared hook for business lookup logic, navigation helpers, and `isNarrowWeb` detection.
  - `styles/portalStyles.ts` — Shared navigation header, footer, and common portal styles.
  - `app/[businessName]/_layout.tsx` — Expo Router nested layout (renders `<Slot />`).
- **Root layout update** (`app/_layout.tsx`): Updated the `isBusinessRoute` regex from `^\/[a-zA-Z][a-zA-Z0-9]*$` to `^\/[a-zA-Z][a-zA-Z0-9]*(\/.*)?$` so sub-routes like `/businessname/login` and `/businessname/quote` are also recognised as business portal paths and not redirected to `/login`.
- **Image fix detail**: Changed from `height: 140, resizeMode: 'cover'` to `aspectRatio: 16/10, resizeMode: 'contain'` for property images, giving each image its natural proportions.
- **Deleted**: `app/[businessName].tsx` (replaced by the three new files above).

## April 29, 2026

### Admin User Browser (Developer-only)
- **New feature**: Added a "Browse Users" screen accessible from the Developer section in Settings (exempt tier only).
- **New Cloud Functions** (`functions/index.js`):
  - `listAllUsers` — Returns all users with name, email, creation date, client count, subscription tier, and business name. Guarded by `DEVELOPER_UID` check.
  - `getUserDetail` — Accepts a `userId` and returns their full profile, client list, and job summary (total/completed/pending counts + recent jobs). Same developer guard.
  - Shared `assertDeveloper()` helper enforces that only the developer UID can call these functions.
- **New service** (`services/adminService.ts`): Client-side wrapper with typed interfaces for calling the two new Cloud Functions.
- **New screens**:
  - `app/admin/users.tsx` — Lists all app users in sortable cards (by date joined or client count, ascending/descending). Shows name, email, business name, subscription tier badge, client count, and join date. Each row navigates to the user detail screen.
  - `app/admin/[userId].tsx` — User detail screen with profile card (avatar, name, email, business, tier, stats), plus tabbed view: **Clients** tab (active/ex-client split with status badges) and **Runsheet** tab (job summary stats + recent jobs list with service type, date, price, and status).
- **Settings update** (`app/(tabs)/settings.tsx`): Added "Browse Users" button to the Developer section.

## Previous Changes
[Previous changes would be listed here]