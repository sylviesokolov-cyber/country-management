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

---

## Phase 3 — progression systems (balance v3)

The phase added three systems that all change the same simulation, so the first
balance question was not a number at all: **how does anything change the sim
without the sim knowing about it?** `src/modifiers.js` is the answer — tech
nodes, policies and appointee traits all declare `mods` and `flags`, keys ending
`.mult` multiply and everything else adds, and `src/sim.js` reads keys out of
one table. That is why this entry can talk about tuning instead of about code.

### Changed

| Value | From | To | Why |
| --- | --- | --- | --- |
| `politicalCapital.perDayBase` | 0.02 | 0.04 | Phase 2 set PC income blind, with only Emergency Relief to spend it on, and DEVLOG flagged it for re-tuning once node prices existed. The whole tech tree costs **304 PC**; at the old rate a well-run country earned ~120 across a full term, so two thirds of the tree was unreachable at any skill level. |
| `politicalCapital.perStabilityPointPerDay` | 0.002 | 0.004 | Same. At the new rate a country held at 60 stability earns ~264 PC a term, so the tree is *just* affordable if you govern well and not otherwise — which is the intended shape: PC binds the bad run, research time binds the good one. |
| `mandate.austerityPerShortfallPerDay` | — | 0.08 | New. Only read under the `austerityHitsMandate` flag (Deficit Financing). At a full shortfall it roughly triples the baseline drain: survivable for a few hundred days, fatal as a way of life. |
| `martialDoctrine` mandate cost | 0.004 | 0.003 | First pass charged 0.004 per garrison per day. A three-garrison government was paying as much Mandate for its troops as for the honeymoon ending, on top of the Phase 2 garrison bill. Trimmed rather than removed — the point of the node is that a firewall has a price. |

### New numbers worth knowing

- **The tree is ~4,900 research days against a ~3,300-day term.** Nobody
  finishes it; a run gets roughly two branches. `research.pointsPerDay` is
  deliberately 1, so a node's `days` reads as literal in-game days at the base
  rate and the tree can be costed by eye.
- **Total tree cost is 304 PC against a ~284 PC term budget** (20 start + ~264
  earned). The two constraints bind in different runs, which is what makes them
  both real.
- **`appointees.salaryBase` 0.40/day** plus trait contributions, billed with the
  upkeep bill. A full 3+3 government costs ~3–4 Treasury a day against a
  national gross of ~8 at the start — a real bite, not a rounding error.
- **`policies.cooldownDays` 240.** Without a cooldown the optimal play is to
  swap to whatever suits this minute, which turns a standing decision into a
  per-frame one.

### What the harness found

Ten play styles, one seed, `Sim` driven headless. Minutes are at 1×.

| Style | mins | stability | development | notes |
| --- | --- | --- | --- | --- |
| do nothing | 20 | 40 | 267 | unchanged from Phase 2 |
| hold the line (Public Works) | 50 | 48 | 267 | unchanged from Phase 2 |
| build hard, ignore stability | 18 | 48 | 501 | unchanged from Phase 2 |
| develop the weakest | 50 | 48 | 273 | unchanged from Phase 2 |
| Economy branch + develop | 42 | **84** | **1149** | richest country, shortest good run |
| Governance branch + develop | 50 | 50 | 267 | |
| Security branch + garrisons | 31 | 53 | 234 | see below |
| Infrastructure branch + develop | 51 | 72 | 633 | |
| Governance + Infra + full staff | **55** | 56 | 267 | longest run in the set |
| Heavy Levy + Generous spending | 48 | 46 | 267 | policies alone are worth ~5 minutes |

**Federal Devolution does what it was designed to do.** Isolated against the
same seed: with the node and investing, 3,765 days; *without* the node and
investing, 3,327; with the node but patching with Public Works instead,
3,326. It rewards building and is worth nothing at all to a patcher, which is
exactly the intended "changes what the player does for the rest of the run".

**Garrisons are a trap outside crisis triage, and this is a Phase 2 property
Phase 3 only made visible.** Holding the branch and the play style fixed and
varying only the garrison cap: 0 garrisons → 3,350 days, 2 → 2,939, 3 → 2,671,
5 → 2,295. Every garrison is 3 Mandate to raise and 0.5 Treasury a day to keep,
and the harness styles never face a crisis they cannot simply invest out of, so
they never collect the upside. Martial Doctrine adds to the slope but did not
create it. **Left as-is and logged for the Phase 5 pass** — the honest fix is
either a cheaper garrison or an event that makes triage unavoidable, and Phase 4
is bringing events.

The other two flag nodes were verified against engineered states rather than
full runs, because the conditions they change are hard to sustain by playing:
Deficit Financing was checked against a country with a genuine, sustained
upkeep shortfall (development held up, stability crushed so income collapses),
where it preserves development and stability and moves the cost onto Mandate as
designed; Technocratic Ministries was checked at 10 national stability, where
normal PC income is 0.00/day and the node pays 0.147/day.

### Still open

- Political Capital sits at its 100 cap for the last third of a well-run game,
  so late-game income is simply wasted. That is consistent with "goodwill is not
  a bank account", but it does mean node *prices* stop mattering once the tree
  is nearly done.
- Garrisons, as above.
- Nothing has been tuned against a run with **events** in it, and Phase 4 adds
  the first pressure these systems will face that the player cannot see coming.

---

## Phase 4 — leaders, events and closure (balance v4)

