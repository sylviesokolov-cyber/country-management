/* ============================================================================
 * data/leaders.js — WHO YOU ARE. The primary replayability driver.
 * ----------------------------------------------------------------------------
 * Six leaders. Each is three things:
 *
 * Each also carries a `crest` and an `accent`, added in Phase 5's art pass.
 * The crest names one of the geometric emblems drawn in src/ui/leaders.js —
 * there are no image files, so a seventh leader is still purely a data edit —
 * and the accent is the colour that emblem and the card's edge are painted in.
 * The selection screen is the first thing a player sees and it was six
 * identical dark rectangles; six emblems in six colours is what makes them
 * six people.
 *
 *   buff      — what you are good at
 *   handicap  — what it cost you to be good at that
 *   mechanic  — one rule that works DIFFERENTLY for you than for anyone else
 *
 * All three are the same `mods` / `flags` payload every other system in the
 * game uses (see src/modifiers.js), merged into the national table at the
 * start of a run and never touched again. DESIGN.md §2.5 is explicit that this
 * must be so: "express it as a named flag or modifier the simulation checks,
 * not as a special case branching on the leader's id". There is no
 * `if (leader === 'general')` anywhere in src/, and adding a seventh leader is
 * adding an object to this array.
 *
 * ---------------------------------------------------------------------------
 * THE MECHANICS, and why each one is a different GAME rather than a bigger
 * number:
 *
 *   The Marshal        garrisons firewall unrest from day one — the one
 *                      leader for whom troops are a strategy instead of a
 *                      patch (see the Phase 3 finding in BALANCE.md)
 *   The Comptroller    runs a permanent deficit: unpaid bills burn Mandate
 *                      instead of wrecking the country, from the first day
 *   The Reformer       Invest costs no Mandate at all, so building is free of
 *                      the clock — the only leader who can develop without
 *                      paying for it in time
 *   The Tribune        every decision taken in a region earns Political
 *                      Capital, so standing comes from ACTING rather than
 *                      from the country being calm
 *   The Engineer       development spills into neighbouring regions from the
 *                      start, which turns the map into an investment plan
 *   The Caretaker      policies are free and change four times as often, so
 *                      the national posture becomes a tool instead of a
 *                      commitment
 *
 * Two of those reuse flags the tech tree already owns (`garrisonBlocksContagion`,
 * `austerityHitsMandate`) and one reuses a modifier key
 * (`spillover.perDevelopment`). That is deliberate and it is the payoff of the
 * modifier layer: a leader can hand you a tier-2 node's rule on day one
 * without a line of new code, and researching that node later is simply
 * redundant for them — which is itself a real strategic difference.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  Mandate.LEADERS = [
    {
      id: 'marshal', crest: 'chevrons', accent: '#e0704a', difficulty: 3,
      name: 'Marshal Adrienne Vosk',
      title: 'The Marshal',
      blurb: 'Came up through the frontier commands. Believes a province held ' +
        'is a province saved, and has never much cared what that costs.',
      buff: {
        label: 'Garrisons hold harder, raise cheaper and cost 40% less to keep',
        /* The upkeep multiplier is the one that matters and it was missing at
         * first. A garrison's trap was never the raising cost, it was the
         * 0.5 Treasury every single day forever — so a Marshal who could raise
         * troops cheaply and still could not afford to keep them was a leader
         * whose entire identity lost the run. */
        mods: {
          'garrisonBonus.add': 8, 'cost.garrison.mult': 0.60,
          'garrisonUpkeep.mult': 0.60,
        },
      },
      handicap: {
        label: 'Political Capital accrues 30% slower',
        mods: { 'pc.perDay.mult': 0.70 },
      },
      mechanic: {
        label: 'Cordon Doctrine — a garrisoned region stops unrest crossing it',
        flags: ['garrisonBlocksContagion'],
      },
    },

    {
      id: 'comptroller', crest: 'ledger', accent: '#e0b83c', difficulty: 2,
      name: 'Emeric Tesoro',
      title: 'The Comptroller',
      blurb: 'Twenty years in the Treasury. Knows exactly how long a state can ' +
        'go without paying its bills, and intends to find out.',
      buff: {
        label: 'Every unit of output earns 10% more Treasury',
        mods: { 'treasury.mult': 1.10 },
      },
      handicap: {
        /* Was "Public Works lands 35% weaker" through Phase 4. That handicap
         * cost a PATCHER dearly and a BUILDER nothing at all, so once Phase 5
         * made building the winning line, the leader the selection screen
         * calls Punishing started winning every seed. A handicap has to bite
         * the strategy the game rewards, or it is decoration. */
        label: 'The books balance, the country does not: development holds ' +
          '15% less stability',
        /* Deliberately NOT a `natural.base` penalty, which is what this was
         * first written as. A flat shift to where regions settle interacts
         * with the unrest cliff at 35: -5 means a region needs development 13
         * instead of 9 just to stay out of unrest, and with neighbour
         * contagion on top the harness watched twelve of sixteen regions fall
         * over by year two, every seed. A handicap should make a leader
         * play differently, not make them lose. */
        mods: { 'natural.perDevelopment.mult': 0.85 },
      },
      mechanic: {
        label: 'Deficit Powers — unpaid bills burn Mandate instead of the country, ' +
          'at half the usual rate',
        /* The flag alone is the tier-2 tech node's rule, and on its own it is
         * a suicide button held continuously: a permanent full shortfall burns
         * 0.08 Mandate a day on top of the baseline, which killed the
         * Comptroller inside three years in every harness run. Halving it is
         * what turns "a crisis tool that will eventually kill you" into "a way
         * of running a government", which is the whole character. */
        flags: ['austerityHitsMandate'],
        mods: { 'austerityMandate.mult': 0.5 },
      },
    },

    {
      id: 'reformer', crest: 'sunburst', accent: '#4fc48a', difficulty: 1,
      name: 'Oksana Adranei',
      title: 'The Reformer',
      blurb: 'Elected on a promise to rebuild. Has the patience for it and, so ' +
        'far, the votes.',
      /* REBUILT IN PHASE 5, and the reason is worth keeping.
       *
       * The Reformer's old buff was "regions correct toward their natural
       * level twice as fast", which reads like a bonus and is not one: a
       * region's natural level starts BELOW the unrest line everywhere, so
       * doubling the rate of correction doubles the speed of the opening
       * slide. With revolts in the game that stopped being a quirk and became
       * fatal — 0 wins from 24 harness runs, from what had been the easiest
       * leader in the game. It was a handicap wearing a buff's label, and it
       * had been one since Phase 4; nothing measured it until now.
       *
       * The replacement says the same thing about the character — this is a
       * government that rebuilds rather than patches — in a way that actually
       * rewards doing it. Development holds more for them, and money is
       * tighter, so they must build their way out of everything. */
      buff: {
        label: 'Every point of development holds 25% more stability',
        mods: { 'natural.perDevelopment.mult': 1.25 },
      },
      handicap: {
        label: 'Reform is expensive: 12% less Treasury from the same output',
        mods: { 'treasury.mult': 0.88 },
      },
      /* This mechanic was "Invest costs no Mandate at all" through Phase 4.
       * Phase 5 made that true for EVERYBODY (see the long note on
       * `actions.invest.mandateCost` in data/balance.js), which quietly left
       * the Reformer holding a handicap and nothing else — the harness caught
       * it immediately: 0 wins from 24 runs, down from the easiest leader in
       * the game.
       *
       * The replacement is the same trick the Marshal and the Comptroller
       * already use: hand this leader one rule of the newest system, inverted.
       * Nobody else may Invest in a province in open revolt; the Reformer
       * may. Paired with regions that correct toward their natural level
       * twice as fast, it makes them the one government that can dig itself
       * out of a hole instead of having to avoid falling into one. */
      mechanic: {
        label: 'Rebuild Anywhere — you may Invest in a province in open revolt',
        flags: ['buildThroughRevolt'],
      },
    },

    {
      id: 'tribune', crest: 'wreath', accent: '#7fb5ff', difficulty: 4,
      name: 'Kosta Renholt',
      title: 'The Tribune',
      blurb: 'A street organiser who never learned to sit still. Popular for ' +
        'doing things, not for the things being done.',
      buff: {
        label: 'Public Works lands 40% harder',
        mods: { 'effect.publicWorks.mult': 1.40 },
      },
      handicap: {
        label: 'No head for money: the upkeep bill runs 15% higher',
        mods: { 'upkeep.mult': 1.15 },
      },
      mechanic: {
        label: 'Government by Doing — every regional decision earns +0.6 Political Capital',
        mods: { 'pc.perAction': 0.6 },
      },
    },

    {
      id: 'engineer', crest: 'lattice', accent: '#9b8bff', difficulty: 4,
      name: 'Dr Petra Sikora',
      title: 'The Engineer',
      blurb: 'Ran the national works bureau before she ran the country. Thinks ' +
        'in networks, and is visibly impatient with everything else.',
      buff: {
        label: 'Research runs 35% faster, and one extra minister',
        mods: { 'research.mult': 1.35, 'ministerSlots.add': 1 },
      },
      handicap: {
        label: 'Cold to the provinces: every region settles 4 lower',
        mods: { 'natural.base': -4 },
      },
      mechanic: {
        label: 'Trunk Doctrine — a region’s development lifts every region it borders',
        mods: { 'spillover.perDevelopment': 0.04 },
      },
    },

    {
      id: 'caretaker', crest: 'keystone', accent: '#8fa3bd', difficulty: 1,
      name: 'Ansel Brask',
      title: 'The Caretaker',
      blurb: 'Appointed to hold the chair for eighteen months. That was four ' +
        'years ago, and nobody has raised it since.',
      buff: {
        label: 'A calm, forgettable government: Mandate drains 7% slower',
        mods: { 'mandateDecay.mult': 0.93 },
      },
      handicap: {
        label: 'No agenda of his own: research runs 30% slower',
        mods: { 'research.mult': 0.70 },
      },
      mechanic: {
        label: 'Government of the Day — policies are free, and change four times as often',
        mods: { 'policyCost.mult': 0, 'policyCooldown.mult': 0.25 },
      },
    },
  ];

  /* `difficulty` is not flavour and it is not a guess: it is where each leader
   * landed in the harness, running the SAME build-focused strategy against
   * TWELVE seeds. Re-measured in Phase 5 with `node tools/harness.js --seeds
   * 12 --strategy builder`, and the ordering changed almost completely — see
   * BALANCE.md, and note that every Phase 4 rating was taken from six seeds,
   * which was not enough to tell 3/6 from 5/6.
   *
   *   terms served out of 12, build-focused play:
   *     Caretaker 8   Reformer 7   Comptroller 6
   *     Marshal 5     Tribune 3    Engineer 3
   *
   *   1  Forgiving   two thirds of seeds survive   Caretaker, Reformer
   *   2  Steady      about half                    Comptroller
   *   3  Demanding   under half                    Marshal
   *   4  Punishing   a quarter                     Tribune, Engineer
   *
   * Showing it on the selection screen is honest: a player who picks the
   * hardest leader first and loses should know they picked the hard one, not
   * conclude the game is unfair. */
  Mandate.LEADERS.DIFFICULTY_LABELS = {
    1: 'Forgiving', 2: 'Steady', 3: 'Demanding', 4: 'Punishing',
  };

  Mandate.LEADERS.byId = function (id) {
    for (var i = 0; i < Mandate.LEADERS.length; i++) {
      if (Mandate.LEADERS[i].id === id) return Mandate.LEADERS[i];
    }
    return null;
  };

  /**
   * A leader's three payloads as one list, for src/modifiers.js to apply and
   * for the selection screen to list. Keeping them separate in the data and
   * flattening them here means the UI can describe them one by one while the
   * simulation sees a single set of modifiers.
   */
  Mandate.LEADERS.payloads = function (leader) {
    if (!leader) return [];
    return [leader.buff, leader.handicap, leader.mechanic].filter(Boolean);
  };
})(window.Mandate = window.Mandate || {});
