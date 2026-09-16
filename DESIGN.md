# Mandate — Design & Architecture

> ## New session? Start here, in this order:
> 1. **Read this whole file.** It's the complete game design and the
>    architecture rules, and it doesn't change often — the two files below
>    do, every session.
> 2. **Open `TODO.md`.** Its checkboxes are the single source of truth for
>    what's built vs. not. Find the first unchecked phase — that's the work.
> 3. **Read the last 1-2 entries of `DEVLOG.md`.** That's what the previous
>    session actually did, what broke, and what it left as "Next".
> 4. **Before you stop, append a dated entry to `DEVLOG.md`** (template's at
>    the top of that file) **and tick off whatever you finished in `TODO.md`.**
>    A session that doesn't do both of these has left no trace for the next
>    one — treat it as part of the task, not cleanup.
>
> `BALANCE.md` and `ANDROID.md` are reference material — open them when the
> work actually touches tuning or the Android release path, not before.

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

Baseline decay alone sets the length of a term. It is **slowed** — never
reversed, never refilled — by a country that is visibly doing well, so
governing properly buys back some of the time it costs. Mandate is spent time,
and no amount of good government gives a day back.

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

All three are simulated as of Phase 2. Two rules keep them from becoming a
savings account:

- **Treasury has a standing bill.** Every point of development costs upkeep
  every day, as does every garrison. A bigger country is a more expensive one,
  so growth never stops needing to be paid for. If the bill goes unpaid, the
  unpaid *share* of it decays development and stability — austerity, and a
  genuine death spiral rather than a plateau.
- **Political Capital and Manpower are capped.** Goodwill is not a bank
  account and soldiers are not savings; neither can be hoarded through a quiet
  decade and cashed in at the end.

### 2.2 Regions (~16)

Each region carries three live values:

- **Stability** (0–100) — order, consent, security. Drives the map colour.
- **Development** (0–100) — infrastructure and economy. The ceiling on output,
  and the only permanent way to raise the region's natural stability.
- **Output** — *derived*, never stored independently:

  ```
  output = (base + development × perDevelopment) × stabilityFactor
  stabilityFactor ramps from 0.25 (stability 0) to 1.0 (stability 100)
  ```

  So a developed region in crisis pays out almost nothing. That single formula
  is the economic spine of the game: development sets the ceiling, stability
  decides how much of it you collect.

#### Natural stability — the spine of the region simulation

A region does not hold whatever stability you last pushed it to. It drifts
toward a **natural level** set by what you have actually built there:

```
natural = base + development × perDevelopment
                + garrison
                - unrest in neighbouring regions
                - austerity
```

`base` sits deliberately **below the unrest line**, so an undeveloped,
ungarrisoned region doesn't merely stagnate — it settles into unrest and starts
costing Mandate. Doing nothing has to lose ground.

This is what makes the three region actions differ **in kind**, not in size:

| Action | What it does | How long it lasts |
|---|---|---|
| **Public Works** | pushes stability *above* the natural level | washes back out |
| **Garrison** | raises the natural level | only while you keep paying |
| **Invest** | raises the natural level | permanently |

So Public Works is a loan against the future, a garrison is rent, and
development is the only thing you own. **Without this rule the winning
strategy was to patch every region forever and build nothing** — see BALANCE.md
for the run that proved it.

Unstable regions drain Mandate faster, and each one drags its neighbours' natural
level down, so a crisis left alone eats outward across the map. Tapping a region
opens a panel with actions; the panel marks the natural level on the stability
bar, because a player has to see where a region is *headed*, not just where it
is. Region fill colour reflects the stability band at a glance — the player
should read the health of the country without opening anything.

Regions have a `terrain` tag (highland/agrarian/frontier/coastal/urban/
industry) and a neighbour list. The neighbour list is live as of Phase 2 —
it is what unrest spreads along. `terrain` is still flavour, waiting for the
systems that will read it (terrain modifiers, trade tech), and exists now so
those arrive without a data migration.

### 2.3 Tech / policy tree

*Live as of Phase 3 — `data/tech.js`, twenty nodes.*

