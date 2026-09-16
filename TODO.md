# Mandate — Build Plan

A phased checklist. Each phase should end with something playable on a phone.
Tick items off as they land, and note anything deferred in `DEVLOG.md`.

> Design context for every item here is in `DESIGN.md`.

---

## Phase 1 — Playable skeleton ✅ *(complete)*

- [x] App shell: fixed three-row CSS Grid at `100dvh` (top HUD / map / tab bar)
- [x] Mobile hardening: safe-area insets, no overscroll, no zoom, no page scroll
- [x] Design tokens: colour palette + spacing scale as CSS custom properties
- [x] `clamp()` type scale and 44px minimum touch targets
- [x] SVG placeholder map — 16 generated polygon regions, seamless edges
- [x] Map geometry in its own data file, fully decoupled from game logic
- [x] Regions are tappable (`pointerdown`, with press feedback)
- [x] Region fill colour reflects stability band
- [x] Region detail sheet: stats + action buttons generated from balance data
- [x] Working actions: Invest (development) and Public Works (stability)
- [x] Core state object, plain and serialisable
- [x] Fixed-timestep tick loop with capped catch-up
- [x] Treasury accumulating from regional output
- [x] Top HUD: resources, Mandate meter, in-game date, pause / 1× / 2×
- [x] Bottom tab bar with placeholder sheets for the Phase 3–4 systems
- [x] Version-tagged save/load in `localStorage` with autosave
- [x] Pauses and saves when the tab is backgrounded

---

## Phase 2 — The economy and the clock

- [ ] **Political Capital**: earned from national stability and governance;
      spent on tech, policies, emergency actions
- [ ] **Manpower**: derived from development/population; spent on garrisons,
      projects and appointee slots
- [ ] Ongoing **sinks** so Treasury can't just pile up (upkeep on developed
      regions, project maintenance)
- [ ] Region **stability drift**: neglected regions slide toward unrest,
      garrisoned/attended ones recover
      *(balance knobs `stabilityDriftPerDay` / `developmentDecayPerDay` already
      exist, currently 0)*
- [ ] Neighbour effects: unrest bleeds into adjacent regions (`neighbours` is
      already in the geometry data)
- [ ] Development decay without upkeep
- [ ] Unlock the **Garrison** action (costs Manpower and Mandate)
- [ ] Mandate decay driven by unstable regions, not just baseline
- [ ] **Game over** at Mandate 0: proper screen, not just the veil hook
- [ ] Balance the first full loop to roughly a 45–60 minute run
- [ ] Remove the "Phase 1 build" note from the region panel

---

## Phase 3 — Progression systems

- [ ] `data/tech.js`: four branches — Economy, Infrastructure, Governance,
      Security
- [ ] Tech costs Political Capital **plus research time** (a research queue)
- [ ] Tech tree UI in the Tech tab: prerequisites, progress, affordability
- [ ] At least three mid-tier nodes that **change how systems interact**
      (e.g. *Federal Devolution*: regions self-manage stability but generate
      less Treasury) — not flat percentage bonuses
- [ ] `data/traits.js` + `data/appointees.js`: trait definitions and the hiring
      pool
- [ ] Appointee hiring, recurring salary cost, and drawbacks
- [ ] Assignment to a region or a ministry, with **limited slots**
- [ ] Appointee effects actually applied in the simulation
- [ ] Policies tab: standing national decisions with ongoing costs

---

## Phase 4 — Runs, variety and closure

- [ ] `data/leaders.js`: 4–6 leaders, each with a starting buff, a handicap and
      ideally a unique mechanic — expressed as data-checked flags, never as
      code branching on a leader id
- [ ] Leader selection screen before a run starts
- [ ] `data/events.js`: random and triggered events with branching choices
- [ ] Event scheduler with weighting and cooldowns, so events respond to the
      state of the country rather than firing blind
- [ ] Events tab doubles as the run log
- [ ] Run summary and scoring at game over (win and lose conditions)
- [ ] Persist best scores per leader

---

## Phase 5 — Balance, polish, robustness

- [ ] Full balance pass against real playtests — log every change in
      `BALANCE.md`
- [ ] Headless balance harness: run N ticks in Node and dump the curves
      *(the sim has no DOM dependencies, so this is straightforward)*
- [ ] Verify a run lands in the 45–60 minute window
- [ ] Save/load hardening: corrupt-save handling, a real migration step, manual
      save/restart controls
- [ ] Accessibility pass: contrast, labels, reduced motion
- [ ] Sound/haptics (optional — `navigator.vibrate` on key actions)
- [ ] Test on a small phone (360px) and a large one; check notch/gesture-bar
      insets on a real device
- [ ] Replace placeholder region names and the map, if a real one is wanted

---

## Phase 6 — Android release

*Full walkthrough in `ANDROID.md`. The release workflow already exists at
`.github/workflows/android-release.yml` and documents its own prerequisites.*

- [ ] `package.json` with `@capacitor/core`, `@capacitor/cli`,
      `@capacitor/android` (+ committed lockfile)
- [ ] `capacitor.config.json` — `webDir: "."`, an `appId` like
      `com.yourname.mandate`
- [ ] `npx cap add android`, commit the generated `android/` folder
- [ ] App icons and splash screen
- [ ] Target **API 36 (Android 16)** — required for new apps and updates from
      **31 August 2026**
- [ ] Generate a keystore, back it up in **two** places, base64 it into GitHub
      Secrets *(lose it and the app can never be updated)*
- [ ] Add the four secrets: `ANDROID_KEYSTORE_BASE64`,
      `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- [ ] Run the workflow, download the `.aab`, confirm it installs
- [ ] Play Console: $25 registration, store listing, privacy policy, content
      rating, data-safety form
- [ ] **Recruit 12 testers — start this in Phase 1, not here.** Personal
      accounts created after 13 Nov 2023 need 12 testers opted in
      *continuously for 14 days* before they can apply for production access.
- [ ] Closed test running, testers actually installing (internal testers do not
      count)
- [ ] Clean pre-launch report — crashes or ANRs can block production access
- [ ] Apply for production access, then release
