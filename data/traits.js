/* ============================================================================
 * data/traits.js — WHAT AN APPOINTEE IS GOOD AND BAD AT.
 * ----------------------------------------------------------------------------
 * A trait is the same shape as a tech node's payload: `mods` and `flags`, read
 * by src/modifiers.js. The only difference is WHERE it applies, and that is
 * decided by the appointee's role, not by the trait:
 *
 *   a MINISTER's traits apply to the whole country
 *   a GOVERNOR's traits apply ONLY to the region they are assigned to
 *
 * That single rule is what makes assignment a real decision. A Technocrat is
 * worth a fortune in your industrial core and almost nothing in a frontier
 * region with 5 development — "the right minister in the wrong region should
 * feel like a waste" (DESIGN.md §2.4).
 *
 * `salary` is this trait's contribution to the appointee's daily wage, in
 * Treasury. DRAWBACKS CONTRIBUTE A NEGATIVE SALARY: nobody pays full price for
 * a governor everyone knows is on the take. That is what makes a flawed
 * candidate a genuine offer rather than simply a worse one, and it is why the
 * pool can hand you someone cheap and dangerous.
 *
 * `roles` says which pools a trait can be drawn into, so a Scholar never turns
 * up as a provincial governor with nothing to research.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  Mandate.TRAITS = {

    /* ------------------------------------------------------- GOVERNORS --- */
    /* Region-scoped. These are the traits worth moving a person for. */

    technocrat: {
      id: 'technocrat', label: 'Technocrat', roles: ['governor'],
      blurb: 'Runs the province like a business. +15% output here.',
      salary: 0.30,
      mods: { 'output.mult': 1.15 },
    },
    reformer: {
      id: 'reformer', label: 'Reformer', roles: ['governor'],
      blurb: 'Gets more peace out of every road built. Development holds 15% more stability here.',
      salary: 0.30,
      mods: { 'natural.perDevelopment.mult': 1.15 },
    },
    conciliator: {
      id: 'conciliator', label: 'Conciliator', roles: ['governor'],
      blurb: 'Talks people down. This region settles 6 points higher.',
      salary: 0.25,
      mods: { 'natural.base': 6 },
    },
    builder: {
      id: 'builder', label: 'Builder', roles: ['governor'],
      blurb: 'Knows every contractor in the province. Invest costs 30% less here.',
      salary: 0.30,
      mods: { 'cost.invest.mult': 0.70 },
    },
    quartermaster: {
      id: 'quartermaster', label: 'Quartermaster', roles: ['governor'],
      blurb: 'Runs a tight garrison: stronger, and 20% cheaper to keep.',
      salary: 0.25,
      mods: { 'garrisonBonus.add': 6, 'garrisonUpkeep.mult': 0.80 },
    },
    strongman: {
      id: 'strongman', label: 'Strongman', roles: ['governor'],
      blurb: 'Holds the province by the throat. Far more stable, and 12% less productive.',
      salary: 0.20,
      mods: { 'natural.base': 11, 'output.mult': 0.88 },
    },

    /* ------------------------------------------------------- MINISTERS --- */
    /* National. These are the traits worth a permanent slot. */

    economist: {
      id: 'economist', label: 'Economist', roles: ['minister'],
      blurb: 'Every unit of output turns into 10% more Treasury.',
      salary: 0.35,
      mods: { 'treasury.mult': 1.10 },
    },
    scholar: {
      id: 'scholar', label: 'Scholar', roles: ['minister'],
      blurb: 'Research runs 25% faster.',
      salary: 0.35,
      mods: { 'research.mult': 1.25 },
    },
    orator: {
      id: 'orator', label: 'Orator', roles: ['minister'],
      blurb: 'Speaks for the government and is believed. +0.03 Political Capital a day.',
      salary: 0.30,
      mods: { 'pc.perDay.add': 0.03 },
    },
    auditor: {
      id: 'auditor', label: 'Auditor', roles: ['minister'],
      blurb: 'Finds the waste. The national upkeep bill drops 10%.',
      salary: 0.35,
      mods: { 'upkeep.mult': 0.90 },
    },
    general: {
      id: 'general', label: 'General', roles: ['minister'],
      blurb: 'Every garrison holds better, and recruitment runs 15% hotter.',
      salary: 0.35,
      mods: { 'garrisonBonus.add': 4, 'manpower.mult': 1.15 },
    },
    hardliner: {
      id: 'hardliner', label: 'Hardliner', roles: ['minister'],
      blurb: 'Contains a crisis before it spreads — and is nobody’s favourite. ' +
             'Unrest travels 30% less; Mandate drains 8% faster.',
      salary: 0.20,
      mods: { 'neighbourUnrest.mult': 0.70, 'mandateDecay.mult': 1.08 },
    },

    /* -------------------------------------------------------- DRAWBACKS --- */
    /* Negative salary: a flawed appointee is CHEAP, which is the whole offer.
     * These are drawn as a second trait, never as a first. */

    corrupt: {
      id: 'corrupt', label: 'Corrupt', roles: ['governor', 'minister'], drawback: true,
      blurb: 'Skims. Output down 12%, upkeep up 15%.',
      salary: -0.20,
      mods: { 'output.mult': 0.88, 'upkeep.mult': 1.15 },
    },
    factional: {
      id: 'factional', label: 'Factional', roles: ['governor', 'minister'], drawback: true,
      blurb: 'Owes somebody. Mandate drains 8% faster while they serve.',
      salary: -0.15,
      mods: { 'mandateDecay.mult': 1.08 },
    },
    paranoid: {
      id: 'paranoid', label: 'Paranoid', roles: ['governor'], drawback: true,
      blurb: 'Sees plots everywhere. Garrison upkeep up 50%.',
      salary: -0.12,
      mods: { 'garrisonUpkeep.mult': 1.50 },
    },
    spendthrift: {
      id: 'spendthrift', label: 'Spendthrift', roles: ['governor', 'minister'], drawback: true,
      blurb: 'Signs anything. Every salary in government costs 25% more.',
      salary: -0.15,
      mods: { 'salary.mult': 1.25 },
    },
    aloof: {
      id: 'aloof', label: 'Aloof', roles: ['minister'], drawback: true,
      blurb: 'Never explains. Political Capital accrues 25% slower.',
      salary: -0.15,
      mods: { 'pc.perDay.mult': 0.75 },
    },
  };

  Mandate.TRAITS.byId = function (id) {
    return Mandate.TRAITS[id] || null;
  };

  /** Every trait id a role can be given, split into perks and drawbacks. */
  Mandate.TRAITS.poolFor = function (role, drawback) {
    var out = [];
    Object.keys(Mandate.TRAITS).forEach(function (key) {
      var trait = Mandate.TRAITS[key];
      if (!trait || typeof trait !== 'object' || !trait.roles) return;
      if (trait.roles.indexOf(role) === -1) return;
      if (!!trait.drawback !== !!drawback) return;
      out.push(trait.id);
    });
    return out;
  };
})(window.Mandate = window.Mandate || {});
