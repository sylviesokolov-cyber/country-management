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
['data/balance.js','data/regions.js','src/util.js','src/state.js','src/sim.js']
  .forEach(f => require('./' + f));

const M = window.Mandate;
const s = M.State.createNewGame();
for (let d = 1; d <= 3000; d++) {
  M.Sim.tick(s);
  if (d % 200 === 0) {
    console.log(d, s.resources.treasury.toFixed(0), s.mandate.toFixed(1));
  }
}
```

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
- Should Mandate be recoverable at all, or only ever slowed? Currently
  irrecoverable, which makes the run a strict clock.

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

### _(next entry goes here)_
