# Mandate

A 2D country-management strategy game for the browser and Android, in the
spirit of *Rebel Inc.* and *Plague Inc.*

**Played in landscape.** You are a newly installed national leader. You have a country of 16 regions to
stabilise and develop, three resources that are never all sufficient at once,
and a **Mandate** meter that drains from the day you take office. Everything
you build costs mandate, time or both. When the mandate runs out, so does your
government. A run lasts roughly 45–60 minutes.

**Status: Phase 1 (playable skeleton).** See [TODO.md](TODO.md) for the plan
and [DEVLOG.md](DEVLOG.md) for what happened when.

---

## The stack, and why

Plain HTML, CSS and JavaScript. **No build step, no framework, no game engine.**

- `index.html` loads a handful of `<script>` files in order. That's the whole
  build system.
- The map is inline SVG — each region is a `<polygon>` you can tap, style with
  CSS and animate for free.
- The HUD and panels are ordinary DOM elements, floating over a full-bleed map.
- Saves go in `localStorage`.
- GitHub Pages hosts it, so a commit from a phone is playable on that phone a
  minute later.
- Capacitor (Phase 6) wraps the same files into an Android app. Nothing about
  the game changes for the Android build.

This is deliberate: the entire project is developed from an Android phone with
no desktop and no local toolchain. Anything requiring `npm run build` before
you can see a change would make that impossible.

---

## Running it

**On your phone (the normal way):** open the GitHub Pages URL. Once Pages is
enabled it is

```
https://<your-username>.github.io/<repo-name>/
```

Every push to `main` redeploys automatically (see
`.github/workflows/deploy-pages.yml`). First-time setup, which you can do from
the GitHub mobile web UI:

> **Settings → Pages → Build and deployment → Source: “GitHub Actions”**

**Locally, if you ever do have a computer:** open `index.html` directly in a
browser — it works from `file://` because the scripts are plain `<script>` tags,
not ES modules. Or serve the folder with anything:

```bash
npx http-server -p 8080 .    # then open http://localhost:8080
```

**Hold the phone sideways** — the game is landscape only, and shows a rotate
prompt in portrait.

**Fill the screen** two ways:
- Tap the small fullscreen icon next to the clock (uses the Fullscreen API —
  hidden automatically on browsers that don't support it, like iOS Safari).
- **Add it to your home screen** (Chrome → ⋮ → *Add to Home screen*) for the
  more permanent fix: the browser chrome never comes back at all. This uses
  `manifest.json`, already wired up in `index.html`.

---

## Project layout

```
index.html              the app shell + the script load order
styles/
  base.css              design tokens, reset, the fixed three-row grid
  ui.css                HUD, map, sheets, tab bar
data/                   ── ALL TUNABLE / AUTHORED CONTENT ──
  balance.js            every cost, rate and curve in the game
  regions.js            the 16 regions: names, terrain, starting stats
  map-geometry.js       pure SVG geometry — no gameplay values
src/
  util.js               clamp, number and date formatting
  state.js              the game state object + versioned save/load
  sim.js                THE SIMULATION — tick(), actions, derived values
  loop.js               fixed-timestep clock (real time → ticks)
  main.js               boot and wiring
  ui/
    view.js             shared view plumbing (tap handling, memoised writes)
    map.js              builds and updates the SVG map
    hud.js              the floating HUD (chips, clock, speed, Mandate gauge)
    panel.js            region detail panel (slides in from the right)
    overlay.js          full-screen management overlay + the region list
.github/workflows/
  deploy-pages.yml      auto-deploy to GitHub Pages on push to main
  android-release.yml   manual, signed .aab build (needs Phase 6 first)
```

The one rule worth remembering: **`data/` is what the game is, `src/` is how it
runs.** Tuning never touches `src/`.

---

## Documentation

| File | What it's for |
|------|---------------|
| [DESIGN.md](DESIGN.md) | The full game design and every architecture decision. Read this first if you're picking the project up cold — including a future Claude Code session. |
| [TODO.md](TODO.md) | Phased build plan as a checklist. |
| [DEVLOG.md](DEVLOG.md) | Dated session-by-session log. **Append an entry every session.** |
| [BALANCE.md](BALANCE.md) | Playtest observations and tuning history. |
| [ANDROID.md](ANDROID.md) | The full phone-only path to a Play Store release. |

---

## Deploying

Push to `main`. That's it — the Pages workflow does the rest, and the run shows
up under the repo's **Actions** tab.

## Building the Android bundle

Not wired up until Phase 6. The workflow file exists already
(`.github/workflows/android-release.yml`) and is triggered by hand from the
**Actions** tab; it produces a signed `.aab` you can download straight to your
phone. **[ANDROID.md](ANDROID.md) has the full walkthrough**, including
generating a keystore, the GitHub Secret names, and the Play Store rules you
need to plan around (notably the 14-day, 12-tester closed test — start
recruiting early).
