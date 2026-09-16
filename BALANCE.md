# Balance Log

Balance is the hardest part of this genre, and it is the thing that gets lost
between sessions. **Record every tuning change here, with the reason.** A
number you changed three weeks ago with no note is a number you will change
back.

All balance values live in **`data/balance.js`** — nowhere else. If a number
you want to tune isn't in that file, move it there first.

---

## How to run a balance pass

`src/sim.js` has no DOM dependencies, so the whole simulation runs headless.
That is the fastest way to see a curve without playing for 45 minutes:

```js
// node balance-check.js  (scratch file, don't commit it)
global.window = {};
// map-geometry is REQUIRED: since Phase 2 the sim reads its neighbour lists
// to spread unrest. Leave it out and every region looks like an island.
['data/balance.js','data/map-geometry.js','data/regions.js',
 'src/util.js','src/state.js','src/sim.js'].forEach(f => require('./' + f));

const M = window.Mandate;
const s = M.State.createNewGame();
M.Sim.refresh(s);                       // populate derived values first
for (let d = 1; d <= 6000 && !s.gameOver; d++) {
  M.Sim.tick(s);
  // ...and call a play-style function here, or the run is a do-nothing run.
  if (d % 200 === 0) {
    console.log(d, s.resources.treasury.toFixed(0), s.mandate.toFixed(1),
                s.derived.nationalStability.toFixed(1));
  }
}
console.log('ended day', s.day, '=', (s.day * 900 / 60000).toFixed(0), 'min');
```

**Run more than one play style.** This is the lesson of the Phase 2 pass: a
do-nothing loop tells you almost nothing, because the numbers that matter are
the *differences* between styles. The Phase 2 entry below was tuned against
four — do nothing, hold the line with Public Works, build hard, and develop the
weakest regions — and two of the three structural problems it found were
invisible in any single run. Each style is just a function called after
`tick()` that picks a region and calls `M.Sim.applyAction(s, id, actionId)`.

In the browser, `Mandate.debug.state` is the live state object — handy for
cheating resources to test a late-run situation without playing to it.

Useful reference points: at 1× a day is `BALANCE.time.msPerTick[1]` ms, so
**1× ≈ 67 days per minute**, and a 45–60 minute run is roughly **3000–4000
days**.

---

## Target feel

- A run lasts **45–60 minutes**. Mandate should be genuinely threatening by the
  end, not a formality.
- The player should always be short of *something*. If Treasury, Political
  Capital and Manpower are all comfortable at the same time, a sink is missing.
- Waiting must never be the optimal play. If a playtest rewards idling, the
  decay or the sinks are too weak.
- A region should be recoverable from crisis, but only by giving up something
  else.

---

## Open questions

- Is one day per second (1× = 900ms/tick) the right base pace on a phone, or
  should 1× be slower with 2× as the default play speed?
- How punishing should neglect be? Rebel Inc. is aggressive about it; too
  aggressive here and the map becomes whack-a-mole.
  *(Phase 2: a do-nothing run now ends at ~20 minutes. That feels right for
  "you did nothing", but it is untested against a real player.)*
- ~~Should Mandate be recoverable at all, or only ever slowed?~~
  **Answered in Phase 2: only ever slowed.** A country above
  `mandate.approvalPivot` stability drains more slowly, down to
  `decayFloorPerDay`. It never reverses, so the run stays a strict clock — but
  governing well now buys back some of the time it costs. See the entry below
  for why this had to exist.
- Political Capital has one sink (Emergency Relief) until the tech tree lands.
  Its income is set to leave roughly 200–250 PC across a good run, which is a
  guess at what four branches of tech should cost. Re-tune it in Phase 3 with
  real prices to compare against.
- Should a garrison be withdrawable at a Mandate *refund*? Standing troops down
  ought to be popular. Left out because it would make Mandate recoverable
  through the back door.

---

## Change log

### 2026-09-16 — initial Phase 1 values

Starting point, essentially unplaytested — these are first guesses to get
something moving on screen, not a balanced game.

| Value | Set to | Reasoning |
|---|---|---|
| `time.msPerTick` 1× / 2× | 900 / 450 ms | One day ≈ one second. A 45-min run ≈ 3000 days ≈ 8 in-game years, which feels like a plausible term of office. |
| `treasury.start` | 250 | Enough for two Invests, so the first decision is *which two regions*. |
| `region.output.base` | 0.25 | Even an undeveloped region pays something. |
| `region.output.perDevelopment` | 0.03 | At the starting spread this gives ≈ 7.7 Treasury/day nationally — an Invest every ~16 days. Slow enough that choices matter. |
| `region.output.atZeroStability` | 0.25 | A region in total crisis still pays 25% of its potential. Harsher would make a crisis unrecoverable; softer would make stability optional. |
| `mandate.decayPerDay` | 0.02 | Baseline alone drains 100 Mandate in 5000 days — longer than a run. Intentional: baseline decay is the floor, *instability* is meant to be what actually kills you. |
| `mandate.decayPerUnstableRegionPerDay` | 0.01 | With the 3 starting unstable regions, decay is ≈ 0.05/day. **Almost certainly too weak** — the Phase 1 map has no drift yet, so this is untested. |
| `actions.invest` | 120 → +6 dev, −0.5 mandate | Development is the long game, so it costs Mandate: you are spending your term on something that pays later. |
| `actions.publicWorks` | 80 → +8 stability, 0 mandate | Cheap, popular, immediate — the "safe" play, and therefore the one that should feel like it's wasting your term. |
| `actions.garrison` | 60 + 2 manpower → +14 stability, −3 mandate | The strong, unpopular option. Locked until Phase 2 simulates Manpower. |

