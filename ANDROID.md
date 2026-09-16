# Shipping Mandate to the Play Store — from a phone only

Everything here can be done from an Android phone: the GitHub web UI and the
Play Console both work in a mobile browser, and the build itself runs on
GitHub's servers, not on your device.

**Read §4 before you write any more code.** The tester requirement is a 14-day
clock that you want running *in parallel* with development, not after it.

---

## 1. What has to exist first (Phase 6)

The build workflow (`.github/workflows/android-release.yml`) is already in the
repo, but it deliberately fails fast until Capacitor is set up. It needs:

1. **`package.json`** with `@capacitor/core`, `@capacitor/cli` and
   `@capacitor/android`, plus a committed `package-lock.json`.
2. **`capacitor.config.json`** with:
   ```json
   {
     "appId": "com.yourname.mandate",
     "appName": "Mandate",
     "webDir": "."
   }
   ```
   `webDir` is `"."` because there is no build step — `index.html` sits at the
   repo root. The `appId` is permanent once published; pick it carefully.
3. **A committed `android/` folder**, generated once by `npx cap add android`.
   Capacitor's native project is meant to live in version control.
4. **Landscape lock.** The game is landscape-only, so add
   `android:screenOrientation="sensorLandscape"` to the `<activity>` in
   `android/app/src/main/AndroidManifest.xml`. Without it the app will rotate
   into the browser's portrait gate. `sensorLandscape` (rather than
   `landscape`) lets the player hold the phone either way round.

That is genuinely all — the JDK, the Android SDK, Gradle and signing are all
handled inside the workflow.

---

## 2. The keystore

An Android app is signed with a key. Android identifies your app by that
signature: **an update must be signed with the same key as the original, or the
Play Store will reject it.**

> ### ⚠️ If you lose the keystore, you can never update the app again.
> Not "it's difficult" — the app becomes permanently frozen and you would have
> to publish a brand new listing under a new package name, losing every install
> and review.
>
> Back it up in **at least two places** that are not this repo and not only
> your phone (a password manager entry and an encrypted cloud file, say). Back
> up the passwords with it — a keystore you can't unlock is a lost keystore.
>
> **Mitigation worth taking:** enrol in **Play App Signing** when you first
> upload (it is the default for new apps). Google then holds the real *app
> signing key* and your keystore is only an *upload key*. If you lose an upload
> key, Google support can reset it and you stay in business. It does not make
> the keystore disposable — losing it is still a support ticket and a delay —
> but it turns a fatal mistake into a recoverable one.

### Generating one from a phone

You need `keytool`, which ships with the JDK. Two workable routes:

**Option A — Termux (recommended).** Install Termux from F-Droid, then:

```bash
pkg install openjdk-21
keytool -genkeypair -v \
  -keystore release.jks \
  -alias mandate \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storetype PKCS12
```

It will ask for a keystore password, then some identity details (name,
organisation, country) — these are baked into the certificate but are not
shown to users. **Write the password and the alias (`mandate`) down now.**

Then base64-encode it into a single line of text, because GitHub Secrets hold
text, not files:

```bash
base64 -w 0 release.jks > release.jks.base64
```

Open `release.jks.base64` in a text editor and copy the whole thing. It will be
a few thousand characters on one line — that is correct.

**Option B — a throwaway GitHub Actions run.** If you can't install Termux, you
can run the same `keytool` command in a temporary workflow and upload
`release.jks.base64` as an artifact, then download it and delete both the
workflow and the artifact. It works, but be aware the key material passes
through a build artifact, so delete the run afterwards and never leave that
workflow in the repo.

Whichever route you take: **`.gitignore` already blocks `*.jks`, `*.keystore`
and `*.aab` — do not override it.** A keystore committed to a public repo is a
compromised keystore.

---

## 3. GitHub Secrets

**Settings → Secrets and variables → Actions → New repository secret.** Add all
four, with exactly these names:

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the entire contents of `release.jks.base64` (one long line) |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose |
| `ANDROID_KEY_ALIAS` | the alias — `mandate` in the command above |
| `ANDROID_KEY_PASSWORD` | the key password (often the same as the keystore password) |