Four branches: **Economy, Infrastructure, Governance, Security.** Nodes cost
Political Capital *plus research time*, so they compete with each other for the
clock as well as the currency. The whole tree is ~4,900 research days against a
term of ~3,300, so nobody finishes it: a run is a choice of direction.
Political Capital is charged when a node is **queued**, not when it starts, so
a four-deep queue is four nodes' worth of standing already spent.

**Design rule for mid-tier nodes: they must CHANGE HOW SYSTEMS INTERACT, not
give flat percentages.** A node that says "+10% treasury" is filler. A node
that says:

> **Federal Devolution** — regions self-manage stability, but generate less
> Treasury.

…changes what the player does for the rest of the run. Flat bonuses belong only
at leaf nodes, if at all.

Five nodes carry that weight today:

| Node | What it rewrites |
| --- | --- |
| **Federal Devolution** | Regions close the gap to their natural level 2.5× faster — so Public Works washes out almost at once and Invest pays back in weeks. You stop patching and start building, and accept a 12% smaller economy for it. |
| **Deficit Financing** | Austerity stops eating development and stability and starts burning Mandate. Bankruptcy changes from a death spiral into a deliberate, expensive way to buy a crisis some time. |
| **Martial Doctrine** | A garrisoned region stops passing unrest to its neighbours. Troops change the *shape* of a crisis, not just its size — and cost Mandate every day they stay. |
| **Trunk Network** | A region's development lifts every region it borders. Until this exists the adjacency map can only ever hurt you; after it, *where* you build matters as much as how much. |
| **Technocratic Ministries** | Political Capital accrues from national development instead of from stability above the pivot — the only way out of a run where the country is permanently too unstable to earn the currency that would fix it. |

**How a node reaches the simulation.** Nodes never contain logic. They declare
`mods` (numbers) and `flags` (switches); `src/modifiers.js` sums every tech
node, active policy and hired appointee into one table, and `src/sim.js` reads
keys out of it. Keys ending in `.mult` multiply, everything else adds. Nothing
in the sim asks "does the player have tech X?", which is what stops the
simulation filling up with one branch per node. `src/modifiers.js` documents
every key the sim reads and has a `Mods.audit()` that names any key the data
declares and the sim ignores — a typo in a node's `mods` is otherwise
completely invisible.

### 2.4 Appointees

*Live as of Phase 3 — `data/traits.js` and `data/appointees.js`.*

Hireable ministers and governors, assigned to a region or a ministry. Each has:

- **Traits** granting real buffs (+stability in their region, −corruption,
  faster construction)
- A **recurring salary** in Treasury
- Often a **drawback** (unpopular with a faction, corrupt, factional loyalty)

**Slots are limited**, so appointment is a continuing reassignment problem
rather than a one-time purchase. The right minister in the wrong region should
feel like a waste.

Two rules do most of the work:

- **Role decides scope.** A minister's traits apply nationally; a governor's
  apply *only in the region they are posted to*. That is the whole reason
  posting is a decision — a Technocrat (+15% output) is worth a fortune in the
  industrial core and almost nothing in a frontier region with 5 development.
- **Drawbacks pay a negative salary.** A flawed candidate is genuinely cheap,
  in both the hiring fee and the daily wage, so the pool can offer you someone
  dangerous and affordable rather than simply someone worse.

Candidates are *generated* — `data/appointees.js` holds names and titles, and
the sim rolls a role, a perk and (55% of the time) a drawback through a seeded
RNG stored in the save. A reload therefore cannot re-roll the pool.

Salaries are billed **with the upkeep bill**, so an over-staffed government
goes bankrupt through exactly the same austerity rule as an over-built one.

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

**Landscape, phone first**, designed around ~844 × 390. The game is played with
the phone held sideways; the browser shows a rotate prompt in portrait, and the
packaged Android app locks to landscape in the manifest (Phase 6).

**The map fills the entire screen and the HUD floats on top of it.** There is no
fixed header or footer boxing the map in. In landscape there is only ~390px of
height to work with, so every pixel spent on a permanent bar is a pixel of map
lost — overlaying the HUD buys the whole screen back. This is how the genre
does it (Rebel Inc., Plague Inc. and most mobile 4X games).

