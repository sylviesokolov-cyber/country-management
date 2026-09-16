# Mandate — Design & Architecture

> **If you are a Claude Code session picking this project up cold, read this
> file first.** It contains the complete game design, the architecture rules,
> and the reasoning behind both. Then check `TODO.md` for the current phase and
> `DEVLOG.md` for what the last session did.

---

## 1. The pitch

The player is a newly installed national leader of a fictional country of ~16
regions. They have one term to stabilise and develop it. A run lasts roughly
**45–60 minutes** and should support deep progression within that time.

Reference points: **Rebel Inc.** (stabilise regions against a decaying
political clock) and **Plague Inc.** (spend a currency down a tech tree as a
situation evolves).

### The core tension

**The Mandate meter.** It starts full, decays every single day, and is spent by
unpopular decisions. At zero, the run ends.

Everything in the design serves this one idea: *every investment is a trade
against a clock that is already draining*. The failure mode to design against
is the idle-game spreadsheet — a state where the optimal play is to wait,
accumulate, and press buttons when numbers are big enough. Mandate decay is
what makes waiting cost something.

Consequences that follow from that principle:

- Resources must have **separate sources and sinks**, so the player is always
  short of *something* and has to choose which shortage to accept.
- Unpopular-but-effective options (garrisons, austerity, emergency powers) must
  be genuinely tempting. They cost Mandate, which means they cost *time alive*.
- Doing nothing must actively lose ground: neglected regions destabilise, and
  unstable regions accelerate Mandate decay.

---

## 2. Systems

The four systems interlock. None is optional and none should be resolvable in
isolation — that interlock is what creates decisions.

### 2.1 Resources

| Resource | Earned from | Spent on |
|---|---|---|
| **Treasury** | Regional output (development × stability) | Construction, investment, appointee salaries |
| **Political Capital** | Stability, governance tech, popular policies | Tech nodes, policies, emergency actions |
| **Manpower** | Population/development of held regions | Garrisons, staffing projects, appointee slots |

Deliberately non-overlapping: money cannot buy time, and political capital
cannot build a road. The player is meant to be rich in one and starved in
another at any given moment.

*Phase 1 status: Treasury is simulated. The other two are displayed but static.*

### 2.2 Regions (~16)

Each region carries three live values:

- **Stability** (0–100) — order, consent, security. Drives the map colour.
- **Development** (0–100) — infrastructure and economy. The ceiling on output.
- **Output** — *derived*, never stored independently:

  ```
  output = (base + development × perDevelopment) × stabilityFactor
  stabilityFactor ramps from 0.25 (stability 0) to 1.0 (stability 100)
  ```

  So a developed region in crisis pays out almost nothing. That single formula
  is the economic spine of the game: development sets the ceiling, stability
  decides how much of it you collect.

Neglected regions destabilise; unstable regions drain Mandate faster. Tapping a
region opens a panel with actions (invest, garrison, build infrastructure).
Region fill colour reflects the stability band at a glance — the player should
read the health of the country without opening anything.

Regions have a `terrain` tag (highland/agrarian/frontier/coastal/urban/
industry) and a neighbour list. Both are currently flavour and adjacency data;
they exist so that later systems (unrest spread, terrain modifiers, trade tech)
have something to hook into without a data migration.

### 2.3 Tech / policy tree

Four branches: **Economy, Infrastructure, Governance, Security.** Nodes cost
Political Capital *plus research time*, so they compete with each other for the
clock as well as the currency.

**Design rule for mid-tier nodes: they must CHANGE HOW SYSTEMS INTERACT, not
give flat percentages.** A node that says "+10% treasury" is filler. A node
that says:

> **Federal Devolution** — regions self-manage stability, but generate less
> Treasury.

…changes what the player does for the rest of the run. Flat bonuses belong only
at leaf nodes, if at all.

### 2.4 Appointees

Hireable ministers and governors, assigned to a region or a ministry. Each has:

- **Traits** granting real buffs (+stability in their region, −corruption,
  faster construction)
