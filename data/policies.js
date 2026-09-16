/* ============================================================================
 * data/policies.js — STANDING NATIONAL DECISIONS.
 * ----------------------------------------------------------------------------
 * Where tech is a one-way ratchet you buy with time, a policy is a POSTURE you
 * hold and can change your mind about. Each category has exactly one option
 * active at all times — there is no "no taxation policy" — so a policy is
 * never a bonus you switch on, it is a trade you are currently making.
 *
 * Three things keep them from being free wins:
 *   - every non-default option costs Political Capital to enact
 *   - some carry an ONGOING cost (`upkeep`, charged every day)
 *   - a category cannot be changed again for `policies.cooldownDays`, so
 *     flip-flopping to whatever suits today is not a strategy
 *
 * `default: true` marks the option a new government starts on. It must always
 * be the neutral one (no mods, no upkeep) — the baseline the others are
 * measured against.
 *
 * `mods` / `flags` are the same contract as tech nodes: see src/modifiers.js.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  Mandate.POLICIES = [
    {
      id: 'taxation',
      label: 'Taxation',
      blurb: 'What the centre takes, and what the provinces resent it for.',
      options: [
        {
          id: 'taxLight', label: 'Light Hand',
          blurb: 'Take less and be liked for it. Treasury down 15%, every region settles 4 higher.',
          cost: 10,
          mods: { 'treasury.mult': 0.85, 'natural.base': 4 },
        },
        {
          id: 'taxBalanced', label: 'Conventional', default: true,
          blurb: 'What the last government did.',
        },
        {
          id: 'taxHeavy', label: 'Heavy Levy',
          blurb: 'Squeeze the provinces. Treasury up 25%, regions settle 7 lower, ' +
                 'and the clock runs faster.',
          cost: 10,
          mods: { 'treasury.mult': 1.25, 'natural.base': -7, 'mandateDecay.mult': 1.05 },
        },
      ],
    },
    {
      id: 'conscription',
      label: 'Conscription',
      blurb: 'Where the soldiers in your garrisons actually come from.',
      options: [
        {
          id: 'volunteer', label: 'Volunteer Force', default: true,
          blurb: 'Whoever turns up.',
        },
        {
          id: 'selective', label: 'Selective Service',
          blurb: 'Call up by ballot. Manpower up 40%, output down 5%.',
          cost: 10,
          mods: { 'manpower.mult': 1.40, 'output.mult': 0.95 },
        },
        {
          id: 'universal', label: 'Universal Service',
          blurb: 'Everyone serves. Twice the Manpower and far more room for it, ' +
                 'but the provinces settle 5 lower and the clock runs faster.',
          cost: 14,
          mods: {
            'manpower.mult': 2.0, 'manpowerCap.mult': 1.50,
            'natural.base': -5, 'mandateDecay.mult': 1.08,
          },
        },
      ],
    },
    {
      id: 'press',
      label: 'The Press',
      blurb: 'How much the country is allowed to know about how it is going.',
      options: [
        {
          id: 'pressFree', label: 'Free Press',
          blurb: 'Standing you earn honestly: +0.04 Political Capital a day — ' +
                 'and a crisis anywhere is news everywhere, so unrest spreads 30% harder.',
          cost: 10,
          mods: { 'pc.perDay.add': 0.04, 'neighbourUnrest.mult': 1.30 },
        },
        {
          id: 'pressManaged', label: 'Managed Press', default: true,
          blurb: 'Briefings, not blackouts.',
        },
        {
          id: 'pressCensored', label: 'Censorship',
          blurb: 'Nothing travels. Unrest spreads 45% less, but Political Capital ' +
                 'accrues 30% slower and the clock runs faster.',
          cost: 12,
          upkeep: { treasury: 0.4 },
          mods: {
            'neighbourUnrest.mult': 0.55, 'pc.perDay.mult': 0.70,
            'mandateDecay.mult': 1.06,
          },
        },
      ],
    },
    {
      id: 'spending',
      label: 'Public Spending',
      blurb: 'What the state pays to keep what it already has.',
      options: [
        {
          id: 'frugal', label: 'Frugal',
          blurb: 'Defer the maintenance. Upkeep down 15%, regions settle 4 lower.',
          cost: 8,
          mods: { 'upkeep.mult': 0.85, 'natural.base': -4 },
        },
        {
          id: 'standard', label: 'Standard', default: true,
          blurb: 'Keep the lights on.',
        },
        {
          id: 'generous', label: 'Generous',
          blurb: 'Fund everything properly. Regions settle 5 higher, upkeep up 25%.',
          cost: 10,
          mods: { 'upkeep.mult': 1.25, 'natural.base': 5 },
        },
      ],
    },
  ];

  Mandate.POLICIES.category = function (id) {
    for (var i = 0; i < Mandate.POLICIES.length; i++) {
      if (Mandate.POLICIES[i].id === id) return Mandate.POLICIES[i];
    }
    return null;
  };

  Mandate.POLICIES.option = function (categoryId, optionId) {
    var category = Mandate.POLICIES.category(categoryId);
    if (!category) return null;
    for (var i = 0; i < category.options.length; i++) {
      if (category.options[i].id === optionId) return category.options[i];
    }
    return null;
  };

  /** The option a new government starts on, for each category. */
  Mandate.POLICIES.defaults = function () {
    var out = {};
    Mandate.POLICIES.forEach(function (category) {
      category.options.forEach(function (option) {
        if (option.default) out[category.id] = option.id;
      });
    });
    return out;
  };
})(window.Mandate = window.Mandate || {});
