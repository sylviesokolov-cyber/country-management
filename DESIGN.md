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

#### Open revolt — the crisis you cannot buy off

*Live as of Phase 5.*

Unrest has a clock of its own. A region below the unrest line banks
`unrestDays`; after `revolt.afterDays` it rises in **open revolt**, which is a
different *kind* of problem rather than a worse number:

- development is **destroyed** rather than stalled, so the longer it burns the
  less there is to come back to;
- output collapses beyond what stability alone explains;
- it weighs `revolt.contagionWeight` neighbours' worth of unrest, so it pulls
  the map in around it;
- **Invest is refused there.** Only Garrison and Emergency Relief reach it.

That last rule is the whole point, and it is the answer to a question Phases 3
and 4 both logged and neither resolved: *are garrisons ever worth it?* They
were not, because every crisis could be solved with money given enough of it.
A revolt cannot. The headless harness confirmed it — the garrison-focused play
style went from never surviving a term to surviving a quarter of them, and for
the Marshal it is now the best line available.

A revolt must never be a surprise. The map fills a countdown ring over the
eight months a province spends below the line, and the region panel says how
many days are left in words. A mechanic that destroys a region has to be
visibly coming, or it punishes not having read the manual rather than
punishing neglect.

#### Patch fatigue

*Live as of Phase 5.* Public Works and Emergency Relief get **more expensive
each time they are used in the same region**, bleeding off slowly. Invest never
does.

The design has always described Public Works as "a loan against the future";
this is the interest, and it exists because the harness found that patching
the same provinces forever was the only strategy that ever served a full term.
Rebel Inc. answers the same problem the same way — every initiative rolled out
raises the price of the next one — and making it *per region* means the
cheapest move is always the one you have been avoiding.

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

*Live as of Phase 4 — `data/leaders.js`, six of them.*

At run start the player picks one of six leaders. Each has:

- a **starting buff**
- a **handicap**
- a **unique mechanic** that changes how a system behaves for them

Leaders are the primary replayability driver, so they stay **fully
data-driven** — adding a leader is adding an object, never writing code. All
three payloads are the same `mods`/`flags` shape every other system uses, so
Phase 4 needed **no new mechanism at all**: there is no `if (leader === ...)`
anywhere in `src/`.

Two leaders' mechanics are a tech node's flag handed over on day one
(`garrisonBlocksContagion`, `austerityHitsMandate`) and one reuses a modifier
key (`spillover.perDevelopment`). That is deliberate: it costs nothing, and it
means researching that node later is *redundant for them*, which is itself a
strategic difference.

**Difficulty is measured, not asserted.** Each leader carries a `difficulty`
that comes from running the same strategy against six seeds in the harness (the
table is in `BALANCE.md`), and the selection screen shows it. A player who
picks the hardest leader first and loses should know they picked the hard one
rather than conclude the game is unfair.

### 2.6 Events

*Live as of Phase 4 — `data/events.js`, 16 events and 43 choices.*

The purpose of an event is not surprise, it is **pressure that argues with your
plan**. An event that fires blind is a dice roll and the player learns nothing
from it; an event that fires because three regions are in unrest and the
Treasury is empty is the game telling you what you have been ignoring.

So the scheduler **filters on the state of the country first and rolls
second**. Every event carries `requires`, only eligible events enter the draw,
and weight decides between them. That ordering is what makes an event read as a
consequence.

The same design rule as the tech tree applies to a choice: it must change what
you do next, not just move a number. "Pay 200" versus "pay 400" is not a
choice. "Pay now" versus "let a region burn for a year" is. A choice can leave
a **timed modifier** behind — a wage settlement that raises upkeep for 900
days, an autonomy precedent that costs 8% of Treasury for two years — which is
an ordinary modifier payload with an expiry.

An event pauses the clock and takes over the screen, and the game returns to
the speed you were running at when you answer. A branching choice read while
sixteen regions drift is not a choice, it is a reflex test.

