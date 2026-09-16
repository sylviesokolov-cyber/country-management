# Mandate — Build Plan

A phased checklist. Each phase should end with something playable on a phone.
Tick items off as they land, and note anything deferred in `DEVLOG.md`.

> Design context for every item here is in `DESIGN.md`.

---

## Phase 1 — Playable skeleton ✅ *(complete)*

- [x] **Landscape** app shell: full-bleed map with the HUD floating over it
- [x] Click-through HUD layer so the map stays tappable underneath it
- [x] Portrait gate asking the player to rotate
- [x] Mobile hardening: safe-area insets on all four edges (the landscape notch
      is on a side edge), no overscroll, no zoom, no page scroll
- [x] Design tokens: colour palette + spacing scale as CSS custom properties
- [x] `clamp()` type scale and 44px minimum touch targets
- [x] SVG placeholder map — 16 generated polygon regions in a landscape
      viewBox, seamless edges, country-shaped silhouette
- [x] Map geometry in its own data file, fully decoupled from game logic
- [x] Regions are tappable (`pointerdown`, with press feedback)
- [x] Region fill colour reflects stability band
- [x] Region detail panel sliding in from the right; the HUD insets and the map
      shrinks so nothing important is ever covered
- [x] Region stats + action buttons generated from balance data
- [x] Working actions: Invest (development) and Public Works (stability)
- [x] Core state object, plain and serialisable
- [x] Fixed-timestep tick loop with capped catch-up
- [x] Treasury accumulating from regional output
- [x] HUD: resource chips grouped in one card (never floats disconnected
      pieces over the map even if it wraps on a short screen), vertical
      Mandate gauge, in-game date, pause / 1× / 2×
- [x] Fullscreen toggle (Fullscreen API) + web app manifest, so "Add to Home
      Screen" launches with no browser chrome at all
- [x] Full-screen management overlay with tabs (placeholders for Phase 3-4)
- [x] Working region list, sorted worst-first, tap to jump to a region
- [x] Version-tagged save/load in `localStorage` with autosave
- [x] Pauses and saves when the tab is backgrounded

---

## Phase 2 — The economy and the clock ✅ *(complete)*

- [x] **Political Capital**: earned from national stability above a pivot,
      capped so goodwill can't be banked; spends on Emergency Relief today,
      on tech and policies from Phase 3
- [x] **Manpower**: recruited from development × stability, capped by national
      development; spent raising garrisons
- [x] Ongoing **sinks** so Treasury can't just pile up: per-day upkeep on every
      point of development, plus garrison upkeep
- [x] **Austerity**: an upkeep bill the Treasury can't cover decays development
      and stability in proportion to the unpaid share — the "development decay
      without upkeep" rule, and a real death spiral
- [x] Region **stability drift** toward a **natural level** set by development,
      garrison, neighbours and austerity
      *(this replaced the `stabilityDriftPerDay` / `developmentSupportPerPoint`
      knobs the plan assumed — see BALANCE.md for why a flat daily slide made
      "stabilise once, then idle" the winning strategy)*
- [x] Neighbour effects: each neighbour in unrest lowers a region's natural
      level, so a crisis eats outward across the map
- [x] Unlock the **Garrison** action (Treasury + Manpower + Mandate to raise,
      Treasury every day to keep) and **Withdraw Troops** to stand it down
- [x] New **Emergency Relief** action, so Political Capital has a sink before
      the tech tree exists
- [x] Mandate decay driven by unstable regions, not just baseline — and
      *slowed* by a genuinely well-governed country, never refilled
- [x] **Game over** at Mandate 0: a real end-of-term summary with a restart
- [x] Balance the first full loop to roughly a 45–60 minute run
- [x] Remove the "Phase 1" note from the region panel

---

## Phase 3 — Progression systems ✅ *(complete)*

- [x] `data/tech.js`: four branches — Economy, Infrastructure, Governance,
      Security. Twenty nodes, ~4,900 research days against a ~3,300-day term,
      so the tree is a direction rather than a checklist
- [x] Tech costs Political Capital **plus research time** (a research queue).
      Political Capital is charged on **queueing**, so a full queue is standing
      already spent; cancelling refunds it and drops anything orphaned behind it
- [x] Tech tree UI in the Tech tab: four branch columns, prerequisites,
      live progress and days-remaining at the current rate, affordability
- [x] **`src/modifiers.js`** — the piece the plan didn't name but all three
      systems needed: tech, policies and appointees all declare `mods`/`flags`
      and are summed into one table the sim reads by key. No system in Phase 3
      required a single `if (hasTech(...))` in `src/sim.js`
- [x] Five mid-tier nodes that **change how systems interact** — Federal
      Devolution, Deficit Financing, Martial Doctrine, Trunk Network and
      Technocratic Ministries (see `DESIGN.md` §2.3 for what each rewrites)
- [x] `data/traits.js` + `data/appointees.js`: 16 traits and a generated pool,
      drawn through a seeded RNG stored in the save so a reload can't re-roll it
- [x] Appointee hiring, recurring salary cost, and drawbacks — drawbacks pay a
      **negative salary**, so a flawed candidate is a real offer rather than
      just a worse one. Salaries are billed with the upkeep bill, so an
      over-staffed government goes bankrupt exactly like an over-built one
- [x] Assignment to a region or a ministry, with **limited slots** (2+2, raised
      to 3+3 by two tech nodes). A minister's traits are national; a governor's
      apply **only in the region they are posted to**
- [x] Appointee effects actually applied in the simulation, per region, via the
      same modifier table as tech — including per-region action prices, which
      the region panel now re-reads every frame instead of quoting a stale one
- [x] Policies tab: four categories of standing national decisions, one option
      always in force, with enact costs, ongoing costs and a 240-day cooldown

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
      *(the sim has no DOM dependencies, so this is straightforward)*.
      Phase 3 used a ten-style scratch version of this for the second time;
      it has now earned a home in the repo
- [ ] Re-visit whether garrisons are ever worth it outside crisis triage — in
      every Phase 3 harness style, more garrisons meant a shorter run. See the
      Phase 3 entry in `BALANCE.md`
- [ ] Verify a run lands in the 45–60 minute window
- [ ] Save/load hardening: corrupt-save handling, a real migration step, manual
      save/restart controls
- [ ] Accessibility pass: contrast, labels, reduced motion
- [ ] Sound/haptics (optional — `navigator.vibrate` on key actions)
- [ ] Test on a small phone (667×375 landscape) and a large one; check
      notch/gesture-bar insets on a real device, held both ways round
- [ ] Consider map pan/zoom now that the map is full-bleed
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
- [ ] Lock the app to landscape:
      `android:screenOrientation="sensorLandscape"` on the activity in
      `android/app/src/main/AndroidManifest.xml`
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
