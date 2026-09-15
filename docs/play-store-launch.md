# Google Play launch — Guvnor Android

Last updated: 15 September 2026

This is the working runbook for getting `com.guvnor.roundmanagerapp` onto Google Play.
The production App Bundle is built from `eas.json` profile `production` (AAB, not APK).

**Privacy policy (required):** https://guvnor.app/privacy-policy  
**Support email:** support@guvnor.app  
**Website:** https://guvnor.app  
**Package name (cannot change after first upload):** `com.guvnor.roundmanagerapp`

---

## What is already done from this side

- Branded icon + splash on version **1.0.2** / versionCode **3**.
- EAS Android **upload keystore** already exists on Expo (`Build Credentials 56eqvxcY1i`). Keep it. Losing it means you cannot update the Play listing.
- Production AAB build kicked off 15 Sep 2026 (`eas build -p android --profile production`). When it finishes, download it from the Expo build page (not the APK you side-loaded).
- Store assets in `assets/play-store/`:
  - `feature-graphic.png` — required 1024×500 banner
  - `phone-01-dashboard.png` — phone screenshot (home)
  - `phone-02-splash.png` — phone screenshot (launch)
- You still need **at least two more phone screenshots of real app screens** (runsheet + client list are the ones that sell the app). Take them on your phone from the 1.0.2 APK, **using a demo account with fake clients** — do not upload real customer names or addresses.

Premium purchases stay on the **website** (Stripe). The Android app does not take card payments, which is what we want for a first Play review. Do not add in-app Stripe checkout on Android without Play Billing.

---

## 1. You: Play Console account (do this first)

Open https://play.google.com/console

**Register as an Organisation, not a personal account**, if you can.

You have a real trading business. Organisation accounts skip the “12 testers for 14 days” gate that Google puts on new *personal* accounts created after 13 Nov 2023. Organisation signup needs:

- Legal business name and address matching Companies House
- A [D-U-N-S number](https://www.dnb.co.uk/duns-number.html) (apply if you do not have one — this can take a few days)
- Official email on your domain (e.g. `support@guvnor.app`)
- One-time Play fee (USD $25)

If you already clicked through as a **personal** account, you cannot convert it. You would either complete the 12-tester / 14-day closed test, or start a new Organisation account (Google’s preferred path for a business).

Identity verification (photo ID / business docs) is mandatory before anything goes live. Start it immediately — it often takes longer than the AAB build.

---

## 2. You: Create the app

In Play Console → **All apps → Create app**:

| Field | Value |
|---|---|
| App name | Guvnor |
| Default language | English (United Kingdom) |
| App or game | App |
| Free or paid | Free |
| Declarations | Accept Play policies + US export laws |

Then open the new app. Work top-to-bottom on **Dashboard** / **Finish setting up your app**. The checklist items below are the ones that actually block a release.

---

## 3. You: Store listing (copy-paste)

**Grow users → Store presence → Main store listing**

### App name (max 30)
```
Guvnor
```

### Short description (max 80)
```
Round management for window and bin cleaners. Clients, runsheets and payments.
```

### Full description (max 4000)
```
Guvnor is round management software for window cleaners and bin cleaners.

Plan the week, run the round, and keep clients, quotes and payments in one place — on your phone in the field or on the web at guvnor.app.

WHAT YOU CAN DO
• Runsheets for the week, with job status, notes and navigation
• Client list, round order and visit frequencies
• Quotes with photos
• Payment tracking, including GoCardless direct debit for UK businesses
• Rota and workload for you and your team
• Free plan for up to 20 clients; optional Premium for unlimited clients and team members

FIELD USE
Sign in once. The app keeps the last runsheet you opened on the device so you can still see jobs and mark them complete when signal is poor. Changes sync to your account when you are back online. Actions that need the internet (for example raising a direct debit on day-complete) wait until you have a connection.

Guvnor is built for UK cleaning rounds. Create a free account at guvnor.app — no credit card required.
```

### Graphics

| Asset | File | Notes |
|---|---|---|
| App icon | from the AAB | 512×512 is generated from `assets/images/icon.png` |
| Feature graphic | `assets/play-store/feature-graphic.png` | Required. 1024×500 |
| Phone screenshots | `phone-01-dashboard.png`, `phone-02-splash.png`, plus 2+ you take | Minimum 2. JPEG or 24-bit PNG. Add a runsheet + clients shot from a **demo** account |
| 7" / 10" tablet | optional | Skip unless you want tablet listing |

### Contact

- **Email:** support@guvnor.app
- **Phone:** your business number (optional, shown on the listing)
- **Website:** https://guvnor.app
- **Privacy policy:** https://guvnor.app/privacy-policy  *(this field is also on App content → Privacy policy)*

### Category
- App category: **Business**
- Tags if offered: scheduling, productivity, field service

---

## 4. You: App content questionnaire

Work through **Monitor and improve → Policy and programmes → App content** (wording varies slightly).

### Privacy policy
https://guvnor.app/privacy-policy

### App access (required — the app is login-walled)
Choose **All or some functionality is restricted**.

Add a **demo reviewer account**. Create a throwaway Guvnor login (not your live round), put 3–4 fake clients on it, and paste email + password into Play Console. Google will reject the app if reviewers cannot sign in.

Do not put that password in git or in this file.

### Ads
No.

### Content ratings
Start the IARC questionnaire.

Typical answers for Guvnor:

- It’s a **business / productivity** app, not a game
- No violence, sexual content, drugs, or user-to-user public chat
- Not a news / COVID / government app
- Target age: **16+** (matches the privacy policy)
- Users do not share content publicly; client records are private to the account

### Target audience
Age **18 and over** is the safest match for a trade business tool. Do not tick “Children”.

### News / COVID / data safety / government
No / no / complete Data safety (next section) / no.

### Financial features
This is **not** a banking or crypto app. Users can record **their customers’** payments and connect **their own** GoCardless account. Tick the closest “the app provides financial services / payment processing for the user’s business” option if shown; otherwise “no financial features” plus Data safety covering payment records.

### Health / VPN
No.

---

## 5. You: Data safety form

**App content → Data safety**

Declare what the **Android app** collects. Be consistent with the privacy policy.

**Collected (not sold, used for app functionality):**

| Type | Example | Shared? |
|---|---|---|
| Email address | account login | No (stored in Firebase) |
| Name | account / team member | No |
| Phone number | if the user enters it on their profile / clients | No |
| User-generated content | clients, jobs, quotes, notes, photos attached to quotes | No |
| Photos | quote / job attachments | No |
| App activity | basic usage of screens | No |
| Device IDs | Firebase / crash diagnostics | No |
| Approximate location | IP-based only, not GPS | No |

**Not collected on Android:** precise GPS, contacts, calendar, financial **card numbers** (Premium is taken on the website via Stripe).

Other answers:

- Encrypted in transit: **Yes**
- Users can request deletion: **Yes** (privacy@guvnor.app, 30 days — already in the policy)
- Independent security review: **No**
- Data sold: **No**
- Data used for advertising / tracking: **No**
- Service providers: Google Firebase (auth + database + storage). Optional: GoCardless when the user connects it; Stripe when they upgrade on the web.

---

## 6. You: Upload the App Bundle

Play will **not** accept the `.apk` you installed for testing. It needs the `.aab`.

1. Wait for the production EAS build (profile `production`, not `release-apk`).
2. Download the AAB from the Expo build page.
3. Play Console → **Test and release → Testing → Internal testing** → Create a new release.
4. Upload the AAB. First upload enrols **Play App Signing** — accept Google’s signing key. Our EAS keystore is the *upload* key; Google re-signs what users install. Do not generate a new keystore later.
5. Release name: `1.0.2 (3)`
6. Release notes:
```
First Play release of Guvnor: runsheets, clients, quotes and payments.
```
7. Roll out to **internal testing** first (add your Gmail). Install from Play, confirm login + runsheet.
8. Then promote the same release to **Closed testing**. If you are on a personal account, you need **12 opted-in testers continuously for 14 days** before you can apply for production. Organisation accounts can usually go to Production once the store listing and questionnaires are complete and the review passes.

Countries: start with **United Kingdom**. Add more later.

---

## 7. You: Production

When the dashboard lets you:

1. **Test and release → Production** → Create release from the tested AAB (do not upload a different binary).
2. Roll out **100%** to UK (or staged 20% if you want a slower launch).
3. Submit for review. First review is often 1–3 days, sometimes a week.

After it is live, later native uploads can be:

```powershell
npx eas build -p android --profile production
npx eas submit -p android --profile production
```

`eas submit` needs a Google Cloud **service account** JSON with Play Console API access. EAS walks you through this the first time (`npx eas credentials` / the submit prompt). Store that JSON outside the repo.

---

## 8. Reviewer notes (paste into Play Console if asked)

```
Guvnor is a login-walled business app for window and bin cleaning rounds.

Use the demo account provided under App access. After sign-in you should see the home dashboard. Open Runsheet for the current week and Client List.

The app is free to download. Optional Premium (unlimited clients / team) is purchased on the website guvnor.app via Stripe, not as a Google Play in-app product.

No ads. No user-to-user public social features.
```

---

## After it ships

- JS/TS fixes still go out on `git push` to master via EAS Update (same as now). They apply to Play installs of version **1.0.2**.
- Icon, splash, permissions, native modules, or `expo.version` bumps still need a new AAB + Play release and a `versionCode` increment.
- When Play App Signing SHA-1 is available (Release → App integrity), add it to the Firebase Android app if you ever turn on Google Sign-In. Email/password auth does not need it.