Secrets are write-only once saved: GitHub will never show them back to you, and
they are masked in build logs. That is another reason to keep your own backup.

### Running the build

1. Repo → **Actions** tab
2. **Build signed Android bundle** in the left-hand list
3. **Run workflow** → set the version fields → **Run workflow**
   - **Version name** is what humans see (`0.1.0`).
   - **Version code** is a whole number that **must increase with every single
     upload**. Play rejects a re-used version code. Bump it every time, no
     exceptions.
4. Wait a few minutes, then open the finished run and download the
   **`mandate-release-aab-…`** artifact from the summary page. It downloads as a
   `.zip` containing the `.aab` — any phone file manager can extract it.
5. Upload the `.aab` in the Play Console.

> Note: you cannot install a `.aab` on your phone directly to test it — it is a
> publishing format, not an install format. Test the game in the browser via
> GitHub Pages, and test the packaged app through a Play Console internal
> testing track (or build a debug `.apk` if you add that job later).

---

## 4. Play Store requirements to plan for

These are policy requirements, not technical ones — they gate release
regardless of how good the build is.

### Registration
- **$25 one-time fee** for a Google Play developer account. Pay it once, per
  account, for life.
- Identity verification is required and can take a few days. Do it early.

### Format
- **New apps must ship as `.aab` (Android App Bundle), not `.apk`.** That is
  what this workflow produces.

### API level
- New apps and updates must **target Android API 36 (Android 16)** as of
  **31 August 2026**. Capacitor's Android project sets `targetSdkVersion` in
  `android/variables.gradle` — check it before the first upload and after every
  Capacitor upgrade.

### 🔴 The 12-tester, 14-day closed test — START NOW
- **Personal developer accounts created after 13 November 2023** must run a
  **closed test with at least 12 testers opted in continuously for 14 days**
  before they can even *apply* for production access.
- **Testers must actually install and use the app.** Twelve names on a list
  that never open it does not satisfy the requirement.
- **Internal testing does not count.** It must be a *closed* test track.
- If a tester opts out and numbers drop below 12, the clock can reset.
- After the 14 days you *apply* for production access, and that application is
  reviewed — it is not automatic, and it takes additional days.

> **Recruit the 12 testers during Phase 1–3, not at the end.** Friends, family,
> a Discord, a subreddit — you need twelve Google accounts willing to install a
> half-finished strategy game and leave it installed for two weeks. Realistic
> lead time from "I'll ask around" to "12 people opted in" is weeks, and it
> costs nothing to start while the game is still rough. It is the single most
> likely thing to delay your launch.

### Pre-launch report
- Google runs the app on real devices automatically and produces a **pre-launch
  report**. **Crashes or ANRs can block production access.**
- ANR = "Application Not Responding" — the main thread blocked too long. This
  game's fixed-timestep loop caps catch-up ticks specifically to avoid long
  frames, but re-check after any change to `src/loop.js`.
- The crawler taps around randomly, so make sure nothing crashes when panels are
  opened in odd orders or the app is rotated — including the landscape lock
  above behaving on a tablet.

### Also required before production
- Store listing: title, short and full description, screenshots (phone
  screenshots of the game itself are fine), a 512×512 icon and a 1024×500
  feature graphic.
- A **privacy policy URL** — required even if you collect nothing. A page in
  this repo published via GitHub Pages is acceptable.
- **Data safety form** — for this game the honest answer is "no data collected,
  no data shared"; saves are local `localStorage` only.
- Content rating questionnaire.
- Target audience declaration.

---

## 5. Realistic order of operations

1. **Now (Phase 1–2):** create the Play developer account, pay the $25, start
   identity verification, start recruiting testers.
2. **Phase 3–4:** keep building. Check in with your tester list.
3. **Phase 6:** add Capacitor, generate the keystore, add the secrets, run the
   workflow, confirm you get a signed `.aab`.
4. Upload to the **closed testing** track, get your 12 testers opted in and
   installed, and start the 14-day clock.
5. During those 14 days: fix whatever the pre-launch report finds, finish the
   store listing, write the privacy policy.
6. Apply for production access. Wait for review.
7. Release.
