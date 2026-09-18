/* ============================================================================
 * data/projects.js — NATIONAL PROJECTS. The late game.
 * ----------------------------------------------------------------------------
 * THE PROBLEM THIS EXISTS TO SOLVE
 *
 * Three phases running, the DEVLOG has opened its "Next" section with the same
 * sentence: the late game is flat. In a won run every region reaches
 * development 100 somewhere around day 3,000, after which the Treasury climbs
 * past 20,000 with nothing to spend it on and Political Capital sits pinned at
 * its cap. The last 500 days of a good term contain no decisions at all —
 * which is the idle-game spreadsheet DESIGN.md says the whole game exists to
 * design against, arriving through the back door at the end of a won run.
 *
 * Three separate things are broken there, and a project answers all three:
 *
 *   1. DEVELOPMENT FINISHES.     A project can raise the ceiling, so the
 *                                country is never finished being built.
 *   2. TREASURY HAS NO SINK.     A project bills the Treasury EVERY DAY while
 *                                it is being built, and several keep billing
 *                                forever once they are. A state that has
 *                                undertaken great works is permanently more
 *                                expensive to run.
 *
 *                                Almost all of a project's price is that daily
 *                                bill rather than a sum up front, and the
 *                                harness is why. Priced as a lump of a few
 *                                thousand, a project is unreachable in the
 *                                mid-game — every run measured spent its
 *                                Treasury down to the Invest threshold and
 *                                never held one — and by the time the surplus
 *                                exists there is no term left to build in. As
 *                                a daily bill, a project competes with Invest
 *                                on every single day it is running, which is
 *                                the decision worth having.
 *   3. POLITICAL CAPITAL PINS.   A project costs 22-32 of it to start — two
 *                                or three tech nodes' worth, so it competes
 *                                with the tree rather than replacing it.
 *
 * WHAT A PROJECT IS
 *
 * One national undertaking at a time, measured in in-game YEARS rather than
 * days. Starting one is the biggest single commitment in the game: it takes
 * most of your standing, a large sum up front, a daily drain for two years,
 * and it forecloses the other five for as long as it runs.
 *
 * THE DESIGN RULE IS THE TECH TREE'S RULE (DESIGN.md §2.3), harder:
 * a project must CHANGE HOW THE SYSTEMS INTERACT. There is not a single flat
 * percentage in this file that is not paid for by a flat percentage going the
 * other way. Land Reclamation un-finishes development; the Federal Compact
 * governs the country for you and takes a tenth of the economy for it; the
 * Civic Endowment buys time directly, forever, out of the Treasury surplus
 * that was the problem in the first place.
 *
 * HOW ONE REACHES THE SIMULATION
 *
 * Exactly like a tech node: it declares `mods` and `flags`, src/modifiers.js
 * merges a completed project into the same table as everything else, and
 * src/sim.js reads keys. There is no `if (project === ...)` anywhere, and a
 * seventh project is an object in this file.
 *
 * WHY THEY ALL UNLOCK SO LATE
 *
 * Every `requires` below sits at day 1,200 or later, and that is measured
 * rather than thematic. Gated from day 600-900, the harness took them in the
 * mid-game, when a 13-20 a day bill is most of a young country's surplus: the
 * builder went from 19 wins in 36 to 2, with three regions in unrest, having
 * spent the decade that should have built the country on a monument to it.
 * The flat stretch these exist to fill starts around day 2,500. They are
 * priced and gated for that stretch, not for the whole term.
 *
 * The daily bills are sized against what the country actually earns, which is
 * less than it looks: a well-run term nets around 20-25 a day once upkeep is
 * paid. Priced at 13-20 a day — sized by eye against a rich endgame — a
 * project took the entire surplus of the country that started it, and the
 * harness watched a builder go bankrupt at day 1,800 and lose the run to the
 * austerity spiral. Every `requires` now also asks for the DEVELOPMENT that
 * pays the bill, not just the day on the calendar — and the one project that
 * was gated on research and the calendar alone (the Academy) is exactly the
 * one the harness caught starting at development 530 with nothing in the
 * Treasury, stalling at 40% built, and taking the run down with it.
 *
 * `requires` keys understood by Sim.projectStatus:
 *   day                  in-game day, so the option cannot arrive too early
 *   nationalDevelopment  total development across all sixteen regions
 *   techCompleted        how many nodes have been finished
 *   project              another project that must be finished first
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var PROJECTS = [
    /* ---------------------------------------------------------------- 1 --
     * The direct answer to "development caps out around day 3,000". */
    {
      id: 'reclamation',
      name: 'Land Reclamation Authority',
      icon: 'projects',
      blurb: 'Drain the marshes, terrace the highlands, push the coast out. ' +
        'The country stops being finished.',
      changes: 'Every region can be developed 30 points beyond what was ' +
        'thought to be its limit.',
      requires: { nationalDevelopment: 1000, day: 1400 },
      cost: { politicalCapital: 25, treasury: 600 },
      perDay: { treasury: 9 },
      days: 600,
      upkeep: { treasury: 5 },
      /* Read by src/sim.js wherever development is clamped. It is the only
       * modifier in the game that moves a hard limit rather than a rate, and
       * it is worth ~48,000 Treasury of Invests at 120 a go — which is the
       * whole surplus problem, spent on the map. */
      mods: { 'development.cap': 30 },
    },

    /* ---------------------------------------------------------------- 2 --
     * The Treasury sink that buys the one thing money cannot otherwise buy.
     * It is deliberately the most expensive thing in the game to KEEP. */
    {
      id: 'endowment',
      name: 'The Civic Endowment',
      icon: 'capital',
      blurb: 'A permanent public fund: schools, clinics, pensions, paid out ' +
        'of the surplus for as long as there is one.',
      changes: 'The baseline drain on your Mandate is 18% slower — but the ' +
        'endowment costs 12 a day, forever, and a term that cannot pay it ' +
        'goes into austerity like any other unpaid bill.',
      requires: { day: 1800, nationalDevelopment: 1000 },
      cost: { politicalCapital: 30, treasury: 800 },
      perDay: { treasury: 10 },
      days: 480,
      upkeep: { treasury: 12 },
      /* Mandate is still never refilled and never recovered — this slows the
       * baseline, exactly as approval does. See BALANCE.mandate. */
      mods: { 'mandateDecay.mult': 0.82 },
    },

    /* ---------------------------------------------------------------- 3 --
     * For a run that got its economy right and its clock wrong. */
    {
      id: 'academy',
      name: 'The National Academy',
      icon: 'tech',
      blurb: 'One institution to train the civil service, the engineers and ' +
        'the people who will replace you.',
      changes: 'Research runs 75% faster, and you may appoint one more ' +
        'minister and one more governor.',
      requires: { techCompleted: 5, day: 1400, nationalDevelopment: 900 },
      cost: { politicalCapital: 28, treasury: 500 },
      perDay: { treasury: 7 },
      days: 540,
      upkeep: { treasury: 5 },
      mods: {
        'research.mult': 1.75,
        'ministerSlots.add': 1,
        'governorSlots.add': 1,
      },
    },

    /* ---------------------------------------------------------------- 4 --
     * Hands the country back to itself. The identity project for a run that
     * is winning and wants to stop firefighting. */
    {
      id: 'compact',
      name: 'The Federal Compact',
      icon: 'policies',
      blurb: 'Write the provinces’ autonomy into law, and let them hold ' +
        'themselves together without a minister standing over them.',
      changes: 'Regions correct toward their natural level more than twice ' +
        'as fast and settle 4 points higher — and the centre collects 12% ' +
        'less from all of it.',
      requires: { day: 1600, nationalDevelopment: 900 },
      cost: { politicalCapital: 32, treasury: 400 },
      perDay: { treasury: 6 },
      days: 660,
      upkeep: {},
      mods: {
        'reversion.mult': 2.2,
        'natural.base': 4,
        'treasury.mult': 0.88,
      },
    },

    /* ---------------------------------------------------------------- 5 --
     * The Phase 5 crisis design, taken to its conclusion: a standing army is
     * a way of life rather than a panic measure. */
    {
      id: 'reserve',
      name: 'Strategic Reserve Corps',
      icon: 'garrison',
      blurb: 'A professional standing army, garrisoned as policy rather than ' +
        'as emergency — barracks, not checkpoints.',
      changes: 'Garrisons cost half as much to keep, hold 6 more points of ' +
        'stability, and stop costing you Mandate every day. You can hold ' +
        'half as much Manpower again.',
      requires: { day: 1200, nationalDevelopment: 800 },
      cost: { politicalCapital: 22, treasury: 500, manpower: 40 },
      perDay: { treasury: 7 },
      days: 480,
      upkeep: { treasury: 6 },
      mods: {
        'garrisonUpkeep.mult': 0.5,
        'garrisonBonus.add': 6,
        'manpowerCap.mult': 1.5,
        /* Cancels the standing per-garrison Mandate charge. Additive, so a
         * leader or policy that raises it still shows through. */
        'mandate.perGarrisonPerDay': -0.02,
      },
    },

    /* ---------------------------------------------------------------- 6 --
     * Makes the whole state cheaper to run, which is the other way to answer
     * a Treasury problem: stop needing the money. */
    {
      id: 'court',
      name: 'The Anti-Corruption Court',
      icon: 'ministry',
      blurb: 'A court with the power to audit ministries and remove the ' +
        'people running them. Including, in principle, you.',
      changes: 'Everything you have built costs 20% less to maintain, ' +
        'salaries fall by 30%, and a visibly clean government earns a little ' +
        'more Political Capital.',
      requires: { day: 1500, techCompleted: 5, nationalDevelopment: 900 },
      cost: { politicalCapital: 26, treasury: 700 },
      perDay: { treasury: 8 },
      days: 540,
      upkeep: { treasury: 3 },
      mods: {
        'upkeep.mult': 0.8,
        'salary.mult': 0.7,
        'pc.perDay.add': 0.03,
      },
    },
  ];

  PROJECTS.byId = function (id) {
    for (var i = 0; i < PROJECTS.length; i++) {
      if (PROJECTS[i].id === id) return PROJECTS[i];
    }
    return null;
  };

  Mandate.PROJECTS = PROJECTS;
})(window.Mandate = window.Mandate || {});
