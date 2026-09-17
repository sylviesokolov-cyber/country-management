# Development Log

> **Instruction for every session (human or Claude Code): append a short entry
> at the bottom before you finish.** Newest entries go at the end. Keep it to
> three headings — *Built*, *Broke / learned*, *Next* — and keep it short.
> This file is how a session on a phone weeks later works out where things
> stand. See `DESIGN.md`'s opening checklist for where this fits in a
> session's startup sequence.

Template:

```markdown
## YYYY-MM-DD — short title

**Built**
- …

**Broke / learned**
- …

**Next**
- …
```

---

## 2026-09-16 — Scaffolding + Phase 1

**Built**
- Repo from empty: project structure, `.gitignore`, and the full doc set
  (`README`, `DESIGN`, `TODO`, `BALANCE`, `ANDROID`, this log).
- **App shell**: fixed three-row CSS Grid at `100dvh`, safe-area insets on both
  HUDs, no page scroll, no overscroll bounce, no zoom, `pointerdown` for all
  game input. Design tokens (palette + spacing + `clamp()` type scale) defined
  up front in `styles/base.css`.
- **Map**: 16 placeholder polygon regions generated from a jittered 4×4 lattice
  so neighbouring regions share edge points exactly (no seams). Geometry lives
  in `data/map-geometry.js` and contains zero gameplay values; gameplay facts
  are in `data/regions.js`, matched by id.
- **Simulation**: plain state object, `Sim.tick()` = one in-game day, fixed
  timestep accumulator in `src/loop.js` with capped catch-up. Treasury
  accumulates from regional output; output is derived from development × a
  stability factor. Baseline Mandate decay is live; unstable regions already
  add to it.
- **UI**: top HUD (three resources, Mandate meter, date, pause/1×/2×), tappable
  regions coloured by stability band, region detail sheet with stats and action
  buttons generated from `BALANCE.actions`, bottom tab bar with placeholder
  sheets for the Phase 3–4 systems.
- Version-tagged saves in `localStorage` with autosave every 20 days, plus save
  and pause when the tab is backgrounded.
- CI: Pages auto-deploy on push to `main`, and a manual signed-`.aab` workflow
  that fails fast with a clear message until Phase 6 exists.

**Broke / learned**
- First pass ran one `Sim.tick()` at boot just to populate derived values — so
  every page reload silently cost the player a day. Split out `Sim.refresh()`,
  which recomputes derived values without advancing the clock. Worth
  remembering: anything that touches `state.day` must be deliberate.
- The Mandate meter was a red→orange gradient, which read as "in danger" even
  at 100%. Now a solid colour that switches to red below
  `BALANCE.mandate.warnBelow`.
- Verified in a headless Chromium at 390×844: 16 regions render, the page
  cannot scroll, pause really stops ticks, 2× really doubles them, a save
  survives a reload with the day intact, and there are no console errors.

**Next**
- Phase 2: Political Capital and Manpower sources/sinks, region stability drift
  and neglect, unrest spreading to neighbours, unlock the Garrison action, and
  a real game-over screen.
- Start recruiting the 12 Play Store testers now — it is a 14-day clock and it
  runs in parallel with development (see `ANDROID.md`).

---

## 2026-09-16 — Landscape rework

**Built**
- **Reoriented the whole game to landscape** after reference screenshots from
  Rebel Inc. and similar. The old portrait three-row grid (HUD / map / tab bar)
  is gone.
- **Full-bleed map with a floating HUD.** The map now fills the screen and the
  HUD is an overlay layer pinned to the corners: resource chips top-left, date
  and speed top-right, a vertical Mandate gauge on the right edge, and
  "Ministry" / "Regions" buttons in the bottom corners. In landscape there is
  only ~390px of height, so a fixed header and footer were eating a third of
  the screen.
- **Regenerated the map** for the new aspect: a 6×3 lattice with two opposite
  corner cells dropped, giving 16 regions and a country-shaped silhouette
  instead of a rectangle. Region data was re-laid out to match — capital in the
  middle, the unstable frontier regions out on the edges.