### 2.7 Telling the player what is happening

*Live as of Phase 5 — `src/ui/alerts.js` and the Mandate breakdown in
`src/ui/hud.js`.*

Phase 4 built a run log and put it behind a tab, which meant the country could
rise in revolt, go bankrupt and lose two provinces while the map said nothing
at all. This is the part of the genre that is most worth copying directly, and
all three reference games do the same two things.

**The meter says why it is draining.** Rebel Inc.'s reputation bar never
simply falls; it tells you, in words, that lack of stability is what is eating
it. So the Mandate gauge is a button, and `Sim.mandateBreakdown()` returns the
itemised bill — one line per cause, ranked by share. The same function is what
actually charges the meter, so the reasons and the rate cannot drift apart,
and `Sim.chargeMandate()` is the only thing in the game that moves Mandate at
all, which is what makes the end-of-term "where your mandate went" summary
trustworthy rather than a plausible-looking lie.

The unit is deliberately a **share of today's drain**, not a rate. "0.008 per
day" is a number; "31% of what is costing you the term" is the thing the
player actually wants, which is *which one to go and fix*.

**The log gets a front page.** A news ticker along the bottom of the map
carries the latest entry — Plague Inc.'s ticker, in the one part of a
landscape HUD that was otherwise dead space — and tapping it opens the full
log. Alert toasts carry the handful of things that must not be missed.

Two rules govern the toasts, and both are load-bearing:

1. **A toast never pauses the game and never takes the input.** Events are the
   game's one interruption and they have earned it. After Inc. is widely
   disliked for timed tasks that seize control of the settlement, and a
   notification that stops the clock is the same mistake in miniature. Tapping
   a toast is an *offer* — it jumps to the region — and ignoring it costs
   nothing but the news.
2. **Good news gets the same billing as bad.** A feed that only ever speaks up
   to scold reads as nagging, and the player stops looking at it.

Colour is never the only carrier. A province in open revolt is drawn with a
**hatch**, not just a redder red, because the crisis band is already red and
the difference between "in trouble" and "gone, and Invest will be refused
there" is the most consequential distinction on the map.

### 2.8 Winning, losing and the score

A run ends one of two ways, and both go through one function so the score is
computed exactly one way:

- **Mandate reaches zero** — the run is lost.
- **The full term is served** (`mandate.termDays`, 3,650 days) — the run is won.

The term length sits deliberately *above* the ~3,330 days that baseline decay
alone allows, so a term cannot be waited out. The only way to reach the end is
to keep national stability above `approvalPivot` long enough that approval buys
back the difference. The win condition is "govern well", expressed as a number.

The score weights live in `BALANCE.scoring`, so what the game thinks a good
term *is* stays arguable in a data file. One weight is load-bearing: the share
of the term free of unrest is a **multiplier**, not an addend, which is what
stops a huge permanently-burning country outscoring a smaller one that was
actually governed. Best scores are kept per leader in their own `localStorage`
key — deliberately not in the save, which is one run and is cleared when the
next begins.

---

### 2.9 National projects — the late game

*Live as of Phase 5 — `data/projects.js`, six of them.*

For three sessions the DEVLOG opened with the same sentence: the late game is
flat. Every region reaches development 100 around day 3,000, Invest is refused
everywhere, the Treasury climbs past 20,000 and Political Capital pins at its
cap. The last 500 days of a *won* run contain no decisions — the idle-game
spreadsheet this whole design exists to prevent, arriving through the back door
at the end of a good term.

A project is one national undertaking at a time, measured in years:

