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

## Phase 4 — Runs, variety and closure ✅ *(complete)*

- [x] `data/leaders.js`: **six** leaders, each with a starting buff, a handicap
      and a unique mechanic — all three are ordinary `mods`/`flags` payloads
      merged by `src/modifiers.js`, so there is no `if (leader === ...)`
      anywhere in `src/` and a seventh leader is an object in a data file
- [x] Leader selection screen before a run starts, built entirely from the data
      file, showing each leader's three payloads separately, a **measured**
      difficulty rating (see the table in `BALANCE.md`) and their best score
- [x] `data/events.js`: 16 events, 43 choices, with `requires` conditions,
      per-event and global cooldowns, `once` set-pieces and region targeting
- [x] Event scheduler that **filters on the state of the country first and
      rolls second**, so what can happen is decided by what you have been
      ignoring; plus a grace period, so the opening is quiet
- [x] Event choices can leave **timed modifiers** behind (`state.effects`),
      which expire on their own and are listed in the Events tab
- [x] Events tab doubles as the run log — the same tab the event card belongs
      to, because "what is happening" and "what has happened" are one question
- [x] **Win condition**: serve the full 3,650-day term. It sits above what
      baseline decay alone allows, so a term cannot be waited out — the only
      way to reach the end is to govern well enough that approval buys back the
      difference
- [x] Run summary and scoring at game over, reading completely differently for
      a term served and a mandate exhausted
- [x] Persist best scores per leader, in their own `localStorage` key so they
      outlive the runs they describe

---

## Phase 5 — Balance, polish, robustness

- [x] **Headless balance harness, committed at last** — `tools/harness.js`,
      after being written from scratch and thrown away in three consecutive
      phases. Four play styles × six leaders × N seeds, answers events, and
      reports the itemised Mandate bill per run. Every claim in the Phase 5
      section of `BALANCE.md` is a command in its header
- [x] Full balance pass driven by the harness — logged in `BALANCE.md`. The
      headline: **the only strategy that had ever served a full term was the
      one that built nothing**, because Invest's Mandate cost was three times
      what approval relief paid back. It is now zero
- [x] **Garrisons are worth it.** Answered the standing Phase 3 + Phase 4
      question the way both entries said it would have to be answered — with a
      crisis you cannot invest your way out of, rather than another price cut.
      A garrison-focused style went 0/36 → 18/72, and for the Marshal it is now
      the *best* line available
- [x] Sharpen the crisis so neglect outruns a Treasury surplus — **open
      revolt**: a region below the unrest line for 240 days rises, destroys its
      own development, refuses Invest, and can only be broken with troops or
      emergency relief
- [x] **Patch fatigue** — Public Works and Emergency Relief get dearer each
      time they are used in the same region; Invest never does
- [x] Re-measure every leader's difficulty over twelve seeds (Phase 4's
      ratings came from six, which cannot tell 3/6 from 5/6) and rebuild the
      two leaders the balance pass broke or exposed
- [x] **The Mandate meter says why it is draining** — tap the gauge for the
      itemised bill, ranked by share. Same function that charges the meter
- [x] **News ticker and alert toasts** — the run log gets a front page, and
      the handful of things that must not be missed get a toast that never
      pauses the game
- [x] End-of-term "where your mandate went", from an accounting that goes
      through the one function allowed to move the meter
- [x] Save/load hardening: corrupt, truncated and future-version saves all
      recover to the leader screen instead of a white page, and a save that
      cannot be loaded is *cleared* rather than left to break every boot.
      `State.isUsable()` + a v4 → v5 migration step, both tested
- [ ] Verify a run lands in the 45–60 minute window **with a human playing it**
      (the harness says 3,650 days × 900ms = 55 minutes, but a human pauses)
- [ ] **Playtest the projects.** The harness completes one in about a third of
      runs, but its strategies never plan for one — so most of the measured
      improvement above comes from the Invest surcharge rather than from the
      projects themselves. A human playing *for* a project should see far more
      of them, and nothing has confirmed that yet
- [ ] **Listen to the score on a phone speaker.** It is verified to schedule
      and to change its arrangement with the country (by counting voices in a
      headless browser), which is not the same as it sounding good on a device
      whose speaker starts at 400Hz
- [x] **Fix the flat late game** — two changes, because one was not enough.
      **National projects** (`data/projects.js`): six late-game undertakings,
      one at a time, each costing Political Capital up front and a daily
      Treasury bill for two in-game years, and each paying off as an ordinary
      `mods` payload — including the only modifier in the game that moves a
      hard limit, the Land Reclamation Authority's +30 development ceiling.
      And **`invest.costPerDevelopment`**: building costs more where a great
      deal is already built. The second exists because the first alone only
      moved the flat part later — see BALANCE.md for the run that ended 31,000
      in credit at the new ceiling. End-of-term Treasury is down from
      6,900–16,100 to 300–2,600
- [x] Manual save / restart controls — a **Settings tab**: save now (which
      reports honestly when localStorage is blocked), and resign, which ends
      the term through `Sim.endRun` like any other ending rather than quietly
      deleting the world. It asks twice, in place, rather than in a `confirm()`
      the browser draws over a fullscreen game
- [x] **The art pass.** The game was built systems-first and looked it. Now:
      a 46-glyph icon sprite (`src/ui/icons.js`) replacing every emoji, a real
      typeface (Barlow, self-hosted), a map with gradients, a sea, a drop
      shadow and terrain glyphs, a regraded band ramp, elevation tokens, and a
      geometric crest per leader. See `DESIGN.md` §2.11 and `assets/LICENSES.md`
- [x] Finish the accessibility pass. Done so far: reduced motion is respected
      globally, revolt is carried by a hatch rather than by colour alone, the
      band ramp now separates in greyscale, the gauge is a real button with
      `aria-expanded`, toasts and the ticker are live regions, and a region
      announces its revolt to a screen reader.
      Contrast audit + keyboard focus order, done this pass: every text/
      background pair against the three surface tokens computed by formula
      (WCAG 2.1 relative luminance), two failures found and fixed —
      `--c-text-faint` (was 3.3:1 on the darkest surface, now `#808ea6` at
      4.5–5.9:1) and the difficulty-4 leader label, which read the map's
      `--c-band-crisis` as text at 3.2–4:1 and now uses a new
      text-only `--c-band-crisis-text` token instead, leaving the map fill
      untouched. Keyboard focus order turned out to already be sound — every
      tappable control is a real `<button>` or carries `tabindex="0"`
      (map regions), and every closed panel/overlay/veil already leaves the
      tab order via `display: none` or `visibility: hidden` rather than just
      `aria-hidden` — but there was no VISIBLE focus indicator anywhere
      except the volume slider. Added one `:focus-visible` outline rule in
      `base.css` covering every button/link/input/`[tabindex]`, a stroke-based
      override for the SVG region polygons (an `outline` box doesn't follow a
      polygon's shape), and made the toast cards keyboard-reachable
      (`tabindex="0"`; they already had Enter/Space via `View.onTap`)
- [x] **Sound, music and haptics** (`src/audio.js`) — and not optional, which
      is where the last session left it. An **adaptive score**, synthesised in
      the Web Audio graph rather than shipped as a file: one `tension` value
      derived from the state of the country moves the tempo, the mode
      (D ionian → aeolian → phrygian), the filter and which layers play, so
      the melody thins out as provinces slide and the drums arrive with the
      first revolt. Twenty-odd one-shot cues, each recognisable with the phone
      face down. `navigator.vibrate` on the decisions that matter. A mixer in
      the Settings tab (overall / music / effects / vibration), persisted
      outside the save
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
