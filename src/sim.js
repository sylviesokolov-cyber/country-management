/* ============================================================================
 * src/sim.js — THE SIMULATION. Pure logic, zero DOM.
 * ----------------------------------------------------------------------------
 * Everything that changes the world happens here, and only here:
 *
 *   Sim.tick(state)                advance the world by one day
 *   Sim.applyAction(state, ...)    a player decision
 *
 * If you can't test it by calling it with a plain object and checking numbers,
 * it doesn't belong in this file.
 *
 * All numbers come from Mandate.BALANCE. If you find yourself typing a number
 * into this file, it probably wants to be a balance value instead.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Sim = {};
  var clamp = Mandate.Util.clamp;

  /* ------------------------------------------------------------------------
   * DERIVED VALUES
   * Things computed from state rather than stored independently. Keeping these
   * as functions (not stored fields) means they can never drift out of sync
   * with the values they're derived from.
   * ---------------------------------------------------------------------- */

  /**
   * How much a region produces per day.
   * Development sets the ceiling; stability decides how much of that ceiling
   * you actually collect. A rich province in crisis pays almost nothing —
   * that is the central economic tension of the game.
   */
  Sim.regionOutput = function (region) {
    var o = Mandate.BALANCE.region.output;
    var potential = o.base + region.development * o.perDevelopment;
    var stabilityFactor = o.atZeroStability +
      (1 - o.atZeroStability) * (region.stability / Mandate.BALANCE.region.max);
    return potential * stabilityFactor;
  };

  /** Which colour band a region falls into (drives the map fill). */
  Sim.stabilityBand = function (region) {
    var bands = Mandate.BALANCE.stabilityBands;
    for (var i = 0; i < bands.length; i++) {
      if (region.stability >= bands[i].min) return bands[i];
    }
    return bands[bands.length - 1];
  };

  /* ------------------------------------------------------------------------
   * THE TICK
   * One call = one in-game day. The loop may call this several times in a
   * frame (catching up) or not at all (paused) — so it must never assume
   * anything about real time.
   * ---------------------------------------------------------------------- */
  /**
   * Recompute every derived value WITHOUT advancing time.
   * Used when a game is first loaded so the HUD shows real numbers before the
   * first tick — advancing a day just to populate the display would silently
   * cost the player a day on every reload.
   */
  Sim.refresh = function (state) {
    var nationalOutput = 0;
    for (var i = 0; i < state.regions.length; i++) {
      state.regions[i].output = Sim.regionOutput(state.regions[i]);
      nationalOutput += state.regions[i].output;
    }
    state.derived.nationalOutput = nationalOutput;
    state.derived.treasuryPerDay = nationalOutput * Mandate.BALANCE.region.treasuryPerOutputPerDay;
    state.derived.mandatePerDay = -mandateLossPerDay(state);
    state.derived.nationalStability = averageStability(state);
  };

  /** Mean stability across every region — the one-number health of the country. */
  function averageStability(state) {
    var total = 0;
    for (var i = 0; i < state.regions.length; i++) total += state.regions[i].stability;
    return total / state.regions.length;
  }

  /** Baseline decay plus a penalty for every region in unrest. */
  function mandateLossPerDay(state) {
    var B = Mandate.BALANCE;
    var unstable = 0;
    for (var i = 0; i < state.regions.length; i++) {
      if (state.regions[i].stability < B.mandate.unstableBelow) unstable += 1;
    }
    return B.mandate.decayPerDay + unstable * B.mandate.decayPerUnstableRegionPerDay;
  }

  Sim.tick = function (state) {
    if (state.gameOver) return;

    var B = Mandate.BALANCE;
    state.day += 1;

    /* --- 1. Regions produce ------------------------------------------- */
    var nationalOutput = 0;
    for (var i = 0; i < state.regions.length; i++) {
      var region = state.regions[i];

      /* PHASE 2 will add drift here: neglected regions slide toward unrest,
       * garrisoned ones recover, development decays without upkeep. The
       * balance knobs (stabilityDriftPerDay, developmentDecayPerDay) already
       * exist and are currently 0, so this is a two-line change later. */
      region.stability = clamp(
        region.stability + B.region.stabilityDriftPerDay, B.region.min, B.region.max);
      region.development = clamp(
        region.development - B.region.developmentDecayPerDay, B.region.min, B.region.max);

      region.output = Sim.regionOutput(region);
      nationalOutput += region.output;
    }

    /* --- 2. Treasury ---------------------------------------------------- */
    var treasuryPerDay = nationalOutput * B.region.treasuryPerOutputPerDay;
    state.resources.treasury += treasuryPerDay;
    state.stats.treasuryEarned += treasuryPerDay;

    /* PHASE 2: Political Capital and Manpower gain their own sources and
     * sinks here. They are displayed but static for now. */

    /* --- 3. Mandate decay ----------------------------------------------- */
    /* The clock the player is always fighting. Baseline decay is constant;
     * unstable regions make it worse. */
    var mandateLoss = mandateLossPerDay(state);

    state.mandate = clamp(state.mandate - mandateLoss, 0, B.mandate.max);

    /* --- 4. Cache derived totals for the UI ----------------------------- */
    state.derived.nationalOutput = nationalOutput;
    state.derived.treasuryPerDay = treasuryPerDay;
    state.derived.mandatePerDay = -mandateLoss;
    state.derived.nationalStability = averageStability(state);

    /* --- 5. Lose condition ---------------------------------------------- */
    /* PHASE 2 turns this into a real game-over screen. The check lives here,
     * in the sim, so the UI never has to decide whether the run is over. */
    if (state.mandate <= B.mandate.gameOverAt) {
      state.gameOver = true;
      state.gameOverReason = 'Your mandate has run out.';
      state.speed = 0;
    }
  };

  /* ------------------------------------------------------------------------
   * PLAYER ACTIONS
   * ---------------------------------------------------------------------- */

  /**
   * Can the player afford this action right now?
   * Returns { ok: true } or { ok: false, reason: '...' } so the UI can both
   * disable the button AND explain why — checking affordability in one place
   * keeps the button and the effect from ever disagreeing.
   */
  Sim.canAfford = function (state, actionId) {
    var action = Mandate.BALANCE.actions[actionId];
    if (!action) return { ok: false, reason: 'Unknown action' };
    if (action.phase > 1) return { ok: false, reason: 'Phase ' + action.phase };
    if (state.gameOver) return { ok: false, reason: 'Run over' };

    for (var key in action.cost) {
      if (!Object.prototype.hasOwnProperty.call(action.cost, key)) continue;
      if (state.resources[key] < action.cost[key]) {
        return { ok: false, reason: 'Not enough ' + LABELS[key] };
      }
    }
    return { ok: true };
  };

  var LABELS = {
    treasury: 'Treasury',
    politicalCapital: 'Political Capital',
    manpower: 'Manpower',
  };
  Sim.resourceLabel = function (key) { return LABELS[key] || key; };

  /**
   * Apply a region action. Returns true if it happened.
   * The sim, not the UI, decides whether an action is legal.
   */
  Sim.applyAction = function (state, regionId, actionId) {
    var check = Sim.canAfford(state, actionId);
    if (!check.ok) return false;

    var region = Mandate.State.regionById(state, regionId);
    if (!region) return false;

    var action = Mandate.BALANCE.actions[actionId];
    var B = Mandate.BALANCE;

    /* Pay */
    for (var key in action.cost) {
      if (!Object.prototype.hasOwnProperty.call(action.cost, key)) continue;
      state.resources[key] -= action.cost[key];
    }
    if (action.mandateCost) {
      state.mandate = clamp(state.mandate - action.mandateCost, 0, B.mandate.max);
    }

    /* Apply */
    if (action.effect.development) {
      region.development = clamp(
        region.development + action.effect.development, B.region.min, B.region.max);
    }
    if (action.effect.stability) {
      region.stability = clamp(
        region.stability + action.effect.stability, B.region.min, B.region.max);
    }

    region.output = Sim.regionOutput(region);
    region.actionsTaken += 1;
    state.stats.actionsTaken += 1;
    return true;
  };

  Mandate.Sim = Sim;
})(window.Mandate = window.Mandate || {});
