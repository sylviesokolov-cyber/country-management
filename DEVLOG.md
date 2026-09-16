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