**Known Phase 1 gaps (do not tune around these):**
- Treasury has **no sinks**, so it grows without bound. Phase 2 adds upkeep.
- Regions do not drift, so stability only ever changes when the player acts.
- Political Capital and Manpower are displayed but static.
- Mandate is not yet threatening within a run.

### 2026-09-16 — landscape rework (no gameplay values changed)

The layout moved to landscape and the map was regenerated (6×3 lattice minus
two corners, still 16 regions). Starting stats were carried over, so the
national picture is unchanged: **average stability 49%, ≈7.7 Treasury/day, 3
regions below the unrest line** (North Adra, Duskmoor, South Adra) — now placed
on the map's edges, with the capital in the middle, so the frontier is
geographically meaningful once neighbour effects land in Phase 2.

One value added: `mandate.healthyAbove: 60`. Purely a UI threshold (the gauge
runs green above it, amber between it and `warnBelow`, red below), but it lives
in balance because *where the danger line sits* is a tuning decision.

### 2026-09-16 — Phase 2: the economy, the drift and the clock

The first pass with the whole loop running. Every number below was chosen
against a headless harness (see *How to run a balance pass*) rather than by
feel: four scripted play styles — do nothing, hold the line, build, and
develop-the-weakest — run to game over, and the spread between them is what
was actually being tuned.

**The headline result.** Where the run ends, by play style, at 1×:

| Play style | Ends | National stability | Development |
|---|---|---|---|
| Do nothing | ~20 min | 40% | 267 (unchanged) |
| Hold the line with Public Works, build nothing | ~47 min | 48% | 267 (unchanged) |
| Develop the weakest regions | ~50 min | 92% | 1,173 (from 267) |

That is the shape the design asks for: doing nothing loses, surviving your term
without building anything is possible but hollow, and actually governing is
both the longest run and the only one that changes the country.

#### The two structural changes, and why they were forced

**1. Stability drifts toward a NATURAL LEVEL, not by a flat daily amount.**

The plan called for `stabilityDriftPerDay` (a flat slide) offset by a
development bonus. Built that first; it failed in the harness. Because a
Public Works costs no Mandate and its +8 stability never decayed back, the
winning strategy was to hold all 16 regions on Public Works forever and build
nothing — a 117-minute run that hoarded 30,000 Treasury and left the country
exactly as it started. That is precisely the idle-game spreadsheet DESIGN.md
says to design against.

So a region now drifts toward a level set by what you have actually built
there (`region.naturalStability`), closing `reversionPerDay` of the gap each
day. It makes the three actions different *in kind*:

| | What it does | How long it lasts |
|---|---|---|
| **Public Works** | pushes stability above the natural level | washes out over ~400 days |
| **Garrison** | raises the natural level by 18 | only while you pay 0.5 ¤/day |
| **Invest** | raises the natural level by 1.05 per point | permanently |

`naturalStability.base` is **26**, deliberately below the unrest line of 35: an
undeveloped, ungarrisoned region doesn't stagnate, it settles into unrest and
starts costing Mandate. `perDevelopment` is **1.05**, fitted against the
starting map so the country opens a few points *below* its natural level
everywhere (a gentle nationwide slide with time to answer it) while the three
frontier regions — development 5 to 8 — sit under the line from day one.

An earlier fit (base 22, slope 0.55) put the national natural level at 31
against a starting average of 49. Every region slid at once, nobody could
afford to fix 16 regions, and all four play styles bankrupted at 18 minutes.
The fit against the starting map is the whole thing.

**2. Mandate decay is slowed by a well-governed country.**

With drift working, developing was still a *loss* on the clock: it cost
Mandate per Invest and bought nothing a Public Works treadmill didn't already
give. The develop-everything style died at 30 minutes against the treadmill's
47. The clock was punishing the one thing the game is about.

So above `approvalPivot` (50) national stability, baseline decay falls by
`decayReliefPerStabilityPoint` down to a floor. It never reverses — Mandate is
spent time. A country at 75% stability drains at the 0.012 floor instead of
0.03, roughly doubling the term, and that is what makes development pay for
itself in the only currency that matters.

#### The numbers

