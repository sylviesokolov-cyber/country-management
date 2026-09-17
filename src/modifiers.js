/* ============================================================================
 * src/modifiers.js — ONE TABLE OF NUMBERS THAT EVERYTHING ELSE WRITES INTO.
 * ----------------------------------------------------------------------------
 * Phase 3 added three systems that all want to change the same simulation:
 * tech nodes, appointees and policies. Phase 4 added two more — the LEADER and
 * timed EVENT EFFECTS — and needed no new mechanism at all, which is the whole
 * argument for this file. Without a shared mechanism the sim
 * would fill up with `if (state.tech.has('federalDevolution'))`, and every new
 * node would be a code change in src/sim.js. DESIGN.md is explicit that this
 * must not happen (§2.5: "a named flag the simulation checks, not a special
 * case branching on the id").
 *
 * So all three systems declare the SAME payload:
 *
 *     mods:  { 'output.mult': 1.08, 'natural.base': 5 }
 *     flags: [ 'austerityHitsMandate' ]
 *
 * and this file sums them into one flat table the sim reads by key.
 *
 *   KEYS ENDING IN `.mult`  multiply together, default 1.
 *   EVERY OTHER KEY         adds together,      default 0.
 *
 * That rule is the whole merge algorithm, and it is why two nodes that both
 * touch output compose sensibly instead of one silently winning.
 *
 * ---------------------------------------------------------------------------
 * SCOPE — the part that makes appointees interesting.
 *
 *   Mods.of(state)              national table: the leader, completed tech,
 *                               active policies, MINISTERS, and any event
 *                               effect still running
 *   Mods.forRegion(state, id)   the national table, PLUS the traits of the
 *                               governor assigned to that region
 *
 * A governor's traits therefore apply in exactly one place on the map. Moving
 * them is a real decision, and a Technocrat parked in a frontier region with 5
 * development is visibly wasted.
 *
 * ---------------------------------------------------------------------------
 * THE KEYS THE SIMULATION ACTUALLY READS.
 * This list is the contract between the data files and src/sim.js. If a data
 * file invents a key that isn't here, it does nothing — silently. (Mods.audit()
 * at the bottom exists to catch exactly that, and the harness calls it.)
 *
 *   output.mult                  a region's output                    [region]
 *   treasury.mult                output -> Treasury conversion      [national]
 *   upkeep.mult                  development upkeep                   [region]
 *   garrisonUpkeep.mult          garrison upkeep                      [region]
 *   salary.mult                  every appointee salary             [national]
 *   natural.base                 flat shift to natural stability      [region]
 *   natural.perDevelopment.mult  how much stability development holds [region]
 *   garrisonBonus.add            extra natural stability per garrison [region]
 *   neighbourUnrest.mult         how hard unrest next door bites      [region]
 *   spillover.perDevelopment     neighbours' development lifts you    [region]
 *   reversion.mult               how fast a region closes the gap     [region]
 *   pc.perDay.add / .mult        Political Capital income           [national]
 *   manpower.mult                recruitment rate                   [national]
 *   manpowerCap.mult             how much Manpower you can hold     [national]
 *   mandateDecay.mult            the BASELINE drain only            [national]
 *   mandate.perGarrisonPerDay    Mandate per garrison per day       [national]
 *   austerityMandate.mult        the Mandate price of a deficit,
 *                                under `austerityHitsMandate`        [national]
 *   research.mult                research points per day            [national]
 *   ministerSlots.add            hiring capacity                    [national]
 *   governorSlots.add            hiring capacity                    [national]
 *   cost.<actionId>.mult         a region action's price              [region]
 *   effect.<actionId>.mult       a region action's size               [region]
 *   mandateCost.<actionId>.mult  a region action's Mandate price       [region]
 *   pc.perAction                 Political Capital per region action [national]
 *   policyCost.mult              what enacting a policy costs        [national]
 *   policyCooldown.mult          how long a category stays locked    [national]
 *
 * FLAGS:
 *   austerityHitsMandate    unpaid bills burn Mandate instead of the country
 *   garrisonBlocksContagion a garrisoned region stops passing unrest along
 *   pcFromDevelopment       Political Capital accrues from development
 *   buildThroughRevolt      Invest is allowed in a province in open revolt
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Mods = {};

  /* ------------------------------------------------------------------------
   * CACHE
   * Building the table walks every completed node, policy and appointee, and
   * the sim asks for it several times per region per tick. So it is cached
   * against `state.modVersion` — a counter the sim bumps whenever something
   * that feeds this table changes. The state identity is checked too, so
   * starting a new run can never serve the old government's ministers.
   * ---------------------------------------------------------------------- */
  var cache = { state: null, version: -1, national: null, regions: null };

  function ensure(state) {
    if (cache.state === state && cache.version === state.modVersion) return;
    cache.state = state;
    cache.version = state.modVersion;
    cache.national = buildNational(state);
    cache.regions = Object.create(null);
  }

  /** An empty table. `num` is merged by the .mult rule; `flags` is a set. */
  function blank() {
    return { num: Object.create(null), flags: Object.create(null) };
  }

  /** Merge one payload ({ mods, flags }) into a table. */
  function apply(table, payload) {
    if (!payload) return table;
    var mods = payload.mods;
    if (mods) {
      Object.keys(mods).forEach(function (key) {
        if (isMult(key)) {
          table.num[key] = (table.num[key] === undefined ? 1 : table.num[key]) * mods[key];
        } else {
          table.num[key] = (table.num[key] === undefined ? 0 : table.num[key]) + mods[key];
        }
      });
    }
    (payload.flags || []).forEach(function (flag) { table.flags[flag] = true; });
    return table;
  }

  function isMult(key) {
    return key.length > 5 && key.slice(-5) === '.mult';
  }

  /** Copy a table so a region's governor can be layered on without leaking. */
  function clone(table) {
    var out = blank();
    Object.keys(table.num).forEach(function (k) { out.num[k] = table.num[k]; });
    Object.keys(table.flags).forEach(function (k) { out.flags[k] = true; });
    return out;
  }

  /* ------------------------------------------------------------------------
   * BUILDING
   * ---------------------------------------------------------------------- */

  function buildNational(state) {
    var table = blank();

    /* --- the leader, first ---
     * Their buff, handicap and mechanic are three ordinary payloads. Being
     * first in the merge means nothing (addition and multiplication don't
     * care), but it reads correctly: this is who you are, and everything
     * below is what you did about it. */
    Mandate.LEADERS.payloads(Mandate.LEADERS.byId(state.leaderId))
      .forEach(function (payload) { apply(table, payload); });

    /* --- completed tech --- */
    (state.tech.completed || []).forEach(function (id) {
      apply(table, Mandate.TECH.byId(id));
    });

    /* --- active policies (one option per category, always) --- */
    Object.keys(state.policies.active || {}).forEach(function (categoryId) {
      apply(table, Mandate.POLICIES.option(categoryId, state.policies.active[categoryId]));
    });

    /* --- ministers: national by definition --- */
    (state.appointees.hired || []).forEach(function (person) {
      if (person.role !== 'minister') return;
      traitsOf(person).forEach(function (trait) { apply(table, trait); });
    });

    /* --- temporary effects left behind by event choices ---
     * The sim drops these from the array the day they expire and bumps
     * modVersion, so an expired effect can never still be in this table. */
    (state.effects || []).forEach(function (effect) { apply(table, effect); });

    return table;
  }

  function buildRegion(state, regionId) {
    var table = clone(cache.national);
    /* At most one governor per region — Sim.assign() enforces that, so the
     * first match is the only match. */
    var hired = state.appointees.hired || [];
    for (var i = 0; i < hired.length; i++) {
      var person = hired[i];
      if (person.role !== 'governor' || person.regionId !== regionId) continue;
      traitsOf(person).forEach(function (trait) { apply(table, trait); });
      break;
    }
    return table;
  }

  /** Resolve an appointee's trait ids to trait definitions, skipping unknowns. */
  function traitsOf(person) {
    return (person.traits || []).map(function (id) {
      return Mandate.TRAITS.byId(id);
    }).filter(Boolean);
  }
  Mods.traitsOf = traitsOf;

  /* ------------------------------------------------------------------------
   * READING
   * ---------------------------------------------------------------------- */

  Mods.of = function (state) {
    ensure(state);
    return cache.national;
  };

  Mods.forRegion = function (state, regionId) {
    ensure(state);
    if (!cache.regions[regionId]) cache.regions[regionId] = buildRegion(state, regionId);
    return cache.regions[regionId];
  };

  /** A multiplier: 1 when nothing has touched it. */
  Mods.mult = function (table, key) {
    var value = table.num[key];
    return value === undefined ? 1 : value;
  };

  /** An additive term: 0 when nothing has touched it. */
  Mods.add = function (table, key) {
    var value = table.num[key];
    return value === undefined ? 0 : value;
  };

  Mods.on = function (table, flag) {
    return !!table.flags[flag];
  };

  /**
   * Every modifier key any data file declares, for the audit below and for
   * the "what does this actually do" lines in the UI.
   */
  Mods.declaredKeys = function () {
    var keys = Object.create(null);
    function collect(payload) {
      if (payload && payload.mods) {
        Object.keys(payload.mods).forEach(function (k) { keys[k] = true; });
      }
    }
    Mandate.TECH.nodes.forEach(collect);
    Object.keys(Mandate.TRAITS).forEach(function (k) { collect(Mandate.TRAITS[k]); });
    Mandate.POLICIES.forEach(function (category) { category.options.forEach(collect); });
    Mandate.LEADERS.forEach(function (leader) {
      Mandate.LEADERS.payloads(leader).forEach(collect);
    });
    Mandate.EVENTS.forEach(function (event) {
      event.choices.forEach(function (choice) { collect(choice.effect); });
    });
    return Object.keys(keys).sort();
  };

  /**
   * Which declared keys the simulation never reads — i.e. data that silently
   * does nothing. A typo in a node's `mods` is otherwise invisible: the node
   * looks bought and simply has no effect. `Mods.READ_KEYS` is maintained by
   * hand alongside src/sim.js, and the balance harness asserts on this.
   */
  Mods.READ_KEYS = [
    'output.mult', 'treasury.mult', 'upkeep.mult', 'garrisonUpkeep.mult',
    'salary.mult', 'natural.base', 'natural.perDevelopment.mult',
    'garrisonBonus.add', 'neighbourUnrest.mult', 'spillover.perDevelopment',
    'reversion.mult', 'pc.perDay.add', 'pc.perDay.mult', 'manpower.mult',
    'manpowerCap.mult', 'mandateDecay.mult', 'mandate.perGarrisonPerDay',
    'research.mult', 'ministerSlots.add', 'governorSlots.add',
    /* Phase 4 */
    'pc.perAction', 'policyCost.mult', 'policyCooldown.mult',
    'austerityMandate.mult',
  ];

  Mods.audit = function () {
    var read = Mods.READ_KEYS;
    return Mods.declaredKeys().filter(function (key) {
      /* Per-action keys are read generically by Sim.actionCost/actionEffect,
       * so any `cost.<id>.mult` / `effect.<id>.mult` naming a real action is
       * live without being listed one by one. */
      var parts = key.split('.');
      if ((parts[0] === 'cost' || parts[0] === 'effect' ||
           parts[0] === 'mandateCost') && parts[2] === 'mult') {
        return !Mandate.BALANCE.actions[parts[1]];
      }
      return read.indexOf(key) === -1;
    });
  };

  Mandate.Mods = Mods;
})(window.Mandate = window.Mandate || {});
