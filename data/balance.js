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

  Mandate.BALANCE = {
    /* Bumped when the meaning of these numbers changes enough that old saves
     * would be balanced differently. Recorded into saves for debugging. */
    balanceVersion: 1,

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
      /* PHASE 2: these two are displayed but not yet simulated. */
      politicalCapital: { start: 20 },
      manpower: { start: 12 },
    },

    mandate: {
      start: 100,
      max: 100,
      /* Baseline drift: the honeymoon always ends. This is the "draining clock"
       * that makes every spending decision a tradeoff. */
      decayPerDay: 0.02,
      /* PHASE 2: unstable regions add to the decay, and hitting 0 ends the run.
       * Kept here so the tuning knob already has a home. */
      decayPerUnstableRegionPerDay: 0.01,
      unstableBelow: 35,
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
      /* PHASE 2: drift toward an equilibrium, unrest, neglect decay.
       * Declared now so Phase 2 is a sim change, not a data change. */
      stabilityDriftPerDay: 0,
      developmentDecayPerDay: 0,
    },

    /* Region panel actions. Each is fully described by data: what it costs,
     * what it changes, and how long the effect takes. The UI builds buttons
     * from this list, so adding an action later is a data edit plus one case
     * in src/sim.js. */
    actions: {
      invest: {
        id: 'invest',
        label: 'Invest',
        blurb: 'Fund local industry. Raises Development.',
        cost: { treasury: 120 },
        effect: { development: 6 },
        mandateCost: 0.5,
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
        blurb: 'Station troops. Big stability gain, unpopular.',
        cost: { treasury: 60, manpower: 2 },
        effect: { stability: 14 },
        mandateCost: 3,
        phase: 2, /* locked until Manpower is simulated */
      },
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
