/* ============================================================================
 * data/events.js — WHAT THE COUNTRY DOES WHEN YOU AREN'T LOOKING.
 * ----------------------------------------------------------------------------
 * The purpose of an event is not surprise, it is PRESSURE THAT ARGUES WITH
 * YOUR PLAN. An event that fires blind is a dice roll and the player learns
 * nothing from it; an event that fires because three regions are in unrest and
 * the Treasury is empty is the game telling you what you have been ignoring.
 *
 * So every event carries `requires`, and the scheduler only ever draws from
 * events whose conditions the country currently meets (src/sim.js). Weight
 * then decides which of the eligible ones. That ordering — filter on the state
 * of the world, THEN roll — is what makes events read as consequences.
 *
 * ---------------------------------------------------------------------------
 * ANATOMY
 *
 *   weight        relative likelihood among everything else eligible
 *   minDay        nothing complicated should happen in week one
 *   cooldownDays  how long before this exact event may fire again
 *   once          true = at most once per run (used for the big set-pieces)
 *   requires      conditions on the country; ALL must hold
 *   target        picks a region the event is ABOUT: 'worst' | 'random' |
 *                 'randomUnstable' | 'richest' | 'capital'. `{region}` in any
 *                 text is replaced with its name.
 *   choices       2-3 of them. Each is a real trade; none is strictly best.
 *
 * A choice is:
 *   cost          resources spent (refused if unaffordable — the button greys)
 *   mandateCost   Mandate spent
 *   requires      extra conditions on the CHOICE (e.g. needs a garrison)
 *   effects       immediate: mandate, resources, and region changes aimed at
 *                 `target`, `allRegions`, `worstRegion` or `randomRegion`
 *   effect        a TEMPORARY modifier: { label, days, mods, flags }, which
 *                 goes into state.effects and expires on its own
 *   log           the line written into the run log
 *
 * THE DESIGN RULE, and it is the same one the tech tree has: a choice should
 * change what you do next, not just move a number. "Pay 200" versus "pay 400"
 * is not a choice. "Pay now" versus "let a region burn for a year" is.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  Mandate.EVENTS = [

    /* ===================================================================
     * CRISES — these exist to punish neglect, so they need unrest to fire.
     * =================================================================== */
    {
      id: 'grainRiots',
      title: 'Grain Riots in {region}',
      text: 'Bread queues turned into barricades overnight. The provincial ' +
        'governor is asking for money, troops, or permission to resign.',
      weight: 12, minDay: 150, cooldownDays: 500,
      requires: { unstableRegionsAtLeast: 1 },
      target: 'randomUnstable',
      choices: [
        {
          id: 'buyGrain', label: 'Buy grain at any price',
          blurb: 'Empty the reserve into {region}. It works, and everyone sees what it cost.',
          cost: { treasury: 180 },
          effects: { target: { stability: 14 } },
          log: 'Bought grain to break the riots in {region}.',
        },
        {
          id: 'sendTroops', label: 'Send in the troops',
          blurb: 'Order restored by tomorrow. The country will remember how.',
          cost: { manpower: 5 },
          mandateCost: 3,
          effects: { target: { stability: 20 }, allRegions: { stability: -2 } },
          log: 'Put down the {region} riots by force.',
        },
        {
          id: 'rideItOut', label: 'Ride it out',
          blurb: 'Say nothing, spend nothing, and hope the harvest is early.',
          effects: { target: { stability: -8 } },
          effect: {
            label: 'Unanswered riots', days: 240,
            mods: { 'neighbourUnrest.mult': 1.35 },
          },
          log: 'Ignored the riots in {region}.',
        },
      ],
    },

    {
      id: 'separatists',
      title: 'Separatist Committee Declared in {region}',
      text: 'A provincial assembly has voted itself into existence and is ' +
        'collecting its own taxes. It is not yet a rebellion. It is not far off.',
      weight: 9, minDay: 500, cooldownDays: 900,
      requires: { unstableRegionsAtLeast: 2 },
      target: 'worst',
      choices: [
        {
          id: 'negotiate', label: 'Negotiate an autonomy deal',
          blurb: 'Give {region} what it wants. It settles, and every other province takes notes.',
          cost: { politicalCapital: 12 },
          effects: { target: { stability: 22 } },
          effect: {
            label: 'Autonomy precedent', days: 720,
            mods: { 'treasury.mult': 0.92 },
          },
          log: 'Granted {region} autonomy to end the separatist crisis.',
        },
        {
          id: 'garrisonIt', label: 'Garrison the province',
          blurb: 'Station troops and keep them there. Expensive, resented, effective.',
          cost: { treasury: 90, manpower: 8 },
          mandateCost: 5,
          effects: { target: { stability: 16, garrisoned: true } },
          log: 'Garrisoned {region} against the separatists.',
        },
        {
          id: 'ignoreThem', label: 'Refuse to dignify it',
          blurb: 'Say nothing. The committee grows, and so does the idea.',
          effects: { target: { stability: -12 } },
          effect: {
            label: 'Separatist contagion', days: 540,
            mods: { 'neighbourUnrest.mult': 1.5, 'natural.base': -3 },
          },
          log: 'Refused to acknowledge the {region} separatists.',
        },
      ],
    },

    {
      id: 'bankRun',
      title: 'Run on the National Bank',
      text: 'Word got out that the Treasury missed a payment. The queues ' +
        'started at dawn and have not shortened.',
      weight: 14, minDay: 200, cooldownDays: 600,
      requires: { austerity: true },
      choices: [
        {
          id: 'guarantee', label: 'Guarantee every deposit',
          blurb: 'Promise what you do not have. It stops the queues and mortgages the term.',
          mandateCost: 6,
          effects: { allRegions: { stability: 5 } },
          log: 'Guaranteed deposits to stop the bank run.',
        },
        {
          id: 'closeTheDoors', label: 'Close the banks for a week',
          blurb: 'Buys time, at the cost of everyone finding out how bad it is.',
          effects: { allRegions: { stability: -4 } },
          effect: {
            label: 'Bank holiday', days: 180,
            mods: { 'upkeep.mult': 0.80, 'output.mult': 0.88 },
          },
          log: 'Closed the banks for a week.',
        },
      ],
    },

    {
      id: 'strikeWave',
      title: 'General Strike in the Industrial Belt',
      text: 'The unions have walked out across every developed region at once. ' +
        'They want wages. The ministry wants them back at work by Monday.',
      weight: 10, minDay: 400, cooldownDays: 700,
      requires: { nationalStabilityBelow: 55 },
      choices: [
        {
          id: 'concede', label: 'Concede the wage claim',
          blurb: 'Everything you own costs more to run from now on. Everyone goes home happy.',
          effects: { allRegions: { stability: 7 } },
          effect: {
            label: 'Wage settlement', days: 900,
            mods: { 'upkeep.mult': 1.12 },
          },
          log: 'Conceded the general strike.',
        },
        {
          id: 'breakIt', label: 'Break the strike',
          blurb: 'Send the gendarmerie. Production resumes. So does the resentment.',
          cost: { manpower: 6 }, mandateCost: 4,
          effects: { allRegions: { stability: -3 } },
          effect: {
            label: 'Broken strike', days: 540,
            mods: { 'output.mult': 1.10, 'natural.base': -3 },
          },
          log: 'Broke the general strike.',
        },
        {
          id: 'waitThemOut', label: 'Wait them out',
          blurb: 'Nobody can afford a long strike. Including you.',
          effect: {
            label: 'Stoppage', days: 200,
            mods: { 'output.mult': 0.78 },
          },
          log: 'Waited out the general strike.',
        },
      ],
    },

    /* ===================================================================
     * OPPORTUNITIES — these need the country to be doing WELL, so that
     * governing properly opens doors rather than merely avoiding doors
     * slamming. An event system that only punishes is a tax, not a system.
     * =================================================================== */
    {
      id: 'foreignCredit',
      title: 'A Foreign Credit Line',
      text: 'A consortium has noticed the country is being run competently and ' +
        'would like to lend against it. The terms are good. The optics are not.',
      weight: 10, minDay: 300, cooldownDays: 800,
      requires: { nationalStabilityAbove: 58 },
      choices: [
        {
          id: 'takeIt', label: 'Take the money',
          blurb: 'A great deal of Treasury now, and a visible debt to strangers.',
          mandateCost: 4,
          effects: { resources: { treasury: 900 } },
          log: 'Took the foreign credit line.',
        },
        {
          id: 'takeAdvisors', label: 'Take the advisors instead',
          blurb: 'No cash. Their engineers stay for two years and everything runs better.',
          effect: {
            label: 'Foreign advisors', days: 730,
            mods: { 'upkeep.mult': 0.85, 'research.mult': 1.25 },
          },
          log: 'Accepted foreign advisors instead of a loan.',
        },
        {
          id: 'declineIt', label: 'Decline, publicly',
          blurb: 'Refusing foreign money is the cheapest popularity there is.',
          effects: { allRegions: { stability: 4 } },
          log: 'Publicly declined foreign credit.',
        },
      ],
    },

    {
      id: 'universityFounded',
      title: 'The Academy Petitions for a Charter',
      text: 'A national university, funded largely by people who are not you, ' +
        'wants the state’s blessing and a building.',
      weight: 8, minDay: 400, cooldownDays: 1200, once: true,
      requires: { treasuryAbove: 400 },
      choices: [
        {
          id: 'fundIt', label: 'Fund it properly',
          blurb: 'A real institution. Research runs faster for the rest of the term.',
          cost: { treasury: 350 },
          effect: {
            label: 'National Academy', days: 99999,
            mods: { 'research.mult': 1.20 },
          },
          log: 'Chartered and funded the National Academy.',
        },
        {
          id: 'charterOnly', label: 'Grant the charter, nothing else',
          blurb: 'Costs nothing, achieves a little, pleases the cities.',
          effects: { allRegions: { stability: 2 } },
          log: 'Granted the Academy its charter.',
        },
      ],
    },

    {
      id: 'harvestSurplus',
      title: 'An Exceptional Harvest',
      text: 'Three good seasons in a row. The granaries are full and the ' +
        'agrarian provinces are, for once, content.',
      weight: 11, minDay: 200, cooldownDays: 500,
      requires: { nationalStabilityAbove: 50 },
      choices: [
        {
          id: 'sellIt', label: 'Sell the surplus abroad',
          blurb: 'Straightforward money.',
          effects: { resources: { treasury: 420 } },
          log: 'Sold the harvest surplus abroad.',
        },
        {
          id: 'distributeIt', label: 'Distribute it at home',
          blurb: 'No money, and a country that remembers being fed.',
          effects: { allRegions: { stability: 6 } },
          log: 'Distributed the harvest surplus at home.',
        },
      ],
    },

    /* ===================================================================
     * THE MINISTRY — events that only exist because Phase 3 does. These are
     * what stop appointees and policies from being fire-and-forget.
     * =================================================================== */
    {
      id: 'scandal',
      title: 'Scandal in the Ministry',
      text: 'A newspaper has the documents. One of your appointees has been ' +
        'selling decisions, and the story runs on Thursday either way.',
      weight: 12, minDay: 350, cooldownDays: 600,
      requires: { hasAppointee: true },
      choices: [
        {
          id: 'sackThem', label: 'Sack them before the story runs',
          blurb: 'Your longest-serving appointee is dismissed today. It plays well.',
          effects: { dismissLongestServing: true, allRegions: { stability: 3 } },
          log: 'Dismissed an appointee ahead of the scandal.',
        },
        {
          id: 'standByThem', label: 'Stand by them',
          blurb: 'Loyalty is expensive and occasionally worth it.',
          mandateCost: 5,
          effect: {
            label: 'Standing by the minister', days: 400,
            mods: { 'salary.mult': 0.80 },
          },
          log: 'Stood by the minister through the scandal.',
        },
        {
          id: 'buryIt', label: 'Buy the story',
          blurb: 'Expensive, clean, and someone always knows.',
          cost: { treasury: 260, politicalCapital: 5 },
          log: 'Buried the ministry scandal.',
        },
      ],
    },

    {
      id: 'pressCampaign',
      title: 'The Press Turns',
      text: 'Every paper in the country is running the same line this week, and ' +
        'it is not a kind one.',
      weight: 10, minDay: 300, cooldownDays: 500,
      requires: { mandateBelow: 65 },
      choices: [
        {
          id: 'giveInterview', label: 'Give the interview',
          blurb: 'Face them directly. It costs standing to spend standing.',
          cost: { politicalCapital: 8 },
          effects: { allRegions: { stability: 5 } },
          log: 'Faced down the press campaign.',
        },
        {
          id: 'squeezeThem', label: 'Squeeze the printers',
          blurb: 'The story stops. So does a certain amount of goodwill.',
          mandateCost: 4,
          effect: {
            label: 'Muzzled press', days: 360,
            mods: { 'neighbourUnrest.mult': 0.70, 'pc.perDay.mult': 0.75 },
          },
          log: 'Leaned on the press.',
        },
        {
          id: 'sayNothing', label: 'Say nothing',
          blurb: 'It will pass. Most things do.',
          effects: { allRegions: { stability: -3 } },
          log: 'Let the press campaign run.',
        },
      ],
    },

    {
      id: 'defection',
      title: 'A Faction Walks Out',
      text: 'The bloc that has been voting with you since the beginning has ' +
        'announced it no longer does.',
      weight: 9, minDay: 600, cooldownDays: 800,
      requires: { politicalCapitalAtLeast: 15 },
      choices: [
        {
          id: 'buyThemBack', label: 'Buy them back',
          blurb: 'Posts, money and promises. It works for now.',
          cost: { politicalCapital: 18 },
          log: 'Bought back the defecting faction.',
        },
        {
          id: 'letThemGo', label: 'Let them go',
          blurb: 'Govern with a smaller coalition and a faster clock.',
          effect: {
            label: 'Lost the coalition', days: 720,
            mods: { 'mandateDecay.mult': 1.15 },
          },
          log: 'Let the faction walk out.',
        },
      ],
    },

    /* ===================================================================
     * MILITARY / FRONTIER — conditional on garrisons, so the standing army
     * has consequences beyond its bill.
     * =================================================================== */
    {
      id: 'borderIncident',
      title: 'Border Incident at {region}',
      text: 'Shots across the frontier. Nobody is claiming responsibility and ' +
        'both sides are counting.',
      weight: 10, minDay: 250, cooldownDays: 500,
      target: 'random',
      choices: [
        {
          id: 'reinforce', label: 'Reinforce the frontier',
          blurb: 'Troops and money to {region}. The message is received.',
          cost: { treasury: 140, manpower: 6 },
          effects: { target: { stability: 10 } },
          log: 'Reinforced the frontier at {region}.',
        },
        {
          id: 'protest', label: 'Protest through channels',
          blurb: 'Costs nothing. Achieves roughly that.',
          effects: { target: { stability: -5 } },
          log: 'Protested the {region} border incident.',
        },
        {
          id: 'escalate', label: 'Answer in kind',
          blurb: 'A show of force rallies the country and worries the provinces.',
          cost: { manpower: 10 }, mandateCost: 3,
          effects: { allRegions: { stability: 4 }, target: { stability: -6 } },
          log: 'Answered the border incident in kind.',
        },
      ],
    },

    {
      id: 'mutiny',
      title: 'Unrest in the Garrisons',
      text: 'The troops have not been paid on time twice running. Their ' +
        'officers are asking, politely, what the plan is.',
      weight: 11, minDay: 400, cooldownDays: 600,
      requires: { garrisonsAtLeast: 2 },
      choices: [
        {
          id: 'payThem', label: 'Pay the arrears',
          blurb: 'Immediately, in full, before anyone has to decide anything.',
          cost: { treasury: 300 },
          log: 'Paid the garrison arrears.',
        },
        {
          id: 'promiseThem', label: 'Promise them land',
          blurb: 'Nothing now. A permanently cheaper army, and a debt that outlives you.',
          mandateCost: 4,
          effect: {
            label: 'Land grants to the army', days: 99999,
            mods: { 'garrisonUpkeep.mult': 0.70, 'natural.base': -2 },
          },
          log: 'Promised the garrisons land instead of pay.',
        },
        {
          id: 'standThemDown', label: 'Stand them all down',
          blurb: 'Every garrison in the country is withdrawn. The bill stops today.',
          effects: { withdrawAllGarrisons: true, allRegions: { stability: -4 } },
          log: 'Stood down every garrison in the country.',
        },
      ],
    },

    /* ===================================================================
     * SLOW BURN — the quiet ones. A term made entirely of crises is as flat
     * as a term made of none; these are the days that just have weather.
     * =================================================================== */
    {
      id: 'epidemic',
      title: 'Fever in {region}',
      text: 'The provincial hospital has stopped admitting. It is contained ' +
        'for now, and "for now" is doing a great deal of work in that sentence.',
      weight: 10, minDay: 300, cooldownDays: 600,
      target: 'random',
      choices: [
        {
          id: 'quarantine', label: 'Quarantine the province',
          blurb: 'Seal {region}. It costs the province dearly and saves the rest.',
          cost: { treasury: 120 },
          effects: { target: { stability: -10 } },
          log: 'Quarantined {region} against the fever.',
        },
        {
          id: 'nationalResponse', label: 'Fund a national response',
          blurb: 'Expensive, slow, and it works everywhere.',
          cost: { treasury: 420 },
          effects: { allRegions: { stability: 3 } },
          log: 'Funded a national response to the fever.',
        },
        {
          id: 'letItRun', label: 'Let it run its course',
          blurb: 'It will burn out. The question is what it takes with it.',
          effects: { allRegions: { stability: -5 } },
          log: 'Let the fever run its course.',
        },
      ],
    },

    {
      id: 'floods',
      title: 'Floods Across the Lowlands',
      text: 'A week of rain has taken out roads, bridges and a season of work ' +
        'in {region} and everywhere downstream of it.',
      weight: 10, minDay: 250, cooldownDays: 550,
      target: 'richest',
      choices: [
        {
          id: 'rebuild', label: 'Rebuild immediately',
          blurb: 'Contractors on site within the week.',
          cost: { treasury: 320 },
          effects: { target: { stability: 8 } },
          log: 'Funded immediate flood reconstruction in {region}.',
        },
        {
          id: 'rebuildBetter', label: 'Rebuild it properly',
          blurb: 'Twice the money, and {region} comes back better than it was.',
          cost: { treasury: 620 },
          effects: { target: { stability: 8, development: 8 } },
          log: 'Rebuilt {region} better than it was.',
        },
        {
          id: 'deferIt', label: 'Defer the works',
          blurb: 'The damage stays on the books, and in the province.',
          effects: { target: { stability: -6, development: -5 } },
          log: 'Deferred the flood reconstruction.',
        },
      ],
    },

    {
      id: 'inheritance',
      title: 'The State Inherits an Estate',
      text: 'A childless industrialist has left everything to the nation, ' +
        'apparently out of spite toward his relatives.',
      weight: 7, minDay: 350, cooldownDays: 900,
      choices: [
        {
          id: 'sellIt', label: 'Liquidate it',
          blurb: 'Cash, immediately.',
          effects: { resources: { treasury: 500 } },
          log: 'Liquidated the inherited estate.',
        },
        {
          id: 'runIt', label: 'Run it as a state works',
          blurb: 'No windfall. The richest province gains real industry.',
          effects: { richestRegion: { development: 12 } },
          log: 'Turned the inherited estate into a state works.',
        },
      ],
    },

    {
      id: 'anniversary',
      title: 'The Anniversary of the Founding',
      text: 'The ministry wants to know what scale of celebration to plan, and ' +
        'needs an answer before the printers close.',
      weight: 9, minDay: 300, cooldownDays: 730,
      choices: [
        {
          id: 'grand', label: 'A national spectacle',
          blurb: 'Expensive, unifying, and over in a week.',
          cost: { treasury: 280 },
          effects: { allRegions: { stability: 7 } },
          log: 'Held a national spectacle for the anniversary.',
        },
        {
          id: 'modest', label: 'Something modest',
          blurb: 'A wreath, a speech, and the money kept.',
          effects: { allRegions: { stability: 1 } },
          log: 'Marked the anniversary modestly.',
        },
        {
          id: 'workingDay', label: 'Cancel it — make it a working day',
          blurb: 'Serious, unpopular, and the country notices the output.',
          mandateCost: 2,
          effect: {
            label: 'Anniversary cancelled', days: 365,
            mods: { 'output.mult': 1.06 },
          },
          log: 'Cancelled the anniversary celebrations.',
        },
      ],
    },
  ];

  Mandate.EVENTS.byId = function (id) {
    for (var i = 0; i < Mandate.EVENTS.length; i++) {
      if (Mandate.EVENTS[i].id === id) return Mandate.EVENTS[i];
    }
    return null;
  };
})(window.Mandate = window.Mandate || {});