- **Political Capital up front** (22–32, two or three tech nodes' worth), so
  the currency that pins at its cap has somewhere to go.
- **A daily Treasury bill** for the two in-game years it takes, billed through
  the *same upkeep bill* as roads and soldiers. A government that overcommits
  goes into austerity by exactly the rule everything else does, and a project
  it cannot pay for does not stop — it **slows down**, advancing by the share
  of the day's bill that was actually paid.
- **A standing cost afterwards**, for most of them. A state that has undertaken
  great works is permanently more expensive to run.

The design rule is the tech tree's rule and harder: a project must change how
the systems interact. Land Reclamation raises the **development ceiling** — the
only modifier in the game that moves a hard limit rather than a rate. The
Federal Compact governs the provinces for you and takes 12% of the economy for
it. The Civic Endowment slows the baseline Mandate drain and bills you 12 a day
forever for the privilege. A project reaches the simulation as a `mods` payload
through `src/modifiers.js`, exactly like a tech node, so a seventh is an object
in a data file.

**Raising the ceiling was not enough on its own**, and this is the part worth
remembering: with it and nothing else, a won run capped out again at the new
limit and finished 31,000 in credit. The flat stretch had simply moved later.
So Invest also carries a **marginal cost**: `costPerDevelopment` adds to its
price per point the region already holds, above a floor of 60. The easy ground
goes first; what is left is marsh and compulsory purchase. That is what gives a
rich country somewhere to put its money, and it makes finishing a good province
a real choice against starting a poor one. Invest still carries no *fatigue* —
building never gets harder because you did it recently, only because there is
less easy ground left.

### 2.10 Sound — a score that follows the country

*Live as of Phase 5 — `src/audio.js`.*

**There are no audio files in this repository, and there will not be.** Every
alternative was worse here: `<audio src>` and `decodeAudioData` are both
blocked by CORS from `file://`, which is a hard requirement (§4.7); a music bed
good enough to loop for 55 minutes is several megabytes against a game that is
currently under 400KB including six font faces; and a recording cannot follow
the state of the country.

So the score is **synthesised in the Web Audio graph**, and the reason is the
third of those, not the first two. One `tension` value — derived from unrest,
revolts, the Mandate remaining and whether the bill is being paid, then
smoothed over about twelve seconds — moves the whole arrangement:

- **The tonic never changes; the mode does.** D ionian when the country is
  calm, aeolian as it strains, phrygian in crisis. A fixed tonic under a
  changing mode is what makes decline audible as *the same piece going wrong*
  rather than as a different track fading in. The mode may only change at a
  phrase boundary.
- **The melody is the first thing to go.** Bells play only while things are
  calm, and this is the most effective single thing in the file: the player
  hears the tune stop before they notice the third province cross the line.
- The drum enters as the country stops being calm, a low brass cluster only
  ever appears when provinces are in revolt, and a heartbeat arrives in the
  last fifth of a government's life.
- **A paused game loses everything that moves** and keeps the drone. The clock
  stopping is a state you can hear.

Cues are written to be recognised rather than admired: a confirmation rises, a
refusal falls, spending money is metallic, troops are percussive, and anything
to do with a revolt is low and dirty. A player should be able to tell what just
happened with the phone face down.

**Audio is view, never simulation.** It reads state on the same render pass as
everything else and it reads the *run log* for one-shot cues — so a new kind of
event gets a sound by appearing in one table in `src/audio.js`, with no change
to `src/sim.js`, and a muted game plays identically. The mixer lives in the
Settings tab and is stored outside the save, because volume is a fact about the
room rather than about the run.

### 2.11 The visual language

*Live as of Phase 5's art pass.*

The game was built systems-first and looked it: emoji for icons, flat polygons
for a country, and the browser's default UI font doing every job. All three are
the same mistake — using whatever was nearest instead of deciding.

**Nothing is a default any more.**

### Icons

One sprite, 46 glyphs, in `src/ui/icons.js`. All 24×24, 2px stroke, round
caps, drawn in `currentColor` — so a chip's icon is automatically the chip's
colour and a disabled button's icon dims with the button, with no per-icon CSS
anywhere.

Emoji are gone, and the reason is worth keeping: they are a different artist's
work on every platform, they carry their own colour so they never match a
palette, and they cannot take a stroke weight. Four of them side by side can
never look like one set.

The sprite is a string in a JS module rather than an `assets/icons.svg`,
because `<use href="file.svg#id">` does not resolve from `file://` — and
opening `index.html` straight off the filesystem is a hard requirement of this
project.

### Typeface

**Barlow**, self-hosted in `assets/fonts/`, latin subset, two widths doing two
jobs: Barlow Condensed for headings, HUD labels, buttons and region names,
Barlow for body text and every number. A CDN `<link>` was rejected outright —
it breaks `file://`, breaks offline play, and puts a third-party request in a
packaged Android app.

### The map

The map is the hero and it was reading as a debug view. Four changes fixed
that, and none of them touched the simulation:

- **Regions are gradients, not flat fills**, lit from above across the whole
  viewBox rather than per region — so sixteen polygons read as one landscape
  instead of sixteen tiles.
- **The landmass casts a shadow onto a sea.** A separate silhouette group
  casts it, because shadowing the real regions would shadow all sixteen
  internal borders too.
- **`terrain` finally does something.** It had sat in `data/regions.js` since
  Phase 1 as flavour "waiting for the systems that will read it"; it now draws
  a faint glyph behind each region name. It is the difference between sixteen
  coloured shapes and sixteen *places*.
- **The band ramp was regraded** to move through hue as well as brightness.
  The old mustard and orange were nearly indistinguishable, which on a map
  that *is* the readout meant the game was failing to report itself.

### Rules that are load-bearing

- **Colour is never the only carrier.** Revolt is a hatch, not a redder red.
  The stability bands separate in greyscale.
- **The instrument-panel voice**: condensed, uppercase, tracked, for anything
  that labels. Sentence case for anything that is read as prose.
- **Numbers are always tabular**, so a counter never jitters as its digits
  change.
- **Depth is three layered tokens** (`--e-1/2/3`) plus a one-pixel lip of
  light. A single large blur reads as fog; a contact shadow plus an ambient
  one reads as height.
- **A seventh leader is still a data edit.** The crests on the selection
  screen are geometric SVG paths in `src/ui/leaders.js` keyed by a `crest`
  name in the data file — not six image files.

Third-party licences live in `assets/LICENSES.md`, which also records what was
evaluated and rejected, so the next session does not re-run the search.

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
  Policies, Projects, Events, Regions, Settings). The strip scrolls
  horizontally: seven tabs do not fit across 844px at a readable size, and
  shrinking them until they do gives seven unreadable tabs.
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
4. **Phase 4 (done)** — six leaders, 16 conditional events with timed
   consequences, the run log, a win condition, scoring and per-leader bests.
