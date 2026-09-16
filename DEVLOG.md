# Development Log

> **Instruction for every session (human or Claude Code): append a short entry
> at the bottom before you finish.** Newest entries go at the end. Keep it to
> three headings — *Built*, *Broke / learned*, *Next* — and keep it short. This
> file is how a session on a phone weeks later works out where things stand,
> and it is the first thing to read after `DESIGN.md`.

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
