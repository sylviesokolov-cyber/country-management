/* ============================================================================
 * src/sim.js — THE SIMULATION. Pure logic, zero DOM.
 * ----------------------------------------------------------------------------
 * Everything that changes the world happens here, and only here:
 *
 *   Sim.tick(state)                advance the world by one day
 *   Sim.applyAction(state, ...)    a player decision
 *   Sim.refresh(state)             recompute derived values, no time passes
 *
 * If you can't test it by calling it with a plain object and checking numbers,
 * it doesn't belong in this file.
 *
 * All numbers come from Mandate.BALANCE. If you find yourself typing a number
 * into this file, it probably wants to be a balance value instead.
 *
 * ---------------------------------------------------------------------------
 * HOW ONE DAY WORKS (Phase 2). The order matters and is deliberate:
 *
 *   1. Every region produces, and every region bills you for its upkeep.
 *   2. The upkeep is charged. If the Treasury can't cover it, the unpaid
 *      FRACTION becomes austerity, which eats development and stability.
 *   3. Political Capital and Manpower accrue from how the country is doing.
 *   4. Stability and development drift — computed for EVERY region against
 *      the same start-of-day snapshot, then applied. (Computing and applying
 *      region by region would let r1's slide bleed into r2 on the same day
 *      but not the reverse, which makes the map order matter. It must not.)
 *   5. Mandate decays: a baseline, plus pressure from every region in unrest.
 *   6. Derived totals are cached for the UI.
 *   7. The lose condition is checked.
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
    return (o.base + region.development * o.perDevelopment) * Sim.stabilityFactor(region);
  };

  /**
   * The 0..1 multiplier stability applies to everything a region gives you —
   * output, and recruitment. One curve, used everywhere, so "stabilise first"
   * is a single rule rather than a list of special cases.
   */
  Sim.stabilityFactor = function (region) {
    var o = Mandate.BALANCE.region.output;
    return o.atZeroStability +
      (1 - o.atZeroStability) * (region.stability / Mandate.BALANCE.region.max);
  };

  /**
   * What a region costs the Treasury every day just to keep as it is.
   * This is the sink that stops Treasury piling up: it scales with everything
   * the player has built, so a bigger country is a more expensive one.
   */
  Sim.regionUpkeep = function (region) {
    var R = Mandate.BALANCE.region;
    return region.development * R.upkeep.treasuryPerDevelopmentPerDay +
      (region.garrisoned ? R.garrison.treasuryUpkeepPerDay : 0);
  };

  /** Which colour band a region falls into (drives the map fill). */
  Sim.stabilityBand = function (region) {
    var bands = Mandate.BALANCE.stabilityBands;
    for (var i = 0; i < bands.length; i++) {
      if (region.stability >= bands[i].min) return bands[i];
    }
    return bands[bands.length - 1];
  };

  /** Is this region below the unrest line — the one threshold that matters? */
  Sim.isUnstable = function (region) {
    return region.stability < Mandate.BALANCE.mandate.unstableBelow;
  };

  /* ------------------------------------------------------------------------
   * ADJACENCY
   * The neighbour lists live in data/map-geometry.js, which knows nothing
   * about the game — it just happens to be the file that knows which regions
   * touch. We read it once into an index here rather than scanning it every
   * tick, and we SYMMETRISE it: if a hand-drawn map ever lists r3 next to r4
   * but not r4 next to r3, unrest would spread one way only, which would be a
   * bug nobody would think to look for in a geometry file.
   * ---------------------------------------------------------------------- */
  var adjacency = null;

  function buildAdjacency() {
    var index = Object.create(null);
    var shapes = (Mandate.MAP_GEOMETRY && Mandate.MAP_GEOMETRY.regions) || [];

    shapes.forEach(function (shape) {
      if (!index[shape.id]) index[shape.id] = [];
    });

    shapes.forEach(function (shape) {
      (shape.neighbours || []).forEach(function (otherId) {
        if (!index[otherId]) index[otherId] = [];
        if (index[shape.id].indexOf(otherId) === -1) index[shape.id].push(otherId);
        if (index[otherId].indexOf(shape.id) === -1) index[otherId].push(shape.id);
      });
    });

    return index;
  }

  Sim.neighboursOf = function (regionId) {
    if (!adjacency) adjacency = buildAdjacency();
    return adjacency[regionId] || [];
  };

  /** How many of this region's neighbours are currently below the unrest line. */
  Sim.unstableNeighbours = function (state, region) {
    var ids = Sim.neighboursOf(region.id);
    var count = 0;
    for (var i = 0; i < ids.length; i++) {
      var neighbour = Mandate.State.regionById(state, ids[i]);
      if (neighbour && Sim.isUnstable(neighbour)) count += 1;
    }
    return count;
  };

  /* ------------------------------------------------------------------------
   * DRIFT — what happens to a region when you are not looking at it.
   * ---------------------------------------------------------------------- */

  /**
   * The stability level this region settles at if left alone — what it is
   * worth, as opposed to what you last pushed it to.
   *
   *   base                 below the unrest line: nothing is self-sustaining
   *   + development        the only PERMANENT way to raise it
   *   + garrison           raised only while you keep paying for it
   *   - neighbour unrest   a crisis next door is contagious
   *   - austerity          an unpaid country is an angry one
   *
   * `shortfallFraction` is 0..1: the share of today's upkeep bill that the
   * Treasury could not cover.
   *
   * Exposed because the region panel draws it as a marker on the stability
   * bar. A player has to be able to see where a region is HEADED, not just
   * where it is — otherwise every slide into unrest is a surprise.
   */
  Sim.naturalStability = function (state, region, shortfallFraction) {
    var R = Mandate.BALANCE.region;
    var N = R.naturalStability;
    var level = N.base +
      region.development * N.perDevelopment +
      (region.garrisoned ? N.garrisonBonus : 0) +
      Sim.unstableNeighbours(state, region) * N.perUnstableNeighbour +
      (shortfallFraction || 0) * N.austerityPenalty;
    return clamp(level, R.min, R.max);
  };

  /**
   * Stability change per day: a region closes a fixed share of the gap
   * between where it is and where it belongs. Above its natural level it
   * slides back down, below it it recovers — which is why Public Works is a
   * loan against the future and Invest is the only thing that pays it off.
   */
  Sim.stabilityTrend = function (state, region, shortfallFraction) {
    var R = Mandate.BALANCE.region;
    return (Sim.naturalStability(state, region, shortfallFraction) - region.stability) *
      R.reversionPerDay;
  };

  /** Development change per day. Only austerity takes it away. */
  Sim.developmentTrend = function (region, shortfallFraction) {
    var R = Mandate.BALANCE.region;
    return -R.developmentDecayPerDay -
      (shortfallFraction || 0) * R.upkeep.unpaidDevelopmentDecayPerDay;
  };

  /* ------------------------------------------------------------------------
   * NATIONAL RATES
   * ---------------------------------------------------------------------- */

  /** Mean stability across every region — the one-number health of the country. */
  function averageStability(state) {
    var total = 0;
    for (var i = 0; i < state.regions.length; i++) total += state.regions[i].stability;
    return total / state.regions.length;
  }

  function totalDevelopment(state) {
    var total = 0;
    for (var i = 0; i < state.regions.length; i++) total += state.regions[i].development;
    return total;
  }

  /**
   * Political Capital per day. Earned from governing well and nothing else:
   * above the pivot stability it accrues, below it there is none to be had.
   * That is the point — the leader in trouble is the one who cannot buy their
   * way out of it.
   */
  Sim.politicalCapitalPerDay = function (state) {
    var P = Mandate.BALANCE.resources.politicalCapital;
    var rate = P.perDayBase +
      (averageStability(state) - P.pivotStability) * P.perStabilityPointPerDay;
    return rate > 0 ? rate : 0;
  };

  /**
   * Manpower per day. Recruited from the population of regions you actually
   * hold, so an unstable region contributes little — the same stability
   * multiplier that gates Treasury gates the barracks too.
   */
  Sim.manpowerPerDay = function (state) {
    var M = Mandate.BALANCE.resources.manpower;
    var total = 0;
    for (var i = 0; i < state.regions.length; i++) {
      var region = state.regions[i];
      total += (M.perRegionPerDay + region.development * M.perDevelopmentPerDay) *
        Sim.stabilityFactor(region);
    }
    return total;
  };

  /** Manpower is people, not savings: a bigger country can hold more of them. */
  Sim.manpowerCap = function (state) {
    var M = Mandate.BALANCE.resources.manpower;
    return M.capBase + totalDevelopment(state) * M.capPerDevelopment;
  };

  /**
   * Hold every resource inside its bounds.
   *
   * Called from BOTH places a resource can rise — the daily tick and a player
   * action that refunds something. Standing a garrison down while Manpower is
   * already at its cap would otherwise push it over, and the next tick would
   * silently clamp the refund away: three units of a scarce resource gone with
   * nothing on screen to explain it.
   */
  function clampResources(state) {
    var B = Mandate.BALANCE;
    var r = state.resources;
    r.treasury = r.treasury < 0 ? 0 : r.treasury;
    r.politicalCapital = clamp(r.politicalCapital, 0, B.resources.politicalCapital.max);
    r.manpower = clamp(r.manpower, 0, Sim.manpowerCap(state));
  }

  /**
   * The baseline Mandate drain, after approval.
   *
   * A country doing visibly well buys its leader patience: above
   * `approvalPivot` stability the drain slows, to `decayFloorPerDay` and no
   * further. It never reverses — Mandate is spent time, and no amount of good
   * government gives a day back.
   */
  Sim.mandateBaselinePerDay = function (state) {
    var M = Mandate.BALANCE.mandate;
    var approval = averageStability(state) - M.approvalPivot;
    var baseline = M.decayPerDay -
      (approval > 0 ? approval * M.decayReliefPerStabilityPoint : 0);
    return baseline < M.decayFloorPerDay ? M.decayFloorPerDay : baseline;
  };

  /**
   * Mandate lost per day: the baseline above, plus, for every region under
   * the unrest line, a flat cost for having crossed it at all and a per-point
   * cost for how far below it has fallen.
   */
  Sim.mandateLossPerDay = function (state) {
    var M = Mandate.BALANCE.mandate;
    var loss = Sim.mandateBaselinePerDay(state);
    for (var i = 0; i < state.regions.length; i++) {
      var region = state.regions[i];
      if (region.stability < M.unstableBelow) {
        loss += M.decayPerUnstableRegionPerDay +
          (M.unstableBelow - region.stability) * M.decayPerUnstablePointPerDay;
      }
    }
    return loss;
  };

  /* ------------------------------------------------------------------------
   * DERIVED CACHE
   * One function, called both by refresh() and at the end of every tick, so
   * the numbers on screen are computed exactly one way. If these two ever
   * diverged, the HUD would disagree with the simulation and the player would
   * be the one to find out.
   * ---------------------------------------------------------------------- */
  function recomputeDerived(state) {
    var B = Mandate.BALANCE;
    var nationalOutput = 0;
    var upkeep = 0;
    var unstable = 0;

    for (var i = 0; i < state.regions.length; i++) {
      var region = state.regions[i];
      region.output = Sim.regionOutput(region);
      region.upkeep = Sim.regionUpkeep(region);
      nationalOutput += region.output;
      upkeep += region.upkeep;
      if (Sim.isUnstable(region)) unstable += 1;
    }

    var gross = nationalOutput * B.region.treasuryPerOutputPerDay;

    /* "Will tomorrow's bill bounce?" — a forecast, not a record of today, so
     * the warning reaches the player while they can still act on it. */
    var austerity = (state.resources.treasury + gross) < upkeep;
    var shortfallFraction = austerity && upkeep > 0
      ? (upkeep - (state.resources.treasury + gross)) / upkeep
      : 0;

    /* Each region's own outlook, for the panel. Computed after the loop above
     * so every region sees the same finished picture of its neighbours. */
    for (var j = 0; j < state.regions.length; j++) {
      var r = state.regions[j];
      r.naturalStability = Sim.naturalStability(state, r, shortfallFraction);
      r.stabilityTrend = Sim.stabilityTrend(state, r, shortfallFraction);
    }

    state.derived.nationalOutput = nationalOutput;
    state.derived.upkeepPerDay = upkeep;
    state.derived.treasuryGrossPerDay = gross;
    state.derived.treasuryPerDay = gross - upkeep;
    state.derived.politicalCapitalPerDay = Sim.politicalCapitalPerDay(state);
    state.derived.manpowerPerDay = Sim.manpowerPerDay(state);
    state.derived.manpowerCap = Sim.manpowerCap(state);
    state.derived.mandatePerDay = -Sim.mandateLossPerDay(state);
    state.derived.nationalStability = averageStability(state);
    state.derived.nationalDevelopment = totalDevelopment(state);
    state.derived.unstableRegions = unstable;
    state.derived.austerity = austerity;
  }

  /**
   * Recompute every derived value WITHOUT advancing time.
   * Used when a game is first loaded so the HUD shows real numbers before the
   * first tick — advancing a day just to populate the display would silently
   * cost the player a day on every reload.
   */
  Sim.refresh = function (state) {
    recomputeDerived(state);
  };

  /* ------------------------------------------------------------------------
   * THE TICK
   * One call = one in-game day. The loop may call this several times in a
   * frame (catching up) or not at all (paused) — so it must never assume
   * anything about real time.
   * ---------------------------------------------------------------------- */
  Sim.tick = function (state) {
    if (state.gameOver) return;

    var B = Mandate.BALANCE;
    var R = B.region;
    var i;
    state.day += 1;

    /* --- 1. Regions produce, and bill you ------------------------------- */
    var nationalOutput = 0;
    var upkeep = 0;
    for (i = 0; i < state.regions.length; i++) {
      state.regions[i].output = Sim.regionOutput(state.regions[i]);
      state.regions[i].upkeep = Sim.regionUpkeep(state.regions[i]);
      nationalOutput += state.regions[i].output;
      upkeep += state.regions[i].upkeep;
    }

    /* --- 2. Treasury in, upkeep out ------------------------------------- */
    var gross = nationalOutput * R.treasuryPerOutputPerDay;
    state.resources.treasury += gross;
    state.stats.treasuryEarned += gross;

    /* Pay what can be paid. What's left unpaid becomes austerity, and
     * austerity is applied to the country below rather than simply written
     * off — a government that stops paying its bills does not get to keep
     * what those bills were holding up. */
    var paid = Math.min(state.resources.treasury, upkeep);
    state.resources.treasury -= paid;
    var shortfallFraction = upkeep > 0 ? (upkeep - paid) / upkeep : 0;

    /* --- 3. Political Capital and Manpower ------------------------------ */
    state.resources.politicalCapital += Sim.politicalCapitalPerDay(state);
    state.resources.manpower += Sim.manpowerPerDay(state);
    clampResources(state);

    /* --- 4. Drift ------------------------------------------------------- */
    /* Computed for every region FIRST, against the same snapshot, then
     * applied. See the header note: doing this in one pass would make unrest
     * spread faster in the direction the regions happen to be listed in. */
    var stabilityDeltas = [];
    var developmentDeltas = [];
    for (i = 0; i < state.regions.length; i++) {
      stabilityDeltas.push(Sim.stabilityTrend(state, state.regions[i], shortfallFraction));
      developmentDeltas.push(Sim.developmentTrend(state.regions[i], shortfallFraction));
    }
    for (i = 0; i < state.regions.length; i++) {
      var region = state.regions[i];
      region.stability = clamp(region.stability + stabilityDeltas[i], R.min, R.max);
      region.development = clamp(region.development + developmentDeltas[i], R.min, R.max);
    }

    /* --- 5. Mandate decay ----------------------------------------------- */
    /* The clock the player is always fighting. Baseline decay is constant;
     * unstable regions make it worse, and the worse they get the faster it
     * goes — which is what turns a neglected corner of the map into a run
     * that ends early. */
    state.mandate = clamp(state.mandate - Sim.mandateLossPerDay(state), 0, B.mandate.max);

    /* --- 6. Cache derived totals for the UI ----------------------------- */
    recomputeDerived(state);
    if (state.derived.unstableRegions > 0) state.stats.daysInUnrest += 1;

    /* --- 7. Lose condition ---------------------------------------------- */
    /* The check lives here, in the sim, so the UI never has to decide whether
     * the run is over — it only has to draw the fact that it is. */
    if (state.mandate <= B.mandate.gameOverAt) {
      state.gameOver = true;
      state.gameOverReason = state.derived.unstableRegions > 0
        ? 'Your mandate ran out with ' + state.derived.unstableRegions +
          ' region' + (state.derived.unstableRegions === 1 ? '' : 's') + ' in unrest.'
        : 'Your mandate ran out. The country was calm; your term was not.';
      state.speed = 0;
    }
  };

  /* ------------------------------------------------------------------------
   * PLAYER ACTIONS
   * ---------------------------------------------------------------------- */

  var LABELS = {
    treasury: 'Treasury',
    politicalCapital: 'Political Capital',
    manpower: 'Manpower',
  };
  Sim.resourceLabel = function (key) { return LABELS[key] || key; };

  /**
   * Would this action actually change the region, or is every one of its
   * effects already clamped out?
   *
   * This exists because of a bug the headless harness found: Invest on a
   * region already at 100 development happily charged 120 Treasury and half a
   * point of Mandate and did nothing at all. An action that cannot change
   * anything must not be sellable — the player would have no way to tell they
   * were being charged for a no-op.
   *
   * A flag change (raising or standing down a garrison) counts as a change on
   * its own, so Withdraw stays available even when its stability penalty is
   * already clamped out at 0.
   */
  function effectWouldApply(region, action) {
    var R = Mandate.BALANCE.region;
    var effect = action.effect || {};

    if (typeof effect.garrisoned === 'boolean' &&
        !!region.garrisoned !== effect.garrisoned) return true;
    if (effect.development &&
        clamp(region.development + effect.development, R.min, R.max) !== region.development) {
      return true;
    }
    if (effect.stability &&
        clamp(region.stability + effect.stability, R.min, R.max) !== region.stability) {
      return true;
    }
    return false;
  }

  /** The most specific "why is this greyed out?" we can give for a no-op. */
  function noEffectReason(action) {
    if (action.effect && action.effect.development) return 'Fully developed';
    if (action.effect && action.effect.stability) return 'Fully stable';
    return 'No effect here';
  }

  /**
   * Can the player take this action on this region right now?
   * Returns { ok: true } or { ok: false, reason: '...' } so the UI can both
   * disable the button AND explain why — checking legality in one place keeps
   * the button and the effect from ever disagreeing.
   *
   * Requirements are checked before costs, because "Already garrisoned" is a
   * more useful thing to read than "Not enough Treasury" when both are true.
   */
  Sim.canAfford = function (state, actionId, regionId) {
    var action = Mandate.BALANCE.actions[actionId];
    if (!action) return { ok: false, reason: 'Unknown action' };
    if (action.phase > Mandate.BALANCE.implementedPhase) {
      return { ok: false, reason: 'Phase ' + action.phase };
    }
    if (state.gameOver) return { ok: false, reason: 'Run over' };

    var region = Mandate.State.regionById(state, regionId);
    if (!region) return { ok: false, reason: 'No region' };

    if (action.requires) {
      if (typeof action.requires.garrisoned === 'boolean' &&
          !!region.garrisoned !== action.requires.garrisoned) {
        return {
          ok: false,
          reason: action.requires.garrisoned ? 'No garrison here' : 'Already garrisoned',
        };
      }
      if (typeof action.requires.stabilityBelow === 'number' &&
          region.stability >= action.requires.stabilityBelow) {
        return { ok: false, reason: 'Only in unrest' };
      }
    }

    if (!effectWouldApply(region, action)) {
      return { ok: false, reason: noEffectReason(action) };
    }

    for (var key in action.cost) {
      if (!Object.prototype.hasOwnProperty.call(action.cost, key)) continue;
      if (state.resources[key] < action.cost[key]) {
        return { ok: false, reason: 'Not enough ' + LABELS[key] };
      }
    }
    return { ok: true };
  };

  /**
   * Apply a region action. Returns true if it happened.
   * The sim, not the UI, decides whether an action is legal.
   */
  Sim.applyAction = function (state, regionId, actionId) {
    if (!Sim.canAfford(state, actionId, regionId).ok) return false;

    var region = Mandate.State.regionById(state, regionId);
    if (!region) return false;

    var action = Mandate.BALANCE.actions[actionId];
    var B = Mandate.BALANCE;
    var key;

    /* Pay */
    for (key in action.cost) {
      if (!Object.prototype.hasOwnProperty.call(action.cost, key)) continue;
      state.resources[key] -= action.cost[key];
    }
    /* Refund (standing a garrison down returns part of the unit) */
    for (key in action.refund) {
      if (!Object.prototype.hasOwnProperty.call(action.refund, key)) continue;
      state.resources[key] += action.refund[key];
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
    if (typeof action.effect.garrisoned === 'boolean') {
      region.garrisoned = action.effect.garrisoned;
    }

    region.actionsTaken += 1;
    state.stats.actionsTaken += 1;

    /* Applied after the effects, so an Invest's new development has already
     * raised the Manpower cap this check measures against. */
    clampResources(state);

    /* An action changes the national picture immediately — the upkeep bill
     * after an Invest, the manpower cap, the treasury rate. Recompute now so
     * the HUD tells the truth on the very next frame rather than on the next
     * tick. */
    recomputeDerived(state);
    return true;
  };

  Mandate.Sim = Sim;
})(window.Mandate = window.Mandate || {});