5. **Phase 5** — the balance harness, open revolt, patch fatigue, the art
   pass, save/load hardening; then national projects and the marginal cost of
   development for the late game, and an adaptive synthesised score with
   haptics and a mixer.
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
  changes, and add the new container to `State.isUsable()` in the same commit —
  the sim writes into these without checking, so a save missing one crashes on
  the first tick rather than being refused at load.
- A control makes a sound from `View.onTap` and nowhere else. It opts up or out
  with `data-sfx="<cue>"` / `data-sfx="none"`; "none" means the *caller* will
  decide, which is what every button whose outcome the simulation determines
  uses (a confirmation and a refusal are different sounds for the same tap).
- A new system that changes the simulation should declare `mods`/`flags` and go
  through `src/modifiers.js`, not add a branch to `src/sim.js`. If it needs a
  key the sim doesn't read yet, add the key to `Mods.READ_KEYS` in the same
  commit as the line that reads it.
- Any mutation of tech, appointees, policies or event effects must bump
  `state.modVersion` (the sim's `touch()`), or the modifier cache will keep
  serving the old government.
- A run only exists once a leader has been chosen. `State.save()` refuses a
  state whose `started` is false — without that guard the provisional world
  built at boot gets persisted by the `pagehide` hook and the leader screen is
  skipped on the next load.
- Append a `DEVLOG.md` entry at the end of every session.
- Record every balance change in `BALANCE.md` with the reasoning.