- A **recurring salary** in Treasury
- Often a **drawback** (unpopular with a faction, corrupt, factional loyalty)

**Slots are limited**, so appointment is a continuing reassignment problem
rather than a one-time purchase. The right minister in the wrong region should
feel like a waste.

### 2.5 Leaders

At run start the player picks one of 4–6 leaders. Each has:

- a **starting buff**
- a **handicap**
- ideally a **unique mechanic** that changes how a system behaves for them

Leaders are the primary replayability driver, so they must stay **fully
data-driven** (`data/leaders.js`) — adding a leader should be adding an object,
never writing code. When a leader needs a unique mechanic, express it as a
named flag or modifier the simulation checks, not as a special case branching
on the leader's id.

---

## 3. Layout

Portrait phone first, designed around ~390 × 844.

```
┌─────────────────────────────┐
│  TOP HUD                    │  resources · Mandate meter ·
│                             │  date · pause / 1× / 2×
├─────────────────────────────┤
│                             │
│  SVG MAP                    │  tap a region → detail sheet
│  (16 polygon regions)       │  slides up over the map
│                             │
├─────────────────────────────┤
│  BOTTOM HUD                 │  Tech · Appointees · Policies · Events
└─────────────────────────────┘
```

---

## 4. Architecture

These are the rules that keep the project workable over months of phone-only
sessions. They are not stylistic preferences.

### 4.1 Simulation is strictly separated from rendering

```
data/*.js   →   state object   →   src/sim.js tick()   →   src/ui/* render()
(authored)      (plain JSON)       (pure logic)            (reads, draws)
```

- The entire game world is **one plain, serialisable JavaScript object**.
- `src/sim.js` advances it. It contains **no DOM access whatsoever** — you can
  run a thousand ticks in Node and inspect the numbers, which is exactly how
  balance passes should be done.
- `src/ui/*` reads state and draws it. It **never mutates state directly**; it
  calls into `Mandate.Sim`.
- There is no "update the UI after this action" code anywhere. The render pass
  runs every frame from state, so any change appears on the next frame
  automatically.

Balancing this genre means changing a number and replaying, hundreds of times.
That is only survivable if the numbers are isolated from the logic and the
logic is isolated from the pixels. **This separation is non-negotiable.**

### 4.2 All balance numbers live in `data/balance.js`

Every cost, decay rate, growth curve, trait value and leader stat. If you are
typing a number into `src/`, stop — it belongs in `balance.js`. Logic files read
balance values; they never define them.

### 4.3 Everything authored is data-driven

Regions, tech nodes, appointee traits, leaders and events are all defined in
`data/` and consumed generically. The region panel already builds its action
buttons by iterating `BALANCE.actions`, so adding an action is a data edit plus
one branch in the sim. Follow that pattern for every system.

### 4.4 Map geometry is decoupled from game logic

`data/map-geometry.js` contains only `{ id, points, labelAt, neighbours }` and
a viewBox. `data/regions.js` contains only gameplay facts, matched by `id`.
Nothing in the geometry file knows the game exists.

The current map is 16 procedurally generated placeholder polygons from a
jittered 4×4 lattice (neighbours share edge points exactly, so there are no
seams). To replace it with a real hand-drawn map later: produce a file with the
same shape and matching ids. Nothing else in the codebase changes.

### 4.5 Saves are version-tagged

`state.schemaVersion` is written into every save. `State.migrate()` decides what
to do with an older one. The intended pattern as the schema evolves is a chain
of small one-step upgrades:

```js
if (save.schemaVersion === 1) { /* add v2 fields */ save.schemaVersion = 2; }
if (save.schemaVersion === 2) { /* add v3 fields */ save.schemaVersion = 3; }
```

…not one branching mega-function. Refusing to load (and starting fresh) is
always better than loading a half-valid world.

View state — which region is open, which tab is showing — is deliberately kept
**outside** the saved object, in `src/ui/view.js`. Saves store the world, not
the camera.

### 4.6 The clock is a fixed-timestep accumulator