- **Region panel moved to the right edge** as a slide-in side panel. A bottom
  sheet in landscape would have covered nearly everything.
- **Replaced the bottom tab bar with a full-screen overlay** (`src/ui/tabs.js` →
  `src/ui/overlay.js`), tabs across the top, matching the shape the reference
  games use for management screens.
- **Added a working Regions list** in that overlay — all 16 regions sorted
  worst-first with their band colour, tap to jump straight to one. Genuinely
  useful now the map is full-bleed.
- Mandate gauge is colour-coded green → amber → red off the new
  `BALANCE.mandate.healthyAbove` / `warnBelow` thresholds.
- Portrait gate asking the player to rotate; Android will lock to landscape in
  the manifest at Phase 6 (noted in `ANDROID.md` and `TODO.md`).

**Broke / learned**
- The HUD layer covered the whole screen, so it swallowed every tap meant for a
  region. Fixed with `pointer-events: none` on the layer and `auto` on the
  controls — the standard game-HUD pattern, and worth knowing before building
  any overlay UI.
- The corner buttons stretched right across the screen: grid items default to
  `justify-self: stretch`. Pinned each HUD cluster to its own corner instead.
- First version of the side panel covered the Mandate gauge and the pause
  button, and hid whichever region you had just tapped if it was on the right.
  Fixed by putting the HUD above the panel, insetting the HUD's right side, and
  shrinking the map into the remaining width — all driven by one class on
  `#app` and one `--panel-w` custom property, so the three can't disagree.
- Gauge read as a warning even at 100% because it used the orange "mandate"
  colour throughout. Now it uses the same green/amber/red band colours the map
  uses for regions, so the game has one colour language.

**Next**
- Phase 2, unchanged: Political Capital and Manpower sources and sinks, region
  stability drift and neglect, unrest spreading to neighbours (the new map's
  `neighbours` data is ready for it), unlock Garrison, real game-over screen.
- Possible polish: map pan/zoom, now that the map is full-bleed.
- Still worth starting now: recruit the 12 Play Store testers (14-day clock).

---

## 2026-09-16 — Fullscreen + HUD chip fix

**Built**
- **Fullscreen toggle.** A button next to the clock requests the Fullscreen
  API on tap (browsers refuse it without a direct gesture, so it can't just
  happen on load). Feature-detected and hidden on browsers with no
  Fullscreen API (iOS Safari). Also added `manifest.json` + a placeholder
  `icon.svg` so "Add to Home Screen" launches with `display: fullscreen` —
  the more permanent fix, since once installed the browser chrome never
  comes back at all.
- **Fixed the wobbly/overlapping HUD.** The four resource chips were each
  their own independent floating pill. On a short landscape phone (reported:
  address bar visible, ~360px tall) they didn't all fit on one line, and the
  wrapped second row had nothing behind it — floating text sat directly on
  top of the map, overlapping region labels. Fixed by grouping all four
  chips inside one shared card, so any wrap happens inside a single
  background instead of spilling loose pills onto the map. Also added a
  `max-height: 400px` rule that drops the treasury rate and chip icons,
  which keeps the row fitting on one line on most real short phones instead
  of relying on the wrap-safety net at all.

**Broke / learned**
- Verified the group-containment fix by deliberately forcing a wrap down to
  a 4-row stack (50px wide) in a headless test — every chip stayed inside
  the card's bounds at every width tested, confirming the fix holds even in
  worse cases than what was reported.

**Next**
- Phase 2, unchanged.
- Still worth starting now: recruit the 12 Play Store testers (14-day clock).


## 2026-09-16 — Phase 2: the economy, the drift and the clock