| Value | Set to | Reasoning |
|---|---|---|
| `naturalStability.base` | 26 | Below `unstableBelow` (35) on purpose: neglect has to actively lose ground. |
| `naturalStability.perDevelopment` | 1.05 | Development 9 clears the unrest line, 71 reaches 100. Fitted to the starting map, as above. |
| `naturalStability.garrisonBonus` | 18 | About what 17 development would buy — rented by the day instead of owned. |
| `naturalStability.perUnstableNeighbour` | −4 | Unrest spreads, but two bad neighbours (−8) still won't sink a developed region on their own. |
| `naturalStability.austerityPenalty` | −25 | Scaled by the unpaid share of the bill, so austerity is a slope rather than a cliff. |
| `region.reversionPerDay` | 0.004 | A Public Works (+8) is mostly gone after ~400 days. Fast enough to put the player back in the room, slow enough that the map is not whack-a-mole. |
| `upkeep.treasuryPerDevelopmentPerDay` | 0.015 → **0.018** | Sets where investment breaks even: at 0.018 against `output.perDevelopment` 0.03, a point of development only pays above stability 47. Stabilise first, still. At 0.022 the late economy collapsed (development peaked at 501 instead of 1,173); at 0.015 it ran away and the best style maxed all 16 regions. |
| `upkeep.unpaidDevelopmentDecayPerDay` | 0.05 | Bankruptcy has to be a death spiral, not a plateau: unpaid regions crumble, crumbling regions earn less, the bill stays the same size. |
| `mandate.decayPerDay` | 0.02 → **0.03** | This is now the term limit: 100 / 0.03 ≈ 3,300 days ≈ 50 minutes at 1×. The old 0.02 was set as a floor that instability would dominate, but a competent player keeps unrest at zero, so nothing ended their run — the hold-the-line style ran 117 minutes. |
| `mandate.approvalPivot` / `decayReliefPerStabilityPoint` / `decayFloorPerDay` | 50 / 0.0012 / 0.012 | The floor is reached at 65% stability. Relief at 0.0006 was too weak to make developing worth it; at 0.0014 the best style maxed the map. |
| `mandate.decayPerUnstableRegionPerDay` | 0.01 → **0.008** | Split into two terms with the one below. |
| `mandate.decayPerUnstablePointPerDay` | **0.0006** *(new)* | A flat cost for crossing the line (so the threshold is a visible cliff to steer away from) plus a per-point cost for how far below (so a region in free-fall gets worse, not merely bad). |
| `actions.invest.mandateCost` | 0.5 → **0.2** | At 0.5 the develop-everything style spent half its entire Mandate budget on investing and died 17 minutes before the do-nothing-but-patch style. Development is the only permanent fix in the game; the clock must not punish reaching for it. |
| `actions.garrison.cost.manpower` | 2 → **6** | At 2 it wasn't a constraint: Manpower sat at its cap all run. At 6 against a starting pool of 12 and ~0.09/day of recruitment, the opening garrison is a real decision and refilling takes ~66 days. |
| `actions.garrison` upkeep | **0.5 ¤/day** *(new)* | Against a starting net income of ~2.9/day this caps early garrisons at three or four. Garrisons are meant to be the thing you notice you are still paying for. |
| `actions.withdraw` | **new** | Stands a garrison down: refunds 3 of the 6 Manpower (the rest demobilises), stops the upkeep, and costs 8 stability as the grip loosens. |
| `actions.relief` | **new** | 6 PC + 40 ¤ for +18 stability, usable **only** below the unrest line. Political Capital needed a sink before the tech tree exists, and an emergency-only tool is the one the design already called for. |
| `politicalCapital` income | base 0.02, +0.002/point above 50, cap 100 | Roughly 200–250 across a good run. The cap is the anti-hoarding rule: goodwill is not a bank account. |
| `manpower` income / cap | 0.002/region + 0.0004/development per day, × stability; cap 10 + 0.06 × development | The same stability multiplier that gates Treasury gates recruitment, so an unstable country cannot garrison its way out of trouble. |

**Two things the harness caught that were bugs, not balance:**

- **Invest on a region already at 100 development charged the full 120 ¤ and
  0.2 Mandate and did nothing.** The effect clamped out silently. `canAfford`
  now refuses any action whose every effect is already clamped out
  ("Fully developed" / "Fully stable"), while a flag change — standing a
  garrison down — still counts as a change on its own.
- **Unrest spread in the order regions happened to be listed in.** Drift was
  computed and applied region by region, so r1's slide reached r2 on the same
  day but never the reverse. All trends are now computed against one
  start-of-day snapshot and applied afterwards.

**Still deliberately unfixed:** a do-nothing run ends holding ~3,200 Treasury.
The upkeep sink only bites on development you have built, and that style builds
none. It is dead at 20 minutes regardless, and "rich, illegitimate and out of
office" is the right ending for it.

### _(next entry goes here)_