`src/loop.js` is the only file that knows about real milliseconds.
`requestAnimationFrame` gives wildly variable frame times; the loop banks that
elapsed time and runs whole ticks out of it, so **one tick is always exactly one
in-game day**, regardless of frame rate. Catch-up is capped
(`BALANCE.time.maxCatchUpTicks`) so a backgrounded phone can't fast-forward the
run, and the game pauses itself when the tab is hidden.

This also means the simulation is deterministic and could be replayed or
batch-run — useful for automated balance testing later.

### 4.7 No build step, no modules

Scripts are plain `<script>` tags attaching to one global `window.Mandate`
namespace, loaded in dependency order at the end of `<body>`.

ES modules (`type="module"`) were explicitly avoided: browsers block them over
`file://` for CORS reasons, which would break "open the file and it works", and
they add no value to a project with ~12 source files. If the project ever
outgrows this, the migration is mechanical.

---

## 5. UI/UX rules

Layout stability on a phone is a **high-priority requirement**, not polish. Each
of these kills a specific mobile-browser failure and should not be removed
casually.

| Rule | Why |
|---|---|
| Three-row CSS Grid at `100dvh`, middle row `minmax(0, 1fr)` | The HUDs can never be pushed off-screen and the page can never grow. `dvh` tracks the collapsing mobile address bar; plain `vh` leaves a chunk of UI hidden under it. |
| `overflow: hidden` on `html, body`; scrolling only inside `.scrollable` | The page body never scrolls. Panels scroll internally, with `overscroll-behavior: contain` so reaching the end doesn't drag the page. |
| `overscroll-behavior: none` on the root | Kills rubber-band bounce and pull-to-refresh. |
| `viewport-fit=cover` + `env(safe-area-inset-*)` padding on both HUDs | Keeps the HUDs clear of the notch and the gesture bar. `env()` reports 0 without `viewport-fit=cover`, so the two go together. |
| `user-scalable=no`, `maximum-scale=1`, `touch-action: manipulation` | No pinch-zoom, and no ~300ms double-tap-zoom delay before taps register. iOS ignores the meta tag, which is why `touch-action` is also set on every interactive element. |
| `user-select: none`, `-webkit-touch-callout: none`, transparent tap highlight | No text selection, no copy/paste bubble on long press, no grey flash. |
| **`pointerdown`, not `click`**, for all game actions | `click` waits for the browser to rule out a scroll or double-tap. `pointerdown` fires the instant the finger lands. Keyboard (Enter/Space) is handled explicitly to compensate. |
| `clamp()` for all font sizes | Readable at 360px, not tiny on a tablet. |
| 44px minimum touch targets | Dense HUD buttons use an invisible `::after` to grow the tap area without changing the visual size. |
| CSS custom properties for the whole palette and spacing scale | Defined once in `base.css`. New features can only use values that already exist, so the visual style can't drift. |
| Sheets animate `transform`, not `height`/`top` | Transforms are GPU-composited and don't force layout — smooth on cheap phones. |

---

## 6. Where the phases are going

Full checklist in `TODO.md`. In short:

1. **Phase 1 (done)** — app shell, SVG map, region panel, state + tick loop,
   Treasury, top HUD with speed controls.
2. **Phase 2** — full three-resource economy, region stability/development
   simulation with drift and neglect, Mandate decay pressure, game over.
3. **Phase 3** — tech/policy tree, appointee hiring and assignment.
4. **Phase 4** — leader selection, random events, run summary and scoring.
5. **Phase 5** — balance tuning, polish, save/load hardening.
6. **Phase 6** — Capacitor wrap, signed AAB pipeline, Play Store prep.

## 7. Conventions for future sessions

- Add balance values to `data/balance.js` **before** writing the logic that uses
  them.
- Keep `src/sim.js` free of DOM references, always.
- New UI: build markup once on open, update values on render. Never rebuild
  markup per frame.
- Bump `State.SCHEMA_VERSION` and add a migration step whenever the state shape
  changes.
- Append a `DEVLOG.md` entry at the end of every session.
- Record every balance change in `BALANCE.md` with the reasoning.