**Built**
- **All three resources are live.** Political Capital accrues from national
  stability above a pivot (and stops entirely below it — the leader in trouble
  is the one who can't buy their way out). Manpower is recruited from
  development × stability. Both are **capped**: goodwill is not a bank account.
- **Treasury finally has a sink.** Every point of development bills upkeep
  every day, as does every garrison, so a bigger country is a more expensive
  one. When the bill can't be paid, the unpaid *share* of it decays development
  and stability — that's the "development decays without upkeep" rule, and it
  makes bankruptcy a death spiral rather than a plateau. The HUD's Treasury
  rate is net of upkeep and the chip turns red before the bill bounces.
- **Natural stability.** Regions drift toward a level set by development,
  garrison, neighbouring unrest and austerity, closing a fixed share of the gap
  per day. `base` sits below the unrest line, so neglect actively loses ground.
- **Garrison + Withdraw Troops**, and a new **Emergency Relief** action (costs
  Political Capital, usable only below the unrest line) so PC has a sink before
  the tech tree exists. Garrisons show as a dot on the map and in the region
  list.
- **Region panel rebuilt** around the new model: a full-width stability row
  with a marker showing where the region *settles*, a trend readout, and
  Output/Upkeep. The stability bar now takes the region's band colour, so a
  region in unrest no longer shows a green bar. The Phase 1 note is gone.
- **Real end-of-term screen**: reason, seven-line run summary, and a restart
  that hands the loop the new state object.
- Schema **v2** with a v1→v2 migration; `Util.formatRate` now adapts its
  precision (PC moves in hundredths and was rendering as a permanent "+0.0").

**Broke / learned**
- **A single do-nothing balance run tells you almost nothing.** Two of the
  three structural problems below were invisible except as *differences between
  play styles*. Tuning against four scripted styles is the only reason this
  phase landed. BALANCE.md now says so in the balance-pass recipe.
- **The flat stability drift the plan called for made "build nothing" the
  winning strategy** — 117 minutes, 30,000 Treasury hoarded, country unchanged.
  Public Works costs no Mandate and its +8 never decayed, so patching 16
  regions forever beat governing. Replacing it with the natural-level model is
  what fixed it. The old `stabilityDriftPerDay` / `developmentSupportPerPoint`
  knobs are gone.
- **Then the clock punished developing anyway**: investing cost Mandate and
  bought nothing a treadmill didn't already give, so the build-everything style
  died 17 minutes *earlier*. Fixed by letting a well-governed country slow the
  baseline decay (never reverse it) — which also answers BALANCE.md's standing
  "is Mandate recoverable?" question: only ever slowed.
- **Invest on a maxed-out region charged full price and did nothing.** The
  effect clamped out silently. `Sim.canAfford` now refuses any action whose
  every effect is already clamped.
- **Unrest spread in region-list order.** Drift was computed and applied in one
  pass, so r1's slide reached r2 that same day but never the reverse. All
  trends are now computed against one snapshot, then applied.
- **`btn.hidden = true` doesn't hide anything if a CSS rule sets a display.**
  Garrison and Withdraw Troops shipped side by side in the panel while every
  script correctly believed one was hidden; only a screenshot caught it. Added
  `[hidden] { display: none !important; }` to the reset, and the UI test now
  asserts on `getClientRects()` rather than the attribute.
- **A flex item with `min-width: 0` and no `overflow` paints outside its box.**
  Region names were being squeezed to 22px and rendering straight over the
  trend arrow and the numbers. Widened the list columns to 190px and clipped
  the name.

**Next**
- Phase 3: `data/tech.js`, the research queue, and the tech tree UI. Political
  Capital income was set blind — re-tune it once real node prices exist.
- Worth committing in Phase 5: the headless harness used here was a scratch
  file. Multi-style runs earned their keep and shouldn't be rewritten each time.
- Still worth starting now: recruit the 12 Play Store testers (14-day clock).


## 2026-09-16 — Phase 3: the tech tree, the ministry and the modifier layer

**Built**
- **`src/modifiers.js`, which the plan never mentioned and everything needed.**
  Three systems landed this phase and all three want to change the same
  simulation. Done naively that is `if (state.tech.completed.includes(...))`
  scattered through `src/sim.js`, and every future node is a code change.
  Instead tech nodes, policies and appointee traits all declare the same
  payload — `mods` (numbers) and `flags` (switches) — and this file sums them
  into one table keyed by string. Keys ending `.mult` multiply, everything else
  adds; that one rule is the whole merge algorithm, and it is why two nodes
  that both touch output compose instead of one silently winning. **Phase 3 did
  not add a single `if (hasTech(...))` to the sim.**
- **The tech tree**: 20 nodes, four branches, ~4,900 research days against a
  ~3,300-day term. Nobody finishes it. Political Capital is charged when a node
  is *queued*, not when it starts, so a four-deep queue is standing already
  spent; cancelling refunds it in full and drops anything orphaned behind it.
- **Five nodes that rewrite a system rather than scaling one** — Federal
  Devolution (regions self-correct 2.5× faster, the centre collects 12% less),
  Deficit Financing (austerity stops eating the country and starts burning
  Mandate), Martial Doctrine (a garrison stops unrest crossing it, and costs
  Mandate daily), Trunk Network (a region's development lifts its neighbours,
  so the adjacency map stops being purely a threat), Technocratic Ministries
  (Political Capital from development instead of from calm — the only way out
  of a permanent crisis).
- **Appointees**: generated from a seeded RNG *stored in the save*, so a reload
  cannot re-roll the pool until a better candidate appears. A minister's traits
  are national; a governor's apply only in the region they are posted to, which
  is the entire reason posting is a decision. Drawbacks pay a **negative
  salary**, so the pool can offer somebody cheap and dangerous instead of
  merely worse. Salaries are billed with the upkeep bill — one bill, one
  austerity rule, and an over-staffed government dies exactly like an over-built
  one.
- **Policies**: four categories, one option always in force, an enact cost in
  Political Capital and a 240-day cooldown. A posture, not a bonus.
- Three real screens in the overlay (`src/ui/ministry.js`), schema **v3** with a
  v2→v3 migration, and the run summary now reports research and appointments.

**Broke / learned**
- **The region panel was quoting a price it no longer charged.** Action costs
  were written into the button once, when the panel was built. The moment a
  cost could be modified per region — Industrial Credit, or a Builder governor
  — the button said 120 and the sim took 84. Costs are now re-read from
  `Sim.actionCost` every frame, and rounded there rather than at display time,
  so the number shown and the number taken are the same call.
- **A cached modifier table is a silent-failure machine.** Rebuilding the table
  per region per tick is too slow, so it caches against `state.modVersion`.
  Forget to bump that counter on one mutation and the newly completed node
  simply does nothing until something else happens to invalidate the cache —
  no error, no wrong number, just a purchase that didn't take. Every mutation
  now goes through one `touch(state)` function for exactly that reason.
- **Data that does nothing is invisible.** A typo in a node's `mods` key makes
  a node that looks bought and has no effect. `Mods.audit()` returns every key
  the data declares that the sim never reads, and the harness asserts it is
  empty. (Per-action keys like `cost.invest.mult` are read generically, so the
  audit checks the action id exists instead.)
- **Rebuilding a tab every day threw the player back to the top of it.** The
  Regions list got away with it at 16 short rows; the tech tree is three
  screens tall. `Overlay` now preserves `scrollTop` across a rebuild.
- **Cancelling a queued node can orphan the ones behind it.** Prerequisites
  count as met by anything *queued*, so you could queue a tier-1 node, queue
  the tier-3 node behind it, then cancel the tier-1 and keep a tier-3 you were
  never entitled to. `Sim.cancelTech` now re-walks the queue until nothing more
  drops, and refunds everything it drops.
- **Garrisons are a trap, and it isn't Phase 3's fault.** Varying only the
  garrison cap: 0 → 3,350 days, 2 → 2,939, 3 → 2,671, 5 → 2,295. That slope is
  Phase 2's pricing; Martial Doctrine only made it visible by adding a daily
  Mandate charge on top. Logged in BALANCE.md and TODO for the Phase 5 pass
  rather than papered over — events (Phase 4) may be what makes triage
  unavoidable and garrisons worth their price.
- **Federal Devolution was worth checking rather than assuming.** Same seed,
  same style: with it and investing, 3,765 days; without it, 3,327; with it but
  patching via Public Works, 3,326. It rewards building and is worth exactly
  nothing to a patcher — which is the design rule (DESIGN.md §2.3) actually
  holding rather than being asserted.

**Next**
- Phase 4: `data/leaders.js`, the leader select screen, `data/events.js` and
  the event scheduler. Leaders should need no new machinery — a leader is a
  `mods`/`flags` payload like everything else now, which is what the modifier
  layer was built for.
- Political Capital sits pinned at its 100 cap for the last third of a well-run
  run, so node prices stop mattering late. Worth a look once events give PC
  another sink.
- Still deferred: the headless harness is *still* a scratch file, now on its
  second phase of earning its keep. It is in Phase 5's list.
- Still worth starting now: recruit the 12 Play Store testers (14-day clock).


## 2026-09-16 — Phase 4: leaders, events, and a way to win

**Built**
- **A run can now be won.** `mandate.termDays` is 3,650 — ten in-game years,
  ~55 minutes at 1× — and it sits deliberately *above* the ~3,330 days that
  baseline Mandate decay alone gives you. A term cannot be waited out: the only
  way to reach the end is to hold stability high enough for long enough that
  approval buys back the difference. The win condition is "govern well",
  expressed as a number rather than as a rule. Every winning harness run
  finished with between **1 and 25 Mandate out of 100**, and those are scripts
  that never misclick.
- **Six leaders**, each a buff, a handicap and a mechanic — and every one of
  those is an ordinary `mods`/`flags` payload. **Phase 4 needed no new
  mechanism at all**, which is the whole argument for the modifier layer built
  last phase. Two leaders hand you a tier-2 tech node's rule on day one by
  reusing its flag, which also means researching that node later is redundant
  *for them* — a real strategic difference that cost zero lines of code.
- **16 events, 43 choices**, with a scheduler that filters on the state of the
  country *first* and rolls *second*. That ordering is the whole design: what
  *can* happen is decided by what you have been ignoring, and chance only picks
  between things that were already true. An event fires roughly every four
  minutes of play, pauses the clock, and restores the speed you were running at
  when you answer.
- Event choices can leave **timed modifiers** behind — a wage settlement that
  raises upkeep for 900 days, an autonomy precedent that costs 8% of Treasury
  for two years. They are modifier payloads with an expiry, so they needed one
  function to add and one to drop.
- **Scoring and a scoreboard.** One number per term, weighted in
  `BALANCE.scoring` so what the game thinks a good term *is* stays arguable in
  a data file. Calm is a *multiplier*, not an addend, which is what stops a
  huge permanently-burning country outscoring a smaller one that was governed.
  Best scores live in their own `localStorage` key, because a best score has to
  outlive the runs it describes.
- The Events tab is the **run log**; every tab in the overlay is now real, and
  `src/ui/overlay.js` still knows nothing about what any of them contain.

**Broke / learned**
- **The leader screen could be skipped entirely, and I wrote the bug myself.**
  `main.js` builds a provisional world at boot so the map has something to draw
  behind the leader screen. The phone lifecycle hooks save on `pagehide` — so
  opening the game and reloading before choosing anybody saved the placeholder,
  found it on the next boot, skipped the leader screen and dropped the player
  into a run under a leader they never picked. Caught by a Playwright test that
  reloaded mid-setup. Fixed with a `started` flag the save function refuses
  outright: one guard, in the one place that writes.
- **Two thirds of the seed variance I blamed on events was the appointee pool.**
  Some seeds ended at 800 days and some at 3,000, and the obvious suspect was
  the brand-new system. Turning events off changed a catastrophic seed from 897
  days to 897 days. The real cause was a harness style that hired every
  candidate it could see regardless of salary — which bankrupts a government
  inside three years, exactly as Phase 3 designed. A harness bug wearing a
  balance bug's clothes, and only a controlled comparison could tell them
  apart.
- **A `natural.base` handicap is far more punishing than it looks**, because it
  interacts with the unrest cliff at 35. The Comptroller's −5 meant a region
  needed development 13 instead of 9 just to stay out of unrest, and with
  neighbour contagion on top, twelve of sixteen regions fell over by year two
  on every seed. The leader lost at ~1,000 days however it was played. Replaced
  with a weaker Public Works, which changes how it plays instead of whether it
  loses.
- **A flag that is a fine crisis tool is a suicide button held continuously.**
  The Comptroller's mechanic is Deficit Financing from day one, and a permanent
  full shortfall burns 0.08 Mandate a day on top of the baseline. Gave it a new
  `austerityMandate.mult` key at 0.5 — which is a two-line change precisely
  because the flag was never special-cased in the sim.
- **Garrisons: narrowed, not fixed.** Halved the Mandate cost (3 → 1.5, the
  standing Phase 3 finding) and gave the Marshal a 40% upkeep cut. It moved the
  Marshal from hopeless to 100 days short — but a plain build-focused style
  *still* outlives the garrison-focused one for the leader built around
  garrisons. Logged rather than papered over: the honest fix is a crisis you
  cannot invest your way out of, and this phase's crisis events are not sharp
  enough to be that yet.

**Next**
- Phase 5: the full balance pass, and the headless harness has now been
  rewritten from scratch for the third phase running. It is overdue a home in
  the repo.
- Sharpen the crisis events so neglect outruns a Treasury surplus — that is
  also the remaining answer on garrisons.
- Political Capital still pins at its cap late in a good term. Events spend it,
  but not enough.
- Still worth starting now: recruit the 12 Play Store testers (14-day clock).

## 2026-09-17 — Phase 5: the harness finally lands, and it has opinions

**Built**
- **`tools/harness.js` is in the repo.** Written from scratch and thrown away
  in three consecutive phases because it always lived in a scratch directory.
  Four play styles (`idle`, `patcher`, `builder`, `garrisoner`) × six leaders ×
  N seeds, answering events, reporting the itemised Mandate bill per run.
  Every balance claim in this session is now a command, and they are in the
  header of that file and at the top of `BALANCE.md`.
- **Open revolt.** A region below the unrest line banks `unrestDays`; after 240
  of them it rises. A revolt destroys development rather than stalling it,
  collapses output, weighs 2.5 neighbours' worth of contagion — and **refuses
  Invest**. Troops or emergency relief, nothing else. It ends only above 45%
  stability, so creeping over the unrest line by a hair does not end it.
- **Patch fatigue.** Public Works and Emergency Relief cost more each time they
  are used *in the same region*, bleeding off over ~200 days. Invest never
  does. The design has always called Public Works "a loan against the future";
  this is the interest.
- **The Mandate meter says why it is draining.** The gauge is a button;
  `Sim.mandateBreakdown()` returns the bill itemised by cause and ranked by
  share of today's drain. It is also what *charges* the meter, so the reasons
  and the rate cannot drift. And `Sim.chargeMandate()` is now the only thing in
  the game that moves Mandate at all, which is what makes the end-of-term
  "where your mandate went" bars trustworthy instead of a plausible lie.
- **A news ticker and alert toasts** (`src/ui/alerts.js`). The run log gets a
  front page in the dead space between the two corner buttons, and a toast
  carries the handful of things that must not be missed. Toasts never pause the
  game and never take the input — that is a deliberate rule, written down.
- **Save hardening.** Corrupt, truncated, empty and future-version saves all
  land on the leader screen instead of a white page, and a save that cannot be
  loaded is *cleared* rather than left to break every subsequent boot. Six bad
  saves and the v3 → v4 → v5 migration chain are all tested.

**Broke / learned**
- **The only strategy that had ever served a full term was the one that built
  nothing.** First harness sweep against Phase 4's numbers: `patcher` 7 wins
  from 36, `builder` **zero** from 36 — despite reaching 80% stability and
  1,300 development. That is exactly the idle-game spreadsheet `DESIGN.md` says
  the whole game exists to design against, and it had been shipping since
  Phase 2. Two previous phases *suspected* it and both cut `invest.mandateCost`
  by guesswork (0.5 → 0.2); neither could measure it.
- **The Mandate accounting found it in one line.** `m:base 62, m:actions 35` —
  a builder spent 35 of its 100 Mandate on Invest and got about 13 back in
  approval relief. Building cost three times what it bought. The right value
  was 0, and there had never been a design argument for anything else:
  garrisons cost Mandate because soldiers are unpopular, austerity because
  unpaid bills are. Roads and clinics are not. Result: builder 0/36 → 32/72,
  garrisoner 0/36 → 18/72, and the intended hierarchy (build > garrison > patch
  > idle) holds for the first time.
- **Garrisons work now, and the previous two entries said exactly why they
  would.** Both logged that the honest fix was "a crisis you cannot invest your
  way out of" and both shipped another price cut instead. Building the crisis
  fixed it in one change: for the Marshal, garrisoning is now the *best*
  strategy available (6/12 vs builder's 5/12).
- **Fixing the sim broke a leader, and the harness caught it in the same
  sweep.** The Reformer's unique mechanic was "Invest costs no Mandate at all"
  — which this phase made true for everybody. It went from the easiest leader
  in the game to 0 wins from 24 runs, holding a handicap and nothing else.
- **Its buff had been a handicap wearing a buff's label since Phase 4.**
  "Regions correct toward their natural level twice as fast" sounds like a
  bonus and is not: natural stability starts *below* the unrest line
  everywhere, so doubling the rate of correction doubles the speed of the
  opening slide. Nothing measured it until there was a harness.
- **A handicap has to bite the strategy the game rewards, or it is
  decoration.** The Comptroller's was "Public Works lands 35% weaker" — which
  costs a patcher dearly and a builder nothing. The moment building became the
  winning line, the leader the selection screen calls *Punishing* started
  winning every seed. Phase 4's ratings were taken from six seeds, which cannot
  tell 3/6 from 5/6; re-measured over twelve, the ladder changed almost
  completely.
- **A fixed-width element in a `1fr` grid track sizes that track.** The new
  toast stack and breakdown panel silently pushed the whole HUD grid wider than
  its own padding box, which slid the Mandate gauge out from under the region
  panel's inset and straight over the panel. Both are positioned against named
  padding variables now instead of participating in grid sizing.
- **An orange warning ring on an orange region is invisible.** The unrest
  countdown only ever appears on regions in the orange and red bands, so it had
  to bring its own dark background with it. Same class of problem one step
  further on: revolt is drawn with a *hatch*, not a redder red, because the
  crisis band is already red and roughly one man in twelve cannot tell those
  two apart.
- A browser test of the save migration proved nothing, because `pagehide` fires
  on reload and re-saved the live v5 state over the downgraded blob. Migration
  is tested in Node against `State.migrate` directly now, which is the actual
  unit.

**Next**
- **The late game is flat, and it is the first thing to fix.** In a won run
  development caps out (16 × 100 = 1,600) around day 3,000, after which the
  Treasury climbs past 20,000 with nothing to spend it on and Political Capital
  pins at its cap — that last one carried over from Phase 3 *and* Phase 4, so
  it is now two problems rather than one. The last 500 days of a good term have
  no decisions in them.
- Patch fatigue is doing less work than it looks: `patcher` spreads across 16
  regions, so each one cools most of the way back before it is patched again.
  The revolt system is what actually demoted that strategy. Sharpen it or admit
  it.
- Manual save / restart controls — a Settings tab. The corrupt-save half of
  that TODO item is done; the player-facing half is not.
- Finish the accessibility pass: a real contrast audit and keyboard focus
  order. Reduced motion, non-colour carriers and live regions are done.
- Still worth starting: recruit the 12 Play Store testers (14-day clock).
