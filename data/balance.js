/* ============================================================================
 * data/balance.js — THE ONLY PLACE BALANCE NUMBERS LIVE.
 * ----------------------------------------------------------------------------
 * Every cost, rate, curve and threshold in the game is a value in this file.
 * Game logic (src/sim.js) reads these numbers; it never hardcodes them.
 *
 * Why this matters: balancing a game like this means changing a number,
 * playing for 10 minutes, changing it again — hundreds of times. If the
 * numbers are scattered through the logic, every tuning pass risks breaking
 * the simulation. Here, tuning is a one-line edit in a file with no logic in
 * it at all, and every change is easy to record in BALANCE.md.
 *
 * Units: one TICK = one in-game DAY, everywhere. Anything named "PerDay" is
 * applied once per tick.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  /* The unrest line, in one place. It is both the threshold the Mandate
   * pressure rule uses and the condition on the emergency-relief action, and
   * those two must never drift apart — a player who sees a region cross the
   * line should get the crisis tool at exactly that moment. */
  var UNSTABLE_BELOW = 35;

  Mandate.BALANCE = {
    /* Bumped when the meaning of these numbers changes enough that old saves
     * would be balanced differently. Recorded into saves for debugging. */
    balanceVersion: 4,

    /* Actions carry the phase that made them real. Anything above this number
     * is authored-but-not-live, so future phases can land their data before
     * their logic without the buttons going live early. */
    implementedPhase: 4,

    time: {
      /* Real milliseconds per simulated day, per speed setting.
       * 0 = paused. Lower = faster. A ~45-60 min run at 1x is roughly
       * 3000 days, i.e. about 8 in-game years. */
      msPerTick: { 0: 0, 1: 900, 2: 450 },
      startDate: { year: 2027, month: 1, day: 1 },
      /* If the phone sleeps or the tab is backgrounded, never simulate more
       * than this many ticks in one frame — otherwise the game "fast-forwards"
       * unfairly and the frame takes seconds. */
      maxCatchUpTicks: 5,
    },

    resources: {
      treasury: { start: 250 },

      /* POLITICAL CAPITAL — the currency of consent.
       * Earned purely from how well the country is governed: national
       * stability above the pivot pays in, below it pays nothing. A leader
       * presiding over unrest has no political capital to spend, which is
       * exactly when they most want it. Capped, because goodwill is not a
       * bank account — you cannot bank a decade of calm and cash it in at the
       * end of the term. */
      politicalCapital: {
        start: 20,
        perDayBase: 0.04,
        pivotStability: 50,
        perStabilityPointPerDay: 0.004,
        max: 100,
        /* Used ONLY under the `pcFromDevelopment` flag (Technocratic
         * Ministries), which replaces the stability term above with this one.
         * At the starting national development of 267 it pays 0.107/day —
         * deliberately a touch better than a well-run country's stability
         * term, because by tier 3 you have spent 24 PC and 360 days on it. */
        perDevelopmentPerDay: 0.0004,
      },

      /* MANPOWER — the people you can call on.
       * Comes from the population and development of regions you actually
       * hold: an unstable region recruits badly, so the same stability that
       * pays the Treasury also fills the barracks. Capped by national
       * development for the same reason Political Capital is capped. */
      manpower: {
        start: 12,
        perRegionPerDay: 0.002,
        perDevelopmentPerDay: 0.0004,
        capBase: 10,
        capPerDevelopment: 0.06,
      },
    },

    mandate: {
      start: 100,
      max: 100,
      /* Baseline drift: the honeymoon always ends. This is the "draining clock"
       * that makes every spending decision a tradeoff, and on its own it sets
       * the length of a term: 100 / 0.03 = ~3300 days, about 50 minutes. */
      decayPerDay: 0.03,

      /* --- approval: the reward for actually governing well ---------------
       * A country visibly doing better buys its leader patience. Above
       * `approvalPivot` national stability, the baseline decay slows, down to
       * `decayFloorPerDay` and no further.
       *
       * Mandate is still NEVER recoverable — this only ever slows the drain,
       * so the run stays a strict clock and you can't bank a good decade.
       * (BALANCE.md asked this question outright; this is the answer.)
       *
       * It exists because without it the clock punished the one thing the
       * game is about. Holding the country together with Public Works costs
       * no Mandate, so a player who developed NOTHING outlived one who
       * rebuilt the country, every time — investing was pure clock-loss.
       * Now development buys back the time it costs, but only if it actually
       * makes the country better. */
      approvalPivot: 50,
      decayReliefPerStabilityPoint: 0.0012,
      decayFloorPerDay: 0.012,
      /* Unrest is what actually kills a government. Two terms, deliberately:
       * a flat cost the moment a region crosses the line (so the threshold is
       * a visible cliff the player can steer away from) plus a per-point cost
       * for how far below it has fallen (so a region in free-fall gets worse,
       * not merely bad). */
      decayPerUnstableRegionPerDay: 0.008,
      decayPerUnstablePointPerDay: 0.0006,
      /* --- THE TERM: the win condition ------------------------------------
       * Phase 4 gives the clock a far end as well as a near one. Survive to
       * `termDays` with Mandate left and the term is COMPLETED — the run is
       * won, not merely not-yet-lost.
       *
       * 3,650 days is ten in-game years, and ~55 minutes at 1x: the top of the
       * 45-60 minute target window. It sits deliberately ABOVE the ~3,330 days
       * that baseline decay alone gives you, so a term cannot be waited out.
       * The only way to reach the end is to keep national stability above
       * `approvalPivot` for long enough that approval buys back the difference
       * — i.e. the win condition is "govern well", expressed as a number
       * rather than as a rule. */
      termDays: 3650,
      unstableBelow: UNSTABLE_BELOW,
      /* Used ONLY under the `austerityHitsMandate` flag (Deficit Financing).
       * The unpaid SHARE of the day's bill is charged here instead of eating
       * development and stability. At a full shortfall that is 0.08/day on
       * top of the baseline — roughly tripling the clock, survivable for a
       * few hundred days and fatal as a way of life. */
      austerityPerShortfallPerDay: 0.08,
      gameOverAt: 0,
      /* Meter colour thresholds: green at or above `healthyAbove`, amber
       * between, red below `warnBelow`. Purely a UI signal, but it lives here
       * because where the danger line sits is a tuning decision, not a layout
       * decision. */
      healthyAbove: 60,
      warnBelow: 30,
    },

    region: {
      /* Stability and development are both 0-100 scales. */
      min: 0,
      max: 100,
      /* Output (the abstract "productive activity" of a region) is derived, not
       * stored as an independent stat:
       *   output = (base + development * perDevelopment) * stabilityFactor
       * A rich but burning region produces very little — that is the whole
       * point of the stability/development tension. */
      output: {
        base: 0.25,
        perDevelopment: 0.03,
        /* stabilityFactor ramps from `atZeroStability` (stability 0) to 1.0
         * (stability 100), so stability multiplies everything you build. */
        atZeroStability: 0.25,
      },
      /* Treasury gained per point of national output per day. */
      treasuryPerOutputPerDay: 1.0,

      /* --- NATURAL STABILITY: the level a region settles at ---------------
       * This is the spine of Phase 2. A region does not hold whatever
       * stability you last pushed it to; it drifts toward a natural level set
       * by what you have actually built there:
       *
       *   natural = base + development x perDevelopment
       *                  + garrison
       *                  - unrest next door
       *                  - austerity
       *
       * It is what makes the three region actions different IN KIND rather
       * than differently sized:
       *
       *   Public Works pushes stability ABOVE the natural level — and it
       *     washes back out. A real fix for today, never a permanent one.
       *   Garrison raises the natural level itself, but only for as long as
       *     you keep paying for it.
       *   Invest raises the natural level permanently. It is the ONLY thing
       *     that does, which is what makes development the long game and what
       *     stops "stabilise once, then idle" from being the winning move.
       *
       * `base` sits deliberately BELOW `mandate.unstableBelow`: an
       * undeveloped, ungarrisoned region does not merely stagnate, it settles
       * into unrest and starts costing Mandate. Doing nothing has to lose
       * ground, or waiting becomes the optimal play and the game turns into a
       * spreadsheet. */
      naturalStability: {
        base: 26,
        /* Development 9 reaches the unrest line and development 71 reaches
         * 100. Fitted against the starting map so the country opens slightly
         * BELOW its natural level everywhere — a gentle nationwide slide the
         * player has time to answer — while the three frontier regions
         * (development 5-8) sit under the line from day one and start costing
         * Mandate immediately. That fit is the whole "garrison it now or
         * develop it properly" decision, so it is the first number to reach
         * for when tuning. */
        perDevelopment: 1.05,
        /* Roughly what 17 points of development would buy, rented by the day
         * instead of owned. */
        garrisonBonus: 18,
        /* Unrest is contagious: a crisis left alone eats outward across the
         * map instead of sitting still. */
        perUnstableNeighbour: -4,
        /* Applied in proportion to the share of the upkeep bill that went
         * unpaid, so austerity is a slope, not a cliff. */
        austerityPenalty: -25,
      },
      /* How much of the gap to the natural level a region closes per day.
       * At 0.004 a Public Works (+8) has largely washed out after ~400 days,
       * which is what puts the player back in the room. */
      reversionPerDay: 0.004,

      /* Unconditional decay of development. Deliberately 0: infrastructure
       * does not rot on a schedule, it rots when you stop paying for it, and
       * `upkeep` below is that rule. The knob stays so a future phase (or a
       * leader handicap) can turn it on without a code change. */
      developmentDecayPerDay: 0,

      /* --- upkeep: the sink that stops Treasury piling up -----------------
       * Everything you have built costs money to keep standing, charged every
       * day before the player can spend anything.
       *
       * The number matters more than it looks. A point of development earns
       * `output.perDevelopment` (0.03) x stabilityFactor per day and costs
       * 0.018 per day to hold, so investment only pays back above a
       * stabilityFactor of 0.6 — i.e. stability 47, just under where the
       * country starts. Developing a region you have not stabilised actively
       * loses money. That single relationship is what makes stability the
       * first move, and it is also what stops the late game running away:
       * every point built raises the bill forever. */
      upkeep: {
        treasuryPerDevelopmentPerDay: 0.018,
        /* When the Treasury cannot cover the bill, the UNPAID FRACTION of it
         * drives this. It is the "development decays without upkeep" rule,
         * and it is why bankruptcy is a death spiral rather than a plateau:
         * unpaid regions crumble, crumbling regions earn less, and the bill
         * you cannot pay stays the same size. (Austerity hits stability too,
         * via `naturalStability.austerityPenalty` above.) */
        unpaidDevelopmentDecayPerDay: 0.05,
      },

      /* --- garrisons: the standing commitment ------------------------------
       * A garrison is the only thing in the game that holds a region steady
       * on its own, and it is deliberately expensive in all three currencies:
       * Manpower to raise, Treasury every single day to keep, and Mandate
       * because nobody likes soldiers in the streets. */
      garrison: {
        treasuryUpkeepPerDay: 0.5,
      },
    },

    /* Region panel actions. Each is fully described by data: what it costs,
     * what it changes, and what has to be true of the region first. The UI
     * builds buttons from this list and greys out the ones whose `requires`
     * are unmet, so adding an action later is a data edit plus one case in
     * src/sim.js.
     *
     * `requires` keys understood by the sim:
     *   garrisoned      — the region must (not) have a garrison
     *   stabilityBelow  — the region must be under this stability */
    actions: {
      invest: {
        id: 'invest',
        label: 'Invest',
        blurb: 'Fund local industry. Raises Development — and the upkeep bill.',
        cost: { treasury: 120 },
        effect: { development: 6 },
        /* Deliberately small. Development is the only permanent fix in the
         * game, and at 0.5 the clock punished using it: a player who built
         * nothing outlived one who rebuilt the country. */
        mandateCost: 0.2,
        phase: 1,
      },
      publicWorks: {
        id: 'publicWorks',
        label: 'Public Works',
        blurb: 'Roads, clinics, visible wins. Raises Stability.',
        cost: { treasury: 80 },
        effect: { stability: 8 },
        mandateCost: 0,
        phase: 1,
      },
      garrison: {
        id: 'garrison',
        label: 'Garrison',
        blurb: 'Station troops. Holds the region steady, costs you daily.',
        cost: { treasury: 60, manpower: 6 },
        effect: { stability: 14, garrisoned: true },
        /* Was 3 through Phases 2-3, and that made garrisons a trap: BALANCE.md
         * logged a harness sweep where every extra garrison shortened the run
         * (0 -> 3,350 days, 5 -> 2,295). 3 Mandate is a hundred days of
         * baseline decay for a measure that is supposed to be TEMPORARY
         * triage. At 1.5 a garrison is a tool you reach for in a crisis
         * instead of one you regret, and the Marshal — whose entire identity
         * is holding provinces — becomes playable. */
        mandateCost: 1.5,
        requires: { garrisoned: false },
        phase: 2,
      },
      withdraw: {
        id: 'withdraw',
        label: 'Withdraw Troops',
        blurb: 'Stand the garrison down. Stops the upkeep, loosens the grip.',
        cost: {},
        refund: { manpower: 3 },
        effect: { stability: -8, garrisoned: false },
        mandateCost: 0,
        requires: { garrisoned: true },
        phase: 2,
      },
      relief: {
        id: 'relief',
        label: 'Emergency Relief',
        blurb: 'Spend your standing to pull a region back from the brink.',
        cost: { politicalCapital: 6, treasury: 40 },
        effect: { stability: 18 },
        mandateCost: 0,
        requires: { stabilityBelow: UNSTABLE_BELOW },
        phase: 2,
      },
    },

    /* --- PHASE 3: RESEARCH ------------------------------------------------
     * The queue spends one resource the player cannot earn faster by playing
     * better: days. `pointsPerDay` is deliberately 1, so a node's `days` in
     * data/tech.js reads as literal in-game days at the base rate and the
     * tree can be costed by eye against the ~3300-day term.
     *
     * The whole tree is ~4900 days of research against a term of ~3300, and
     * that ratio is the point: nobody finishes it, so a run is a branch
     * choice. Research modifiers (Civil Service, a Scholar minister) move
     * that ratio rather than handing out a bonus. */
    research: {
      pointsPerDay: 1,
      /* Enough to plan a branch ahead, few enough that the queue is a
       * commitment. Political Capital is charged on QUEUEING, not on start,
       * so a long queue is money already spent. */
      queueMax: 4,
    },

    /* --- PHASE 3: APPOINTEES ---------------------------------------------
     * Slots are the whole design (DESIGN.md 2.4): hiring is a continuing
     * reassignment problem, not a shopping trip. Two of each to start, and
     * two tech nodes that each add one — so a fully invested government runs
     * three ministers and three governors out of sixteen regions.
     *
     * Salary is per DAY and is billed with the upkeep bill, which means an
     * over-staffed government goes bankrupt the same way an over-built one
     * does. The hiring fee is a multiple of the salary, so a cheap flawed
     * candidate is cheap to take on as well as to keep. */
    appointees: {
      ministerSlots: 2,
      governorSlots: 2,
      /* The candidate pool. It refreshes on a timer rather than on demand, so
       * "hire nobody and wait for a perfect Technocrat" costs real days. */
      initialPool: 4,
      poolMax: 5,
      refreshEveryDays: 120,
      /* Every candidate's salary: this, plus each trait's contribution
       * (drawbacks contribute a NEGATIVE amount — see data/traits.js). */
      salaryBase: 0.40,
      /* One-off Treasury cost to hire, as a multiple of the daily salary:
       * ~3 months of wages up front. */
      hiringFeeDays: 90,
      /* Chance a generated candidate carries a drawback. A little over half,
       * because a pool of clean candidates makes hiring a formality. */
      drawbackChance: 0.55,
    },

    /* --- PHASE 4: EVENTS -------------------------------------------------
     * The scheduler's job is to make the country feel like it has its own
     * agenda without ever feeling random. Three rules do that:
     *
     *   - events are WEIGHTED and CONDITIONAL, so what can happen depends on
     *     the state of the country (see data/events.js);
     *   - a global cooldown stops two crises landing back to back;
     *   - `graceDays` keeps the opening quiet, so the player learns the board
     *     before it starts arguing with them.
     *
     * The chance is per day and small. At 0.009 the expected gap is the
     * 120-day cooldown plus ~110 days of waiting, and the harness measures a
     * full 3,650-day term at 14 events — one roughly every four minutes of
     * real play. Often enough to shape a run, rare enough that each one is an
     * occasion rather than an interruption. */
    events: {
      chancePerDay: 0.009,
      globalCooldownDays: 120,
      graceDays: 200,
      /* An event pauses the game. It has to: a branching choice the player
       * has to read while regions drift is not a choice, it is a reflex test.
       * Speed is restored when they answer. */
      pauseOnFire: true,
      /* Temporary modifiers an event choice can leave behind live in
       * `state.effects` and expire on their own. This caps how many can be
       * running at once, purely so a pathological data file can't unbound the
       * modifier table. */
      maxActiveEffects: 12,
    },

    /* --- PHASE 4: THE RUN LOG --------------------------------------------
     * The Events tab doubles as the run log. Entries are cheap (a day, a kind
     * and a line of text) but a 3,650-day run would still accumulate a few
     * hundred, and they go into every save. Oldest entries are dropped past
     * this cap — the recent past is what a player actually reads back. */
    log: {
      maxEntries: 120,
    },

    /* --- PHASE 4: SCORING -------------------------------------------------
     * One number for a whole term, so runs can be compared and a leader can
     * have a best.
     *
     * The weights encode what the game thinks a good term IS, so they are
     * worth arguing about: development is the thing you can only get by
     * spending the clock on it, so it pays most; days are worth little each
     * because surviving is the floor, not the achievement; and `calmBonus`
     * multiplies the lot by how much of the term was free of unrest, which is
     * what stops a huge, permanently-burning country outscoring a smaller
     * country that was actually governed.
     *
     * `termCompletedBonus` is large on purpose: finishing the term is the win
     * condition, and a won run should never score below a lost one. */
    scoring: {
      perDaySurvived: 1,
      perDevelopmentBuilt: 6,
      perStabilityPoint: 40,
      perTechCompleted: 120,
      termCompletedBonus: 6000,
      /* Final score is multiplied by (calmFloor + (1 - calmFloor) * calm),
       * where `calm` is the share of the term with no region in unrest. A
       * term spent entirely in crisis keeps `calmFloor` of its score. */
      calmFloor: 0.35,
      bestScoresKey: 'mandate:best',
    },

    /* --- PHASE 3: POLICIES ------------------------------------------------
     * A policy is a posture, not a purchase: exactly one option per category
     * is always active. The cooldown is the real cost — without it the
     * optimal play is to swap to whatever suits this minute, which turns a
     * standing decision into a per-frame one. */
    policies: {
      cooldownDays: 240,
    },

    /* Stability bands drive the map colours. Checked top-down: the first band
     * whose `min` the region meets wins. Keeping this in data means re-theming
     * the map is a data edit. */
    stabilityBands: [
      { id: 'secure',   min: 80, label: 'Secure' },
      { id: 'stable',   min: 60, label: 'Stable' },
      { id: 'strained', min: 40, label: 'Strained' },
      { id: 'unrest',   min: 20, label: 'Unrest' },
      { id: 'crisis',   min: 0,  label: 'Crisis' },
    ],
  };
})(window.Mandate = window.Mandate || {});