```
┌────────────────────────────────────────────────────────────┐
│ [💰 250 +2.9/d] [🏛 20 +0.02/d] [👥 12/26 +0.09/d] [⚖ 49%]    │
│                                          [1 Jan 2027 ▮1×2×]  │
│                                                    ┌────┐  │
│                                                    │ 100│  │ ← vertical
│              full-bleed SVG map (16 regions)       │ ▮▮ │   Mandate gauge
│                                                    │MAND│  │
│                                                    └────┘  │
│ [⚙ Ministry]                             [Regions 🗺]      │
└────────────────────────────────────────────────────────────┘
```

- **Top-left** — resource chips, each with its per-day rate: Treasury,
  Political Capital, Manpower (shown as *held/cap*) and national Stability.
  The Treasury rate is **net of upkeep** — a gross figure would read as a
  healthy economy right up until the lights went out — and the chip turns red
  when the bill is about to go unpaid. On screens under 400px tall the rates
  and icons drop so the row still fits on one line.
- **Top-right** — in-game date and the pause / 1× / 2× controls.
- **Right edge** — the Mandate gauge, a vertical bar that drains downward and
  shifts green → amber → red at the thresholds in `BALANCE.mandate`.
- **Bottom-left "Ministry"** and **bottom-right "Regions"** open the
  full-screen management overlay (tabs across the top: Tech, Appointees,
  Policies, Events, Regions). Four of the five are live; Events is Phase 4's.
  `src/ui/overlay.js` is only the shell — it knows about tabs, opening,
  closing and the render cadence, and calls one function per tab. The Phase 3
  screens live in `src/ui/ministry.js`, which is why the shell has stayed the
  same size across three phases.
  These tabs are rebuilt when the in-game **day** changes rather than every
  frame, and the rebuild preserves `scrollTop` — the tech tree is taller than a
  landscape phone, so a rebuild that scrolled you back to the top would make
  the tab unusable while the clock was running.
- **Tapping a region** slides a detail panel in from the right edge. A side
  panel is the right shape in landscape — it leaves most of the country visible
  while you act on one region, which a bottom sheet would not.

Three details make that panel behave:

1. The HUD sits **above** the panel (`z-index`) and insets its right-hand
   clusters when the panel opens, so the Mandate gauge and the pause button are
   never covered.
2. The **map shrinks** into the remaining width at the same time, so the region
   you just tapped can't end up hidden behind the panel. The SVG re-letterboxes
   itself, so this is a width change — no camera maths.
3. All three are driven by one class on `#app` and one custom property
   (`--panel-w`), so the panel, the HUD and the map can never disagree about
   how wide the panel is.

## 4. Architecture

These are the rules that keep the project workable over months of phone-only
sessions. They are not stylistic preferences.

### 4.1 Simulation is strictly separated from rendering

