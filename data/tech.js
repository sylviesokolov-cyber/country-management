/* ============================================================================
 * data/tech.js — THE TECH TREE. Four branches, twenty nodes, zero logic.
 * ----------------------------------------------------------------------------
 * A node is a purchase of TWO scarce things:
 *
 *   cost  — Political Capital, paid the moment it is queued
 *   days  — research time, spent one point per day by the research queue
 *
 * Time is the reason the tree is a tree. Political Capital alone would make
 * this a shopping list; the queue means every node you start is a node you are
 * NOT starting, and a run is only ~3300 days long against ~5000 days of tree.
 * Nobody finishes it. That is the point.
 *
 * ---------------------------------------------------------------------------
 * HOW A NODE CHANGES THE GAME
 *
 * Nodes never contain logic. They declare `mods` (numbers) and `flags`
 * (switches), and src/modifiers.js sums them into one table that src/sim.js
 * reads. Adding a node is a data edit; adding a *kind* of node is one line in
 * the sim where that modifier key is read.
 *
 *   mods: keys ending in `.mult` MULTIPLY together (default 1),
 *         every other key ADDS    together (default 0).
 *   flags: named switches the sim checks by name, never by node id.
 *
 * The full list of keys the sim understands is documented in
 * src/modifiers.js — that file is the contract, this one is the content.
 *
 * ---------------------------------------------------------------------------
 * THE DESIGN RULE (DESIGN.md §2.3): a mid-tier node must CHANGE HOW SYSTEMS
 * INTERACT, not hand out a percentage. Flat bonuses are allowed at tier 1 and
 * at leaves, where they are pacing rather than strategy. The five nodes that
 * carry this phase are marked ★ below:
 *
 *   ★ Federal Devolution     regions self-correct fast, the country earns less
 *   ★ Deficit Financing      bankruptcy stops eating the country and starts
 *                            eating the clock instead
 *   ★ Martial Doctrine       garrisons firewall unrest, but soldiers in the
 *                            streets cost legitimacy every day
 *   ★ Trunk Network          development spills over into NEIGHBOURS, so the
 *                            adjacency map becomes an investment plan
 *   ★ Technocratic Ministries  Political Capital comes from what you have BUILT
 *                            instead of from how calm it is — the one way out
 *                            of a permanent crisis
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  Mandate.TECH = {
    /* Branch order here is the column order in the Tech tab. */
    branches: [
      /* `icon` is a sprite id from src/ui/icons.js, not a character. It was an
       * emoji until Phase 5's art pass: emoji are a different artist's work on
       * every platform and carry their own colour, so four of them side by
       * side can never look like one set. */
      { id: 'economy',        label: 'Economy',        icon: 'treasury' },
      { id: 'infrastructure', label: 'Infrastructure', icon: 'works' },
      { id: 'governance',     label: 'Governance',     icon: 'capital' },
      { id: 'security',       label: 'Security',       icon: 'garrison' },
    ],

    nodes: [
      /* ------------------------------------------------------- ECONOMY --- */
      {
        id: 'landRegistry', branch: 'economy', tier: 1,
        name: 'Land Registry',
        blurb: 'Know who owns what, and tax it. Every region produces more.',
        cost: 8, days: 140,
        mods: { 'output.mult': 1.08 },
      },
      {
        id: 'revenueService', branch: 'economy', tier: 1,
        name: 'Revenue Service',
        blurb: 'Collection that actually collects. More Treasury per unit of output.',
        cost: 12, days: 200, requires: ['landRegistry'],
        mods: { 'treasury.mult': 1.10 },
      },
      {
        /* ★ Changes what bankruptcy MEANS. Austerity normally eats development
         * and stability — a death spiral. With this, the unpaid share of the
         * bill is charged to Mandate instead: you can deliberately run the
         * country into deficit to buy a crisis some time, and pay for it in
         * the only currency that never comes back. */
        id: 'deficitFinancing', branch: 'economy', tier: 2,
        name: 'Deficit Financing',
        blurb: 'Borrow against your term. Unpaid bills no longer wreck the country — ' +
               'they burn Mandate instead.',
        cost: 20, days: 300, requires: ['revenueService'],
        flags: ['austerityHitsMandate'],
      },
      {
        id: 'industrialCredit', branch: 'economy', tier: 3,
        name: 'Industrial Credit',
        blurb: 'Cheap capital for provincial industry. Invest costs far less.',
        cost: 22, days: 340, requires: ['deficitFinancing'],
        mods: { 'cost.invest.mult': 0.75 },
      },
      {
        id: 'sovereignFund', branch: 'economy', tier: 3,
        name: 'Sovereign Fund',
        blurb: 'Bank the good years. A little more output, a little less upkeep.',
        cost: 16, days: 260, requires: ['revenueService'],
        mods: { 'output.mult': 1.06, 'upkeep.mult': 0.94 },
      },

      /* ------------------------------------------------ INFRASTRUCTURE --- */
      {
        id: 'roadCorps', branch: 'infrastructure', tier: 1,
        name: 'Road Corps',
        blurb: 'Maintenance by conscript labour. Everything you own costs less to hold.',
        cost: 8, days: 140,
        mods: { 'upkeep.mult': 0.90 },
      },
      {
        id: 'publicHousing', branch: 'infrastructure', tier: 2,
        name: 'Public Housing',
        blurb: 'Public Works lands much harder — and costs a little more.',
        cost: 14, days: 220, requires: ['roadCorps'],
        mods: { 'effect.publicWorks.mult': 1.5, 'cost.publicWorks.mult': 1.2 },
      },
      {
        /* ★ Turns the adjacency map into an investment plan. Until now a
         * neighbour could only ever hurt you (unrest spreads). This makes a
         * developed region prop its neighbours up, so WHERE you build starts
         * to matter as much as how much. */
        id: 'trunkNetwork', branch: 'infrastructure', tier: 2,
        name: 'Trunk Network',
        blurb: 'Roads that leave the province. A developed region now lifts ' +
               'every region it borders.',
        cost: 18, days: 280, requires: ['roadCorps'],
        mods: { 'spillover.perDevelopment': 0.05 },
      },
      {
        id: 'powerGrid', branch: 'infrastructure', tier: 3,
        name: 'National Grid',
        blurb: 'Every point of development holds more stability on its own.',
        cost: 20, days: 320, requires: ['trunkNetwork'],
        mods: { 'natural.perDevelopment.mult': 1.15 },
      },
      {
        id: 'labourMobilisation', branch: 'infrastructure', tier: 3,
        name: 'Labour Mobilisation',
        blurb: 'Work brigades. More Manpower, and more room to hold it.',
        cost: 16, days: 240, requires: ['publicHousing'],
        mods: { 'manpower.mult': 1.20, 'manpowerCap.mult': 1.15 },
      },

      /* ---------------------------------------------------- GOVERNANCE --- */
      {
        id: 'civilService', branch: 'governance', tier: 1,
        name: 'Civil Service',
        blurb: 'A state that can staff itself. Faster research, steadier standing.',
        cost: 8, days: 150,
        mods: { 'pc.perDay.add': 0.02, 'research.mult': 1.15 },
      },
      {
        id: 'censusBureau', branch: 'governance', tier: 1,
        name: 'Census Bureau',
        blurb: 'Records, rolls and statistics. Room for one more minister.',
        cost: 10, days: 180, requires: ['civilService'],
        mods: { 'ministerSlots.add': 1 },
      },
      {
        /* ★ The headline node of the phase. Regions close the gap to their
         * natural level two and a half times faster, which cuts BOTH ways:
         * Public Works washes out almost immediately, and a region you finally
         * developed properly recovers in weeks instead of years. You stop
         * patching and start building — and you accept a smaller economy for
         * the privilege. */
        id: 'federalDevolution', branch: 'governance', tier: 2,
        name: 'Federal Devolution',
        blurb: 'Regions govern themselves: stability snaps to what a region is ' +
               'actually worth, far faster — but the centre collects less.',
        cost: 20, days: 300, requires: ['censusBureau'],
        mods: { 'reversion.mult': 2.5, 'natural.base': 5, 'output.mult': 0.88 },
      },
      {
        id: 'provincialAcademies', branch: 'governance', tier: 2,
        name: 'Provincial Academies',
        blurb: 'Train your own governors. One more governor slot, and cheaper salaries.',
        cost: 14, days: 230, requires: ['civilService'],
        mods: { 'governorSlots.add': 1, 'salary.mult': 0.85 },
      },
      {
        /* ★ Rewrites where Political Capital comes from. Normally standing is
         * earned by calm, which means a leader in crisis has no way to buy
         * their way out. This pays on DEVELOPMENT instead — the one number a
         * burning country can still move. */
        id: 'technocraticMinistries', branch: 'governance', tier: 3,
        name: 'Technocratic Ministries',
        blurb: 'Govern by results, not by mood. Political Capital comes from ' +
               'what you have built instead of from how calm it is.',
        cost: 24, days: 360, requires: ['federalDevolution'],
        flags: ['pcFromDevelopment'],
      },

      /* ------------------------------------------------------ SECURITY --- */
      {
        id: 'gendarmerie', branch: 'security', tier: 1,
        name: 'Gendarmerie',
        blurb: 'Police the provinces properly. Garrisons cost much less to keep.',
        cost: 8, days: 140,
        mods: { 'garrisonUpkeep.mult': 0.80 },
      },
      {
        /* ★ Makes a garrison a FIREWALL rather than a patch. A garrisoned
         * region stops passing unrest along, so troops change the shape of a
         * crisis instead of just the size of one. The price is paid daily, in
         * the one resource you cannot earn back. */
        id: 'martialDoctrine', branch: 'security', tier: 2,
        name: 'Martial Doctrine',
        blurb: 'Garrisons hold the line and stop unrest crossing them — but ' +
               'troops in the streets cost you Mandate every day they stay.',
        cost: 18, days: 280, requires: ['gendarmerie'],
        mods: { 'garrisonBonus.add': 6, 'mandate.perGarrisonPerDay': 0.003 },
        flags: ['garrisonBlocksContagion'],
      },
      {
        id: 'civilDefence', branch: 'security', tier: 2,
        name: 'Civil Defence',
        blurb: 'Local wardens and shelters. Unrest next door bites far less.',
        cost: 14, days: 220, requires: ['gendarmerie'],
        mods: { 'neighbourUnrest.mult': 0.60 },
      },
      {
        id: 'reliefCorps', branch: 'security', tier: 3,
        name: 'Relief Corps',
        blurb: 'A standing disaster service. Emergency Relief is cheaper and stronger.',
        cost: 16, days: 250, requires: ['civilDefence'],
        mods: { 'effect.relief.mult': 1.4, 'cost.relief.mult': 0.70 },
      },
      {
        id: 'veteransProgramme', branch: 'security', tier: 3,
        name: "Veterans' Programme",
        blurb: 'Soldiering becomes a career. Garrisons are cheaper to raise and ' +
               'less resented.',
        cost: 18, days: 300, requires: ['martialDoctrine'],
        mods: { 'cost.garrison.mult': 0.70, 'mandateDecay.mult': 0.95 },
      },
    ],
  };

  /** Node definition by id, or null. Used by the sim and the Tech tab. */
  Mandate.TECH.byId = function (id) {
    var nodes = Mandate.TECH.nodes;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes[i];
    }
    return null;
  };
})(window.Mandate = window.Mandate || {});