This phase added the two things the game had been missing at either end of a
run: **who you are** at the start, and **what winning means** at the finish.
Neither needed new machinery — a leader is three `mods`/`flags` payloads and an
event's lasting consequence is a fourth with an expiry, all merged by
`src/modifiers.js` exactly like a tech node. The balance work was therefore
entirely about numbers, which is what the modifier layer was built to buy.

### The win condition

`mandate.termDays: 3650` — ten in-game years, ~55 minutes at 1×, the top of the
45–60 minute target. It sits deliberately **above** the ~3,330 days that
baseline decay alone gives you, so a term cannot be waited out: the only way to
reach the end is to hold national stability above `approvalPivot` long enough
that approval buys back the difference. The win condition is "govern well",
written as a number.

The margins say the number is right. Across the six leader-matched harness
styles, every winning run finished with between **1 and 25 Mandate out of 100**
— and these are scripts that never misclick and answer every event instantly.
A human has considerably less room than that.

### Changed

| Value | From | To | Why |
| --- | --- | --- | --- |
| `actions.garrison.mandateCost` | 3 | **1.5** | The standing Phase 3 finding, answered. 3 Mandate is a hundred days of baseline decay for a measure that is supposed to be temporary triage, and the harness showed every extra garrison shortening the run. At 1.5 a garrison is a tool rather than a regret — and the Marshal, whose whole identity is holding provinces, becomes playable. |
| Comptroller handicap | `natural.base: -5` | `effect.publicWorks.mult: 0.65` | A flat shift to where regions settle interacts brutally with the unrest cliff at 35: −5 means a region needs development 13 instead of 9 just to stay out of unrest, and with neighbour contagion on top the harness watched twelve of sixteen regions fall over by year two on **every** seed. The leader died at ~1,000 days regardless of how it was played. A handicap should change how a leader plays, not decide whether they lose. |
| Marshal buff | `garrisonBonus` + raise cost | + `garrisonUpkeep.mult: 0.60` | The upkeep multiplier was missing and it is the one that matters. A garrison's trap was never the 60 Treasury to raise it, it was the 0.5 Treasury every day forever. |
| Comptroller mechanic | `austerityHitsMandate` alone | + `austerityMandate.mult: 0.5` | The bare flag is the tier-2 tech node's rule, which is a crisis tool. Held continuously — which is the Comptroller's entire character — a full shortfall burns 0.08 Mandate a day on top of the baseline and kills the run inside three years. Halving it turns a suicide button into a way of running a government. |
| `events.chancePerDay` | 0.006 | 0.009 | 0.006 produced ~9 events in a full term. 0.009 measures at 14, or one roughly every four minutes of real play. |

### The difficulty ladder is measured, not asserted

Every leader running the **same** build-focused strategy, six seeds:

| Leader | Wins | Median days | Rated |
| --- | --- | --- | --- |
| Reformer | 6/6 | 3,650 | Forgiving |
| Tribune | 5/6 | 3,650 | Forgiving |
| Caretaker | 3/6 | 3,650 | Steady |
| Engineer | 1/6 | 3,474 | Demanding |
| Marshal | 0/6 | 3,548 | Demanding |
| Comptroller | 0/6 | 3,181 | Punishing |

The rating shown on the selection screen comes from this table. Showing it is
deliberate: a player who picks the Comptroller first and loses should know they
picked the hard one rather than conclude the game is unfair.

And with each leader running **its own** matched strategy (garrison-and-hold
for the Marshal, deficit-and-build for the Comptroller, free-policy-switching
for the Caretaker, and so on), six seeds each:

| Leader | Wins | Median days | Median score | Median stability |
| --- | --- | --- | --- | --- |
| Reformer | 6/6 | 3,650 | 15,560 | 74 |
| Tribune | 6/6 | 3,650 | 12,716 | 61 |
| Caretaker | 6/6 | 3,650 | 17,637 | 89 |
| Engineer | 3/6 | 3,650 | 12,880 | 60 |
| Comptroller | 0/6 | 2,986 | 14,656 | **100** |
| Marshal | 0/6 | 2,770 | 9,852 | 79 |

### What the harness found

- **Two thirds of the seed variance in the first Phase 4 runs was not events at
  all — it was the appointee pool.** Turning events off changed a catastrophic
  seed from 897 days to 897 days. The killer was a harness style that hired
  every candidate it could see regardless of salary, which bankrupts a
  government inside three years. That is Phase 3 working as designed ("an
  over-staffed government goes bankrupt like an over-built one") and a harness
  bug, not a balance bug — but it took a controlled comparison to tell the two
  apart, and the first instinct was to blame the new system.
- **Garrisons are still not the optimal route, even for the Marshal.** Under
  its own garrison-heavy style the Marshal reaches 2,770 days; under a plain
  build-focused style it reaches 3,548. Halving the Mandate cost and cutting
  the upkeep by 40% moved it from hopeless to close, but holding provinces
  remains worse than developing them. The remaining honest fix is a crisis the
  player cannot simply invest their way out of — which is what events are for,
  and this phase's crisis events are not yet sharp enough to be that.

### Still open

- Garrisons, as above, now narrowed from "a trap for everyone" to "not the
  optimal route even for the leader built around them".
- The Comptroller reaches 100 national stability and a 14,656 score and still
  loses, because it has no clock relief of any kind. That reads as a coherent
  identity — the one who fixes the country and runs out of time — but it is one
  bad seed away from feeling arbitrary.
- Political Capital still pins at its 100 cap late in a well-run term (carried
  over from Phase 3). Events spend PC, which helps, but not enough to matter.