```
data/*.js   →   state object   →   src/sim.js tick()   →   src/ui/* render()
(authored)      (plain JSON)       (pure logic)            (reads, draws)
                                        ↑
                               src/modifiers.js
                     (tech + policies + appointees → one table)
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

The one place the simulation reaches into it is the `neighbours` list, which
unrest spreads along. `src/sim.js` reads it once into an adjacency index and
**symmetrises it**: if a hand-drawn map ever lists r3 next to r4 but not r4
next to r3, unrest would spread one way only — a bug nobody would think to look
for in a geometry file.

The current map is 16 procedurally generated placeholder polygons: a jittered
6×3 lattice with two opposite corner cells dropped, which gives a
country-shaped silhouette rather than a rectangle. Neighbours share edge points
exactly, so there are no seams. The viewBox is ~2.1:1 to suit a landscape
phone. To replace it with a real hand-drawn map later: produce a file with the
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
| Full-bleed map with the HUD as an absolutely-positioned overlay layer | Landscape leaves ~390px of height; a fixed header and footer would eat a third of it. |
| The HUD layer is `pointer-events: none`; each control opts back in | Otherwise the transparent overlay would swallow taps meant for regions underneath it. This is why you can tap a region that sits visually "under" the HUD. |
| HUD anchors are a 3×3 grid with `justify-self` per cluster | Corner clusters stay at their natural size instead of stretching across a track, with no absolute-position arithmetic. |
| `100dvh` on `#app` | `dvh` tracks the collapsing mobile address bar; plain `vh` assumes it's hidden and leaves UI underneath it. |
| `overflow: hidden` on `html, body`; scrolling only inside `.scrollable` | The page body never scrolls. Panels scroll internally, with `overscroll-behavior: contain` so reaching the end doesn't drag the page. |
| `overscroll-behavior: none` on the root | Kills rubber-band bounce and pull-to-refresh. |
| `viewport-fit=cover` + `env(safe-area-inset-*)` padding on **all four** sides of the HUD layer | In landscape the notch is on a *side* edge, not the top, so left/right insets matter as much as top/bottom. `env()` reports 0 without `viewport-fit=cover`, so the two go together. |
| `user-scalable=no`, `maximum-scale=1`, `touch-action: manipulation` | No pinch-zoom, and no ~300ms double-tap-zoom delay before taps register. iOS ignores the meta tag, which is why `touch-action` is also set on every interactive element. |
| `user-select: none`, `-webkit-touch-callout: none`, transparent tap highlight | No text selection, no copy/paste bubble on long press, no grey flash. |
| **`pointerdown`, not `click`**, for all game actions | `click` waits for the browser to rule out a scroll or double-tap. `pointerdown` fires the instant the finger lands. Keyboard (Enter/Space) is handled explicitly to compensate. |
| `clamp()` for all font sizes, and for the gauge height | Readable on a 667×375 phone, not oversized on a tablet. |
| 44px minimum touch targets | The dense HUD buttons (speed controls) use an invisible `::after` to grow the tap area without changing the visual size — it matters more in landscape, where vertical space is scarce. |
| A scrim gradient along the top and bottom of the map | The HUD floats over the map; a bright green region directly beneath a chip would wash the text out. The scrim guarantees contrast at the edges without dimming the middle. |
| CSS custom properties for the whole palette and spacing scale | Defined once in `base.css`. New features can only use values that already exist, so the visual style can't drift. |
| Panels animate `transform`, not `width`/`right` | Transforms are GPU-composited and don't force layout — smooth on cheap phones. |
| A portrait gate (`@media (orientation: portrait)`) | The layout assumes landscape. Asking for a rotate is honest; letting the HUD pile up on itself is not. |

## 6. Where the phases are going

Full checklist in `TODO.md`. In short:

1. **Phase 1 (done)** — landscape app shell with the floating HUD, SVG map,
   region panel, region list, state + tick loop, Treasury, speed controls.
2. **Phase 2 (done)** — full three-resource economy with real sinks, natural
   stability and drift, unrest spreading to neighbours, garrisons, austerity,
   approval-slowed Mandate decay, and an end-of-term summary.
3. **Phase 3 (done)** — the twenty-node tech tree and research queue, the
   modifier layer that lets tech, appointees and policies all change the
   simulation without touching it, appointee hiring/posting, and standing
   policies.
4. **Phase 4** — leader selection, random events, run summary and scoring.
5. **Phase 5** — balance tuning, polish, save/load hardening.
6. **Phase 6** — Capacitor wrap, signed AAB pipeline, Play Store prep.

## 7. Conventions for future sessions

- Add balance values to `data/balance.js` **before** writing the logic that uses
  them.
- Balance against the headless harness, and against **more than one play
  style**. A single do-nothing run hides almost everything worth knowing; the
  numbers that matter are the differences between a player who idles, one who
  patches, and one who builds. BALANCE.md has the recipe.
- An action that cannot change anything must not be sellable. `Sim.canAfford`
  refuses actions whose every effect is already clamped out, so the player is
  never charged for a no-op.
- Keep `src/sim.js` free of DOM references, always.
- New UI: build markup once on open, update values on render. Never rebuild
  markup per frame.
- Bump `State.SCHEMA_VERSION` and add a migration step whenever the state shape
  changes.
- A new system that changes the simulation should declare `mods`/`flags` and go
  through `src/modifiers.js`, not add a branch to `src/sim.js`. If it needs a
  key the sim doesn't read yet, add the key to `Mods.READ_KEYS` in the same
  commit as the line that reads it.
- Any mutation of tech, appointees or policies must bump `state.modVersion`
  (the sim's `touch()`), or the modifier cache will keep serving the old
  government.
- Append a `DEVLOG.md` entry at the end of every session.
- Record every balance change in `BALANCE.md` with the reasoning.
