# Packaging Guvnor for the App Store & Google Play

Last updated: 24 September 2026

## How updates ship once the apps are live

- **JS/TS changes (screens, logic — the everyday case)** go **over the air**:
  the GitHub Action `.github/workflows/eas-update.yml` runs `eas update` on
  every push to master (it skips pushes that only touch `web/`, `functions/`,
  `scripts/` or docs). Phones pick the new bundle up on next app launch. No
  store review, no cost. One git push updates web (Vercel) and the native apps
  (EAS Update) together. Requires the `EXPO_TOKEN` GitHub secret (see tasks).
- **Native changes** (adding/upgrading a package containing native code,
  Expo SDK upgrades, `app.json` native config like icons/permissions/plugins)
  need a new store build: bump `expo.version` (plus `android.versionCode` and
  `ios.buildNumber`), run `eas build` for both platforms and `eas submit`.
  Store review applies (Google: hours; Apple: usually < 48h; no fee).
- **The guard rail**: OTA updates only apply to binaries with the same
  `expo.version` (runtime version policy `appVersion`). If you add a native
  module and forget a store build, existing installs simply won't take that
  update — they won't crash. **Rule of thumb: touching package.json with
  anything native ⇒ bump `expo.version` ⇒ store build.**

## What's in place

The Expo app now builds as a real native app on both platforms, with **on-device
Firestore persistence** on iOS/Android:

- **Native builds use React Native Firebase** (the native Firebase SDK). A
  platform-conditional alias in `metro.config.js` maps `firebase/app`,
  `firebase/auth`, `firebase/firestore`, `firebase/functions` and
  `firebase/storage` to their `@react-native-firebase/*` equivalents on
  iOS/Android only. No service code changed — the modular APIs match.
- **Web is untouched**: it resolves `core/firebase.web.ts` and the plain
  `firebase` JS SDK exactly as before (with its existing IndexedDB cache).
- **Offline behaviour on the native apps**: Firestore disk persistence is on by
  default. Anything viewed while online (runsheets, clients, payments) stays
  readable with no signal; writes (completing jobs, moving jobs, notes) are
  queued on-device and sync automatically when connectivity returns. Auth
  sessions persist natively, so the app opens straight into the account while
  offline.
- What still needs a connection: anything that goes through Cloud Functions —
  GoCardless payment creation on Day Complete, broadcast SMS, chase emails,
  team invites. Completing the day offline still records job completions; run
  the Day Complete step itself when you have signal so direct debits raise.

## One-time setup you must do (account-level, cannot be scripted)

### 1. Firebase native app registrations

Firebase project `roundmanagerapp` now has Android, **iOS**, and web apps:

1. **Android** `com.guvnor.roundmanagerapp` — `google-services.json` in the repo root.
2. **iOS** nickname Guvnor iOS, bundle `com.guvnor.roundmanagerapp`, app ID
   `1:1049000869926:ios:261fc0bf6627b7502526e7` — `GoogleService-Info.plist`
   in the repo root (23 Sept 2026). Commit it with the next iOS-related commit
   (public client config, not a secret).
3. APNs Authentication Key **KHU9YYJFV9** (team **93K9P427U5**, Sandbox &
   Production) is uploaded to Firebase Cloud Messaging for both development
   and production. The `.p8` lives at `.cursor/AuthKey_KHU9YYJFV9.p8`
   (`*.p8` is gitignored). Do not commit or paste the key.

`app.json` already points at both Google service files.

### 2. Store accounts

- **Google Play Console** — one-time $25 registration at
  https://play.google.com/console. Note: new *personal* accounts must run a
  closed test with 12+ testers for 14 days before production release;
  registering as a business (you have a real trading business) avoids this.
- **Apple Developer Program** — $99/year at https://developer.apple.com.
  EAS builds iOS in the cloud, so no Mac is needed.
  - **Status (23 Sept 2026 20:51): membership paid.** Apple order
    **W1404492568** — Apple Developer Program, one year, £79.
    Confirmation emailed to travis_gm@live.co.uk. Membership is live:
    TGM Window Cleaning Limited, Team ID **93K9P427U5**. App ID
    `com.guvnor.roundmanagerapp` (description Guvnor, Push Notifications
    on) is registered. App Store Connect app **Guvnor** exists
    (SKU `GUVNOR-IOS`, Apple ID **6815394049**, English UK, iOS 1.0
    Prepare for Submission). 24 Sept: listing copy, URLs, contact,
    Business + Productivity, 3 iPhone 6.5" screenshots, age rating
    **4+**, published App Privacy labels (policy
    https://guvnor.app/privacy-policy), reviewer demo login filled.
    EU DSA trader status **Active** (24 Sept 2026): address on file,
    phone +44 7814 804759, email `admin@guvnor.app`.     First iOS EAS build `62ab967e` errored in Prepare credentials
    because the signing files were gitignored. `.easignore` now
    lets the p12, profile, and credentials.json upload. Rebuild
    `4b70620f` (1.0.3 / build 4) was rejected with ITMS-90725.
    `ios-store` now builds on Xcode 26.2. Build 5 (`adfa3e15`)
    is uploaded and version 1.0.3 is Waiting for Review.
    Company name: TGM Window Cleaning.

## Building

```powershell
# Android, installable APK for field testing (fastest feedback loop)
npx eas build -p android --profile release-apk

# Android, production AAB for Play Store
npx eas build -p android --profile production

# iOS, production build for App Store / TestFlight
npx eas build -p ios --profile production
```

- EAS is already logged in as `guvnorapp` on this machine, and the project is
  linked (`fb9540c5-f865-437c-af65-3f7b33779b5a`).
- Android signing: EAS generates and stores the keystore on first build — accept
  the defaults.
- iOS signing: the first `eas build -p ios` asks you to sign in with your Apple
  Developer Apple ID and creates certificates/profiles for you.

## Submitting

- **Google Play (Android):** follow **[play-store-launch.md](./play-store-launch.md)**
  end-to-end. The first AAB upload is manual (Play Console → Internal testing).
  Register the Play developer account as an **Organisation** if you can, so you
  skip the 12-tester / 14-day gate on new personal accounts. After the first
  upload, `npx eas submit -p android` can automate later releases (needs a
  Google service-account key; EAS walks you through it).
- **App Store**: `npx eas submit -p ios` uploads to App Store Connect /
  TestFlight directly.

Store listings need: screenshots (phone + tablet for Play), a privacy policy
URL (https://guvnor.app/privacy-policy), the Play data-safety form and Apple
privacy labels (data collected: email, name, customer records; not shared with
third parties; no tracking). Play feature graphic and starter screenshots live
in `assets/play-store/`.

## Versioning each release

Bump in `app.json`: `expo.version` (user-facing), `android.versionCode`
(+1 integer) and `ios.buildNumber` (+1 string). Stores reject re-used numbers.

## Day-to-day native development

Expo Go can no longer run the native app (React Native Firebase contains
native modules). Build a development client once per platform:

```powershell
npx eas build -p android --profile development
```

install it on the phone, then `npx expo start --dev-client`. Web development
(`npm run web`) is unchanged.

## Field-testing the offline behaviour (checklist)

1. Sign in on the app with good connectivity; open this week's runsheet.
2. Enable airplane mode.
3. Kill and reopen the app — it should open signed-in with the runsheet readable.
4. Complete a couple of jobs, add a note, move a job.
5. Disable airplane mode, wait a minute, then check the web app: the changes
   should have synced.
