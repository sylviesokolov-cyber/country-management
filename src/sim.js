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
 *
 * PHASE 3 slots three more things into that order, and where they go matters:
 *
 *   1b. Appointee SALARIES are added to the upkeep bill, before it is
 *       charged — so an over-staffed government goes bankrupt exactly like an
 *       over-built one, through the same austerity rule.
 *   3b. Standing POLICIES bill their ongoing cost in Political Capital and
 *       Mandate (their Treasury cost is already in the bill above).
 *   3c. RESEARCH advances, and the candidate pool refreshes on its timer.
 *       Research is spent time, so it must not depend on whether the player
 *       could pay for anything today.
 *
 * Nothing in this file asks "does the player have tech X?". Tech, appointees
 * and policies all arrive as one table of numbers from src/modifiers.js, and
 * the sim only ever reads keys out of it. See that file for the contract.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Sim = {};
  var clamp = Mandate.Util.clamp;
  var Mods = Mandate.Mods;

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
  Sim.regionOutput = function (state, region) {
    var o = Mandate.BALANCE.region.output;
    return (o.base + region.development * o.perDevelopment) *
      Sim.stabilityFactor(region) *
      Mods.mult(Mods.forRegion(state, region.id), 'output.mult');
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
  Sim.regionUpkeep = function (state, region) {
    var R = Mandate.BALANCE.region;
    var m = Mods.forRegion(state, region.id);
    return region.development * R.upkeep.treasuryPerDevelopmentPerDay *
        Mods.mult(m, 'upkeep.mult') +
      (region.garrisoned
        ? R.garrison.treasuryUpkeepPerDay * Mods.mult(m, 'garrisonUpkeep.mult')
        : 0);
  };

  /**
   * What the government payroll costs per day.
   * Billed as part of the upkeep bill rather than separately, so there is
   * exactly one way to run out of money and exactly one austerity rule.
   */
  Sim.salaryPerDay = function (state) {
    var total = 0;
    var hired = state.appointees.hired;
    for (var i = 0; i < hired.length; i++) total += hired[i].salary;
    return total * Mods.mult(Mods.of(state), 'salary.mult');
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
    /* Martial Doctrine: a garrisoned region is a firewall. Troops stop unrest
     * CROSSING them, which changes the shape of a crisis rather than its
     * size — a garrison on the right region seals off a whole frontier. */
    var firewall = Mods.on(Mods.of(state), 'garrisonBlocksContagion');
    var count = 0;
    for (var i = 0; i < ids.length; i++) {
      var neighbour = Mandate.State.regionById(state, ids[i]);
      if (!neighbour || !Sim.isUnstable(neighbour)) continue;
      if (firewall && neighbour.garrisoned) continue;
      count += 1;
    }
    return count;
  };

  /** Total development in the regions bordering this one (Trunk Network). */
  function neighbourDevelopment(state, region) {
    var ids = Sim.neighboursOf(region.id);
    var total = 0;
    for (var i = 0; i < ids.length; i++) {
      var neighbour = Mandate.State.regionById(state, ids[i]);
      if (neighbour) total += neighbour.development;
    }
    return total;
  }

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
    var m = Mods.forRegion(state, region.id);

    /* Deficit Financing moves austerity off the country and onto the clock:
     * the unpaid bill stops eating stability and development, and starts
     * costing Mandate instead (see Sim.mandateLossPerDay). */
    var austerity = Mods.on(Mods.of(state), 'austerityHitsMandate')
      ? 0
      : (shortfallFraction || 0) * N.austerityPenalty;

    var level = N.base + Mods.add(m, 'natural.base') +
      region.development * N.perDevelopment *
        Mods.mult(m, 'natural.perDevelopment.mult') +
      (region.garrisoned ? N.garrisonBonus + Mods.add(m, 'garrisonBonus.add') : 0) +
      Sim.unstableNeighbours(state, region) * N.perUnstableNeighbour *
        Mods.mult(m, 'neighbourUnrest.mult') +
      /* Trunk Network: what your NEIGHBOURS have built now props this region
       * up. Until this exists the adjacency map can only ever hurt you. */
      neighbourDevelopment(state, region) * Mods.add(m, 'spillover.perDevelopment') +
      austerity;
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
      R.reversionPerDay * Mods.mult(Mods.forRegion(state, region.id), 'reversion.mult');
  };

  /**
   * Development change per day. Only austerity takes it away — and not even
   * that under Deficit Financing, which redirects the whole austerity penalty
   * to Mandate.
   */
  Sim.developmentTrend = function (state, region, shortfallFraction) {
    var R = Mandate.BALANCE.region;
    if (Mods.on(Mods.of(state), 'austerityHitsMandate')) return -R.developmentDecayPerDay;
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
    var m = Mods.of(state);

    /* Technocratic Ministries rewrites where standing comes from: results
     * instead of mood. That is the only way out of a run where the country is
     * permanently below the pivot and therefore permanently broke in the one
     * currency that could fix it. */
    var earned = Mods.on(m, 'pcFromDevelopment')
      ? totalDevelopment(state) * P.perDevelopmentPerDay
      : (averageStability(state) - P.pivotStability) * P.perStabilityPointPerDay;

    var rate = (P.perDayBase + earned + Mods.add(m, 'pc.perDay.add')) *
      Mods.mult(m, 'pc.perDay.mult');
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
    return total * Mods.mult(Mods.of(state), 'manpower.mult');
  };

  /** Manpower is people, not savings: a bigger country can hold more of them. */
  Sim.manpowerCap = function (state) {
    var M = Mandate.BALANCE.resources.manpower;
    return (M.capBase + totalDevelopment(state) * M.capPerDevelopment) *
      Mods.mult(Mods.of(state), 'manpowerCap.mult');
  };

  /** Research points banked per day by the queue. */
  Sim.researchPerDay = function (state) {
    return Mandate.BALANCE.research.pointsPerDay *
      Mods.mult(Mods.of(state), 'research.mult');
  };

  /** How many ministers / governors this government may hold at once. */
  Sim.slotsFor = function (state, role) {
    var A = Mandate.BALANCE.appointees;
    var m = Mods.of(state);
    return role === 'minister'
      ? A.ministerSlots + Mods.add(m, 'ministerSlots.add')
      : A.governorSlots + Mods.add(m, 'governorSlots.add');
  };

  /** How many of a role are currently employed. */
  Sim.hiredCount = function (state, role) {
    var count = 0;
    for (var i = 0; i < state.appointees.hired.length; i++) {
      if (state.appointees.hired[i].role === role) count += 1;
    }
    return count;
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
    if (baseline < M.decayFloorPerDay) baseline = M.decayFloorPerDay;
    /* Policies and appointees scale the BASELINE only, never the unrest
     * pressure below: a Heavy Levy makes the honeymoon shorter, it does not
     * make a burning province burn faster. */
    return baseline * Mods.mult(Mods.of(state), 'mandateDecay.mult');
  };

  /**
   * Mandate lost per day: the baseline above, plus, for every region under
   * the unrest line, a flat cost for having crossed it at all and a per-point
   * cost for how far below it has fallen.
   */
  Sim.mandateLossPerDay = function (state, shortfallFraction) {
    var M = Mandate.BALANCE.mandate;
    var m = Mods.of(state);
    var loss = Sim.mandateBaselinePerDay(state);
    var perGarrison = Mods.add(m, 'mandate.perGarrisonPerDay');

    for (var i = 0; i < state.regions.length; i++) {
      var region = state.regions[i];
      if (region.stability < M.unstableBelow) {
        loss += M.decayPerUnstableRegionPerDay +
          (M.unstableBelow - region.stability) * M.decayPerUnstablePointPerDay;
      }
      /* Martial Doctrine: soldiers in the streets cost legitimacy for every
       * day they stay. Nothing charges this until that node is researched. */
      if (region.garrisoned) loss += perGarrison;
    }

    /* Standing policies with an ongoing Mandate price (censorship). */
    loss += policyUpkeep(state, 'mandate');

    /* Deficit Financing: the unpaid share of the bill lands here instead of
     * on the country. */
    if (shortfallFraction && Mods.on(m, 'austerityHitsMandate')) {
      loss += shortfallFraction * M.austerityPerShortfallPerDay;
    }
    return loss;
  };

  /**
   * What the currently active policies cost per day in one resource.
   * Treasury costs are folded into the upkeep bill; Political Capital and
   * Mandate costs are charged where those resources are handled.
   */
  function policyUpkeep(state, resourceKey) {
    var total = 0;
    var active = state.policies.active;
    Object.keys(active).forEach(function (categoryId) {
      var option = Mandate.POLICIES.option(categoryId, active[categoryId]);
      if (option && option.upkeep && option.upkeep[resourceKey]) {
        total += option.upkeep[resourceKey];
      }
    });
    return total;
  }
  Sim.policyUpkeep = policyUpkeep;

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
      region.output = Sim.regionOutput(state, region);
      region.upkeep = Sim.regionUpkeep(state, region);
      nationalOutput += region.output;
      upkeep += region.upkeep;
      if (Sim.isUnstable(region)) unstable += 1;
    }

    /* The payroll and any standing policy with a daily price are part of the
     * same bill as bricks and troops — one bill, one austerity rule. */
    var salary = Sim.salaryPerDay(state);
    upkeep += salary + policyUpkeep(state, 'treasury');

    var gross = nationalOutput * B.region.treasuryPerOutputPerDay *
      Mods.mult(Mods.of(state), 'treasury.mult');

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
    state.derived.mandatePerDay = -Sim.mandateLossPerDay(state, shortfallFraction);
    state.derived.salaryPerDay = salary;
    state.derived.researchPerDay = Sim.researchPerDay(state);
    state.derived.ministerSlots = Sim.slotsFor(state, 'minister');
    state.derived.governorSlots = Sim.slotsFor(state, 'governor');
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
    /* The opening slate of candidates is drawn here rather than in
     * State.createNewGame, because the RNG lives in the sim. `seeded` is what
     * stops a reload re-rolling the pool the player is looking at. */
    if (!state.appointees.seeded) {
      state.appointees.seeded = true;
      for (var i = 0; i < Mandate.BALANCE.appointees.initialPool; i++) {
        state.appointees.pool.push(Sim.drawCandidate(state));
      }
    }
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
      state.regions[i].output = Sim.regionOutput(state, state.regions[i]);
      state.regions[i].upkeep = Sim.regionUpkeep(state, state.regions[i]);
      nationalOutput += state.regions[i].output;
      upkeep += state.regions[i].upkeep;
    }

    /* --- 1b. The payroll and any standing policy bill ------------------- */
    upkeep += Sim.salaryPerDay(state) + policyUpkeep(state, 'treasury');

    /* --- 2. Treasury in, upkeep out ------------------------------------- */
    var gross = nationalOutput * R.treasuryPerOutputPerDay *
      Mods.mult(Mods.of(state), 'treasury.mult');
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
    state.resources.politicalCapital +=
      Sim.politicalCapitalPerDay(state) - policyUpkeep(state, 'politicalCapital');
    state.resources.manpower += Sim.manpowerPerDay(state);
    clampResources(state);

    /* --- 3c. Research, and the hiring pool ------------------------------ */
    /* Deliberately unconditional: research is spent TIME, and time passes
     * whether or not the Treasury balanced today. A bankrupt government still
     * finishes the road survey it started. */
    advanceResearch(state);
    refreshPool(state);

    /* --- 4. Drift ------------------------------------------------------- */
    /* Computed for every region FIRST, against the same snapshot, then
     * applied. See the header note: doing this in one pass would make unrest
     * spread faster in the direction the regions happen to be listed in. */
    var stabilityDeltas = [];
    var developmentDeltas = [];
    for (i = 0; i < state.regions.length; i++) {
      stabilityDeltas.push(Sim.stabilityTrend(state, state.regions[i], shortfallFraction));
      developmentDeltas.push(Sim.developmentTrend(state, state.regions[i], shortfallFraction));
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
    state.mandate = clamp(
      state.mandate - Sim.mandateLossPerDay(state, shortfallFraction), 0, B.mandate.max);

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
   * What this action costs ON THIS REGION, after tech, policies and whoever
   * governs it. Returns a fresh object — never the balance data.
   *
   * Costs are ROUNDED, and that is not cosmetic: the panel shows what it
   * charges, so a button reading "84 ¤" must take exactly 84. Anything below
   * the rounding floor still costs 1, so a stack of discounts can never make
   * an action free.
   */
  Sim.actionCost = function (state, actionId, regionId) {
    var action = Mandate.BALANCE.actions[actionId];
    var m = Mods.forRegion(state, regionId);
    var mult = Mods.mult(m, 'cost.' + actionId + '.mult');
    var out = {};
    Object.keys(action.cost || {}).forEach(function (key) {
      var value = Math.round(action.cost[key] * mult);
      out[key] = value < 1 ? 1 : value;
    });
    return out;
  };

  /**
   * What this action DOES on this region, after modifiers. Only the numeric
   * effects scale; `garrisoned` is a fact, not a quantity.
   */
  Sim.actionEffect = function (state, actionId, regionId) {
    var action = Mandate.BALANCE.actions[actionId];
    var mult = Mods.mult(Mods.forRegion(state, regionId), 'effect.' + actionId + '.mult');
    var effect = {};
    Object.keys(action.effect || {}).forEach(function (key) {
      effect[key] = typeof action.effect[key] === 'number'
        ? action.effect[key] * mult
        : action.effect[key];
    });
    return effect;
  };

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
  function effectWouldApply(region, effect) {
    var R = Mandate.BALANCE.region;

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
  function noEffectReason(effect) {
    if (effect.development) return 'Fully developed';
    if (effect.stability) return 'Fully stable';
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

    var effect = Sim.actionEffect(state, actionId, regionId);
    if (!effectWouldApply(region, effect)) {
      return { ok: false, reason: noEffectReason(effect) };
    }

    var cost = Sim.actionCost(state, actionId, regionId);
    for (var key in cost) {
      if (!Object.prototype.hasOwnProperty.call(cost, key)) continue;
      if (state.resources[key] < cost[key]) {
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

    /* Pay — the MODIFIED price, which is the one the button quoted. */
    var cost = Sim.actionCost(state, actionId, regionId);
    for (key in cost) {
      if (!Object.prototype.hasOwnProperty.call(cost, key)) continue;
      state.resources[key] -= cost[key];
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
    var effect = Sim.actionEffect(state, actionId, regionId);
    if (effect.development) {
      region.development = clamp(
        region.development + effect.development, B.region.min, B.region.max);
    }
    if (effect.stability) {
      region.stability = clamp(
        region.stability + effect.stability, B.region.min, B.region.max);
    }
    if (typeof effect.garrisoned === 'boolean') {
      region.garrisoned = effect.garrisoned;
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

  /* ========================================================================
   * PHASE 3 — RESEARCH, APPOINTEES AND POLICIES
   *
   * Every mutation in this section ends with touch(state): that bumps
   * `state.modVersion`, which is the only thing telling src/modifiers.js its
   * cached table is stale. Forget it and a newly completed node does nothing
   * until something else happens to invalidate the cache — the nastiest class
   * of bug this architecture can produce, and the reason it is one function
   * with one name rather than an assignment written out eight times.
   * ====================================================================== */

  function touch(state) {
    state.modVersion = (state.modVersion || 0) + 1;
  }

  /* ------------------------------------------------------------------------
   * SEEDED RANDOMNESS
   * The candidate pool is the first thing in the game that rolls dice, and a
   * save that re-rolled its pool on every load would let a player reload
   * until a Technocrat turned up. So the seed lives IN the state and every
   * draw advances it: the same save always has the same future, and a balance
   * run is reproducible.
   *
   * mulberry32 — small, fast, and good enough for picking names out of a hat.
   * ---------------------------------------------------------------------- */
  Sim.random = function (state) {
    state.rngSeed = (state.rngSeed + 0x6D2B79F5) >>> 0;
    var t = state.rngSeed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function pick(state, list) {
    return list[Math.floor(Sim.random(state) * list.length)];
  }

  /* ------------------------------------------------------------------------
   * RESEARCH
   * The queue holds node ids. The head of the queue is what is being worked
   * on; `progress` is how many research points it has banked.
   *
   * Political Capital is charged when a node is QUEUED, not when it starts.
   * That is what makes the queue a commitment rather than a wish list: four
   * queued nodes is four nodes' worth of standing already spent.
   * ---------------------------------------------------------------------- */

  /**
   * Where a node stands, as one word. The Tech tab renders entirely from
   * this, so what the player sees and what the sim will allow cannot drift.
   */
  Sim.techStatus = function (state, nodeId) {
    if (state.tech.completed.indexOf(nodeId) !== -1) return 'done';
    var at = state.tech.queue.indexOf(nodeId);
    if (at === 0) return 'researching';
    if (at > 0) return 'queued';
    return Sim.prerequisitesMet(state, nodeId) ? 'available' : 'locked';
  };

  /**
   * Prerequisites count as met by anything already COMPLETED or QUEUED, so a
   * whole branch can be lined up in one sitting. Queueing a node whose
   * prerequisite you then cancel is handled in Sim.cancelTech.
   */
  Sim.prerequisitesMet = function (state, nodeId) {
    var node = Mandate.TECH.byId(nodeId);
    if (!node) return false;
    return (node.requires || []).every(function (id) {
      return state.tech.completed.indexOf(id) !== -1 ||
        state.tech.queue.indexOf(id) !== -1;
    });
  };

  /** The un-met prerequisites of a node, by name, for the "locked" line. */
  Sim.missingPrerequisites = function (state, nodeId) {
    var node = Mandate.TECH.byId(nodeId);
    if (!node) return [];
    return (node.requires || []).filter(function (id) {
      return state.tech.completed.indexOf(id) === -1 &&
        state.tech.queue.indexOf(id) === -1;
    }).map(function (id) {
      var required = Mandate.TECH.byId(id);
      return required ? required.name : id;
    });
  };

  Sim.canQueueTech = function (state, nodeId) {
    var node = Mandate.TECH.byId(nodeId);
    if (!node) return { ok: false, reason: 'Unknown node' };
    if (state.gameOver) return { ok: false, reason: 'Run over' };

    var status = Sim.techStatus(state, nodeId);
    if (status === 'done') return { ok: false, reason: 'Researched' };
    if (status === 'researching') return { ok: false, reason: 'In progress' };
    if (status === 'queued') return { ok: false, reason: 'Queued' };
    if (status === 'locked') {
      return { ok: false, reason: 'Needs ' + Sim.missingPrerequisites(state, nodeId).join(', ') };
    }
    if (state.tech.queue.length >= Mandate.BALANCE.research.queueMax) {
      return { ok: false, reason: 'Queue full' };
    }
    if (state.resources.politicalCapital < node.cost) {
      return { ok: false, reason: 'Not enough Political Capital' };
    }
    return { ok: true };
  };

  Sim.queueTech = function (state, nodeId) {
    if (!Sim.canQueueTech(state, nodeId).ok) return false;
    var node = Mandate.TECH.byId(nodeId);
    state.resources.politicalCapital -= node.cost;
    state.tech.queue.push(nodeId);
    touch(state);
    return true;
  };

  /**
   * Take a node back out of the queue and refund its Political Capital in
   * full. Progress already banked on the head node is LOST, which is the only
   * penalty — a research programme you abandon halfway is time you spent, not
   * money you wasted.
   *
   * Cancelling a node that later nodes were queued behind drops them too:
   * they were only legal because this one was in the queue, so leaving them
   * would let a player queue a tier-3 node by queueing and cancelling its
   * prerequisite. They are refunded as well.
   */
  Sim.cancelTech = function (state, nodeId) {
    var at = state.tech.queue.indexOf(nodeId);
    if (at === -1) return false;

    var dropped = state.tech.queue.splice(at);
    if (at === 0) state.tech.progress = 0;

    /* Walk what is left and drop anything now missing a prerequisite. This
     * has to repeat until nothing changes: dropping a tier-2 node can orphan
     * the tier-3 node behind it. */
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = state.tech.queue.length - 1; i >= 0; i--) {
        var id = state.tech.queue[i];
        var node = Mandate.TECH.byId(id);
        var met = (node.requires || []).every(function (requiredId) {
          return state.tech.completed.indexOf(requiredId) !== -1 ||
            state.tech.queue.indexOf(requiredId) !== -1;
        });
        if (!met) {
          dropped = dropped.concat(state.tech.queue.splice(i, 1));
          if (i === 0) state.tech.progress = 0;
          changed = true;
        }
      }
    }

    dropped.forEach(function (id) {
      var node = Mandate.TECH.byId(id);
      if (node) state.resources.politicalCapital += node.cost;
    });
    clampResources(state);
    touch(state);
    return true;
  };

  /** One day of research. Completes at most one node per day, by design. */
  function advanceResearch(state) {
    if (!state.tech.queue.length) return;
    state.tech.progress += Sim.researchPerDay(state);

    var nodeId = state.tech.queue[0];
    var node = Mandate.TECH.byId(nodeId);
    if (!node || state.tech.progress < node.days) return;

    state.tech.queue.shift();
    state.tech.completed.push(nodeId);
    state.tech.progress = 0;
    state.stats.techCompleted += 1;
    touch(state);
  }

  /* ------------------------------------------------------------------------
   * APPOINTEES
   * ---------------------------------------------------------------------- */

  /**
   * Roll one candidate: a role, a perk, and — more often than not — a
   * drawback that makes them cheaper. The salary is the sum of what their
   * traits are worth, so a Corrupt Technocrat genuinely undercuts a clean
   * one. That is the offer the pool is making.
   */
  Sim.drawCandidate = function (state) {
    var A = Mandate.BALANCE.appointees;
    var role = Sim.random(state) < 0.5 ? 'minister' : 'governor';

    var traits = [pick(state, Mandate.TRAITS.poolFor(role, false))];
    if (Sim.random(state) < A.drawbackChance) {
      traits.push(pick(state, Mandate.TRAITS.poolFor(role, true)));
    }

    var salary = A.salaryBase;
    traits.forEach(function (id) {
      var trait = Mandate.TRAITS.byId(id);
      if (trait) salary += trait.salary;
    });
    /* A candidate whose drawbacks outweigh their perk must still cost
     * something — nobody works for nothing, and a free appointee would be a
     * free modifier. */
    if (salary < 0.05) salary = 0.05;

    return {
      id: 'a' + (state.appointees.nextId++),
      name: pick(state, Mandate.APPOINTEES.firstNames) + ' ' +
        pick(state, Mandate.APPOINTEES.surnames),
      title: pick(state, Mandate.APPOINTEES.titles[role]),
      role: role,
      traits: traits,
      salary: Math.round(salary * 100) / 100,
      regionId: null,
    };
  };

  /** One-off Treasury cost of taking someone on: about three months' wages. */
  Sim.hiringFee = function (state, candidate) {
    return Math.round(candidate.salary * Mandate.BALANCE.appointees.hiringFeeDays *
      Mods.mult(Mods.of(state), 'salary.mult'));
  };

  /**
   * The pool refreshes on a timer, never on demand. Waiting for a better
   * candidate therefore costs real days off the clock, which is what stops
   * "don't hire anyone until something perfect appears" from being free.
   */
  function refreshPool(state) {
    var A = Mandate.BALANCE.appointees;
    if (state.day - state.appointees.lastRefreshDay < A.refreshEveryDays) return;
    state.appointees.lastRefreshDay = state.day;
    if (state.appointees.pool.length >= A.poolMax) return;
    state.appointees.pool.push(Sim.drawCandidate(state));
  }

  Sim.candidateById = function (state, id) {
    var pool = state.appointees.pool;
    for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i];
    return null;
  };

  Sim.appointeeById = function (state, id) {
    var hired = state.appointees.hired;
    for (var i = 0; i < hired.length; i++) if (hired[i].id === id) return hired[i];
    return null;
  };

  Sim.governorOf = function (state, regionId) {
    var hired = state.appointees.hired;
    for (var i = 0; i < hired.length; i++) {
      if (hired[i].role === 'governor' && hired[i].regionId === regionId) return hired[i];
    }
    return null;
  };

  Sim.canHire = function (state, candidateId) {
    if (state.gameOver) return { ok: false, reason: 'Run over' };
    var candidate = Sim.candidateById(state, candidateId);
    if (!candidate) return { ok: false, reason: 'Gone' };
    if (Sim.hiredCount(state, candidate.role) >= Sim.slotsFor(state, candidate.role)) {
      return { ok: false, reason: 'No ' + candidate.role + ' slot free' };
    }
    if (state.resources.treasury < Sim.hiringFee(state, candidate)) {
      return { ok: false, reason: 'Not enough Treasury' };
    }
    return { ok: true };
  };

  Sim.hire = function (state, candidateId) {
    if (!Sim.canHire(state, candidateId).ok) return false;
    var candidate = Sim.candidateById(state, candidateId);

    state.resources.treasury -= Sim.hiringFee(state, candidate);
    state.appointees.pool.splice(state.appointees.pool.indexOf(candidate), 1);
    candidate.hiredOn = state.day;
    state.appointees.hired.push(candidate);
    state.stats.appointeesHired += 1;
    touch(state);
    return true;
  };

  /**
   * Dismissal is free and immediate, and they do NOT go back into the pool:
   * hiring is a commitment you can end, not a loan you can return. The one-off
   * fee is what you lose.
   */
  Sim.dismiss = function (state, appointeeId) {
    var person = Sim.appointeeById(state, appointeeId);
    if (!person) return false;
    state.appointees.hired.splice(state.appointees.hired.indexOf(person), 1);
    touch(state);
    return true;
  };

  /**
   * Post a governor to a region (or recall them with regionId = null).
   * A region holds at most one governor, so posting into an occupied region
   * recalls the incumbent rather than silently stacking two sets of traits on
   * the same place.
   */
  Sim.assign = function (state, appointeeId, regionId) {
    var person = Sim.appointeeById(state, appointeeId);
    if (!person || person.role !== 'governor') return false;
    if (regionId && !Mandate.State.regionById(state, regionId)) return false;

    if (regionId) {
      var incumbent = Sim.governorOf(state, regionId);
      if (incumbent && incumbent !== person) incumbent.regionId = null;
    }
    person.regionId = regionId || null;
    touch(state);
    return true;
  };

  /* ------------------------------------------------------------------------
   * POLICIES
   * ---------------------------------------------------------------------- */

  /** Days left before this category can be changed again; 0 when it is free. */
  Sim.policyCooldownLeft = function (state, categoryId) {
    var changedOn = state.policies.changedOn[categoryId];
    if (changedOn === undefined) return 0;
    var left = Mandate.BALANCE.policies.cooldownDays - (state.day - changedOn);
    return left > 0 ? left : 0;
  };

  Sim.canEnactPolicy = function (state, categoryId, optionId) {
    if (state.gameOver) return { ok: false, reason: 'Run over' };
    var option = Mandate.POLICIES.option(categoryId, optionId);
    if (!option) return { ok: false, reason: 'Unknown policy' };
    if (state.policies.active[categoryId] === optionId) {
      return { ok: false, reason: 'In force' };
    }
    var left = Sim.policyCooldownLeft(state, categoryId);
    if (left > 0) return { ok: false, reason: Math.ceil(left) + ' days' };
    if (state.resources.politicalCapital < (option.cost || 0)) {
      return { ok: false, reason: 'Not enough Political Capital' };
    }
    return { ok: true };
  };

  Sim.enactPolicy = function (state, categoryId, optionId) {
    if (!Sim.canEnactPolicy(state, categoryId, optionId).ok) return false;
    var option = Mandate.POLICIES.option(categoryId, optionId);
    state.resources.politicalCapital -= (option.cost || 0);
    state.policies.active[categoryId] = optionId;
    state.policies.changedOn[categoryId] = state.day;
    touch(state);
    recomputeDerived(state);
    return true;
  };

  Mandate.Sim = Sim;
})(window.Mandate = window.Mandate || {});
