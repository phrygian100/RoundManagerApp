# Packaging Guvnor for the App Store & Google Play

Last updated: 14 September 2026

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

The project currently only has a **web** Firebase app registered. In the
[Firebase console](https://console.firebase.google.com/project/roundmanagerapp/settings/general):

1. **Add app → Android**, package name `com.guvnor.roundmanagerapp`.
   Download `google-services.json` into the repo root.
2. **Add app → iOS**, bundle ID `com.guvnor.roundmanagerapp`.
   Download `GoogleService-Info.plist` into the repo root.
3. Commit both files (they contain public client config, not secrets —
   security is enforced by Firestore rules).

`app.json` already points at both files. **EAS builds will fail until these two
files exist.**

### 2. Store accounts

- **Google Play Console** — one-time $25 registration at
  https://play.google.com/console. Note: new *personal* accounts must run a
  closed test with 12+ testers for 14 days before production release;
  registering as a business (you have a real trading business) avoids this.
- **Apple Developer Program** — $99/year at https://developer.apple.com.
  EAS builds iOS in the cloud, so no Mac is needed.

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

- **Google Play**: the *first* upload must be manual — create the app in Play
  Console, then upload the AAB under *Testing → Internal testing*. After that,
  `npx eas submit -p android` can automate uploads (needs a Google service
  account key, which EAS walks you through).
- **App Store**: `npx eas submit -p ios` uploads to App Store Connect /
  TestFlight directly.

Store listings need: screenshots (phone + tablet for Play), a privacy policy
URL (use the one on guvnor.app), the Play data-safety form and Apple privacy
labels (data collected: email, name, customer records; not shared with third
parties; no tracking).

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
