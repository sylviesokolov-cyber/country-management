#!/usr/bin/env node
/* ============================================================================
 * tools/harness.js — the headless balance harness.
 * ----------------------------------------------------------------------------
 * Runs the real simulation, with no browser, at a few thousand days a second.
 *
 *     node tools/harness.js                    # every leader, every strategy
 *     node tools/harness.js --leader reformer  # one leader
 *     node tools/harness.js --strategy builder --seeds 8 --curve
 *     node tools/harness.js --compare          # strategy x leader win table
 *
 * WHY THIS FILE EXISTS, AND WHY IT KEPT NOT EXISTING
 * -------------------------------------------------
 * It has now been written from scratch in three separate phases and thrown
 * away twice, because it lived in a scratch directory each time. It is in the
 * repo now. Every balance claim in BALANCE.md should be reproducible by a
 * command in this header.
 *
 * It works at all only because of one architectural rule: `src/sim.js` has no
 * DOM dependencies. The files below are loaded in the same order index.html
 * loads them, into a fake `window`, and then the sim is driven directly.
 * If this file ever stops working, the most likely cause is that something
 * in the simulation started touching the document — which is itself the bug.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------------------------------------------------------------------------
 * LOADING THE GAME
 * The game attaches itself to one global `window.Mandate`. Node has no
 * `window`, so we make one — and deliberately NOT a `document`, so that a
 * stray DOM call in the simulation fails loudly here rather than silently
 * working in the browser and quietly breaking every balance number.
 * ------------------------------------------------------------------------- */
const ROOT = path.join(__dirname, '..');

const FILES = [
  'data/balance.js',
  'data/map-geometry.js',
  'data/regions.js',
  'data/tech.js',
  'data/traits.js',
  'data/appointees.js',
  'data/policies.js',
  'data/leaders.js',
  'data/events.js',
  'src/util.js',
  'src/state.js',
  'src/modifiers.js',
  'src/sim.js',
];

function loadGame() {
  const sandbox = { console, Math, Date, JSON, Object, Array, String, Number };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const file of FILES) {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }
  return sandbox.window.Mandate;
}

const M = loadGame();
const { Sim, State, BALANCE, LEADERS } = M;

/* ---------------------------------------------------------------------------
 * STRATEGIES
 * A strategy is a function called once per in-game day with the live state.
 * It may call Sim.applyAction / Sim.queueTech / Sim.hire / Sim.assign freely —
 * exactly the surface a player has, and nothing else. A strategy that reaches
 * into `state` directly is cheating and its numbers are worthless.
 *
 * They are deliberately CRUDE. The point is not to play well, it is to play
 * CONSISTENTLY, so that a balance change shows up as a difference rather than
 * as noise.
 * ------------------------------------------------------------------------- */

/** Regions sorted worst-stability first. */
function worstFirst(state) {
  return state.regions.slice().sort((a, b) => a.stability - b.stability);
}

/** Try an action on a region; returns whether it happened. */
function act(state, region, actionId) {
  return Sim.applyAction(state, region.id, actionId);
}

/** Keep a research queue topped up along one branch preference. */
function research(state, branchOrder) {
  if (state.tech.queue.length >= BALANCE.research.queueMax) return;
  const candidates = M.TECH.nodes
    .filter((n) => Sim.techStatus(state, n.id) === 'available')
    .sort((a, b) => branchOrder.indexOf(a.branch) - branchOrder.indexOf(b.branch));
  for (const node of candidates) {
    if (Sim.queueTech(state, node.id)) return;
  }
}

/**
 * Hire only when the payroll is genuinely affordable.
 *
 * Phase 4 lost two days to a harness that hired everyone it could see. That
 * bankrupts a government in three years — exactly as Phase 3 designed — and it
 * looked like an event-scheduler balance bug for most of a session. A strategy
 * that ignores its own budget is not measuring the game, it is measuring
 * itself.
 */
function staff(state, salaryBudgetShare) {
  const headroom = state.derived.treasuryPerDay;
  if (headroom < 2) return;
  const budget = Math.max(0, state.derived.treasuryGrossPerDay * salaryBudgetShare -
    state.derived.salaryPerDay);
  for (const candidate of state.appointees.pool.slice()) {
    if (candidate.salary > budget) continue;
    if (!Sim.canHire(state, candidate.id).ok) continue;
    if (Sim.hire(state, candidate.id)) {
      /* A governor with nowhere to stand is a salary and nothing else. */
      if (candidate.role === 'governor') {
        const target = worstFirst(state)[0];
        Sim.assign(state, candidate.id, target.id);
      }
      return;
    }
  }
}

const STRATEGIES = {
  /* Does nothing at all. The control: whatever this scores is the floor, and
   * any strategy that cannot beat it describes a system that does not pay. */
  idle: {
    label: 'idle',
    play() {},
  },

  /* Patch stability, never build. Phase 2 found this was the winning strategy
   * before natural stability existed; it should now lose. */
  patcher: {
    label: 'patcher',
    play(state) {
      const worst = worstFirst(state);
      for (const region of worst) {
        if (region.stability > 55) break;
        if (act(state, region, 'relief')) return;
        if (act(state, region, 'publicWorks')) return;
      }
      research(state, ['governance', 'economy', 'infrastructure', 'security']);
      staff(state, 0.15);
    },
  },

  /* Stabilise what is falling over, then put everything else into
   * development. This is the intended shape of a good run. */
  builder: {
    label: 'builder',
    play(state) {
      const worst = worstFirst(state);
      /* Triage first: anything under the unrest line is costing Mandate now. */
      for (const region of worst) {
        if (!Sim.isUnstable(region)) break;
        if (act(state, region, 'relief')) return;
        if (act(state, region, 'publicWorks')) return;
      }
      /* Then build, richest-first — development pays back fastest where
       * stability is already high. */
      if (state.resources.treasury > 400) {
        const best = state.regions.slice().sort((a, b) => b.stability - a.stability);
        for (const region of best) {
          if (act(state, region, 'invest')) return;
        }
      }
      research(state, ['economy', 'infrastructure', 'governance', 'security']);
      staff(state, 0.2);
    },
  },

  /* Answer every crisis with troops. The strategy the Marshal exists for, and
   * the one Phases 3 and 4 both logged as still losing to `builder`. */
  garrisoner: {
    label: 'garrisoner',
    play(state) {
      const worst = worstFirst(state);
      for (const region of worst) {
        if (!Sim.isUnstable(region)) break;
        if (act(state, region, 'garrison')) return;
        if (act(state, region, 'relief')) return;
        if (act(state, region, 'publicWorks')) return;
      }
      if (state.resources.treasury > 500) {
        const best = state.regions.slice().sort((a, b) => b.stability - a.stability);
        for (const region of best) {
          if (act(state, region, 'invest')) return;
        }
      }
      research(state, ['security', 'infrastructure', 'economy', 'governance']);
      staff(state, 0.2);
    },
  },
};

/* ---------------------------------------------------------------------------
 * ANSWERING EVENTS
 * An unanswered event blocks nothing in the sim — the clock keeps running —
 * but leaving it pending would mean measuring a game with its events switched
 * off. The harness answers on the first tick it sees one, picking the first
 * legal choice that it can pay for, and falling back to the last choice
 * (which is conventionally the "do nothing / let it happen" option).
 * ------------------------------------------------------------------------- */
function answerEvent(state) {
  const pending = state.events.pending;
  if (!pending) return;
  const event = M.EVENTS.byId(pending.eventId);
  if (!event) { state.events.pending = null; return; }
  for (const choice of event.choices) {
    if (Sim.canChooseEvent(state, choice.id).ok && Sim.resolveEvent(state, choice.id)) return;
  }
  Sim.resolveEvent(state, event.choices[event.choices.length - 1].id);
}

/* ---------------------------------------------------------------------------
 * ONE RUN
 * ------------------------------------------------------------------------- */
function runOnce({ leaderId, strategy, seed, sampleEvery }) {
  const state = State.createNewGame(leaderId);
  state.rngSeed = seed >>> 0 || 1;
  Sim.refresh(state);

  const samples = [];
  const strat = STRATEGIES[strategy];
  const limit = BALANCE.mandate.termDays;

  while (!state.gameOver && state.day < limit) {
    Sim.tick(state);
    answerEvent(state);
    strat.play(state);
    if (sampleEvery && state.day % sampleEvery === 0) {
      samples.push({
        day: state.day,
        mandate: +state.mandate.toFixed(1),
        treasury: Math.round(state.resources.treasury),
        pc: Math.round(state.resources.politicalCapital),
        stability: +state.derived.nationalStability.toFixed(1),
        development: Math.round(state.derived.nationalDevelopment),
        unstable: state.derived.unstableRegions,
        revolts: state.derived.regionsInRevolt || 0,
      });
    }
  }

  return {
    leaderId,
    strategy,
    seed,
    mandateBy: state.stats.mandateBy || {},
    days: state.day,
    won: !!state.won,
    score: state.score || Sim.score(state),
    mandate: +state.mandate.toFixed(1),
    stability: +state.derived.nationalStability.toFixed(1),
    development: Math.round(state.derived.nationalDevelopment),
    calm: +(Sim.calmShare(state) * 100).toFixed(1),
    tech: state.stats.techCompleted,
    events: state.stats.eventsResolved,
    revoltDays: state.stats.daysInRevolt || 0,
    samples,
  };
}

/* ---------------------------------------------------------------------------
 * REPORTING
 * ------------------------------------------------------------------------- */
function mean(values) {
  return values.reduce((a, b) => a + b, 0) / (values.length || 1);
}

function table(rows, columns) {
  const widths = columns.map((col) =>
    Math.max(col.label.length, ...rows.map((row) => String(col.get(row)).length)));
  const line = (cells) => cells.map((cell, i) =>
    (columns[i].right ? String(cell).padStart(widths[i]) : String(cell).padEnd(widths[i]))
  ).join('  ');
  console.log(line(columns.map((c) => c.label)));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((row) => console.log(line(columns.map((c) => c.get(row)))));
}

const SUMMARY_COLUMNS = [
  { label: 'leader', get: (r) => r.leaderId },
  { label: 'strategy', get: (r) => r.strategy },
  { label: 'runs', right: true, get: (r) => r.runs },
  { label: 'won', right: true, get: (r) => r.won + '/' + r.runs },
  { label: 'days', right: true, get: (r) => Math.round(r.days) },
  { label: 'score', right: true, get: (r) => Math.round(r.score) },
  { label: 'stab', right: true, get: (r) => r.stability.toFixed(1) },
  { label: 'dev', right: true, get: (r) => Math.round(r.development) },
  { label: 'calm%', right: true, get: (r) => r.calm.toFixed(0) },
  { label: 'tech', right: true, get: (r) => r.tech.toFixed(1) },
  /* The itemised clock. This is the column set that actually explains a
   * balance result: "builder scores highest and never wins" is a mystery
   * until you can see that it spends a third of its term on Invest. */
  { label: 'm:base', right: true, get: (r) => r.mandateBy.baseline.toFixed(0) },
  { label: 'm:unrest', right: true, get: (r) => r.mandateBy.unrest.toFixed(0) },
  { label: 'm:revolt', right: true, get: (r) => r.mandateBy.revolt.toFixed(0) },
  { label: 'm:act', right: true, get: (r) => r.mandateBy.actions.toFixed(0) },
  { label: 'm:evt', right: true, get: (r) => r.mandateBy.events.toFixed(0) },
];

/* Mean Mandate spent per cause across a set of runs. Keys missing from a run
 * are zero, not absent, so the table never has a hole in it. */
const MANDATE_KEYS = ['baseline', 'unrest', 'revolt', 'garrison', 'policy',
  'austerity', 'actions', 'events'];

function meanMandateBy(runs) {
  const out = {};
  MANDATE_KEYS.forEach((key) => {
    out[key] = mean(runs.map((r) => r.mandateBy[key] || 0));
  });
  return out;
}

function aggregate(runs) {
  return {
    leaderId: runs[0].leaderId,
    strategy: runs[0].strategy,
    runs: runs.length,
    won: runs.filter((r) => r.won).length,
    days: mean(runs.map((r) => r.days)),
    score: mean(runs.map((r) => r.score)),
    stability: mean(runs.map((r) => r.stability)),
    development: mean(runs.map((r) => r.development)),
    calm: mean(runs.map((r) => r.calm)),
    tech: mean(runs.map((r) => r.tech)),
    mandateBy: meanMandateBy(runs),
  };
}

/* ---------------------------------------------------------------------------
 * CLI
 * ------------------------------------------------------------------------- */
function parseArgs(argv) {
  const args = { seeds: 6, strategy: null, leader: null, curve: false, compare: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--curve') args.curve = true;
    else if (arg === '--compare') args.compare = true;
    else if (arg === '--seeds') args.seeds = parseInt(argv[++i], 10);
    else if (arg === '--strategy') args.strategy = argv[++i];
    else if (arg === '--leader') args.leader = argv[++i];
    else if (arg === '--audit') args.audit = true;
    else { console.error('unknown argument: ' + arg); process.exit(1); }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  /* The modifier audit names any key a data file declares and the sim never
   * reads — a typo in a tech node's `mods` is otherwise completely invisible.
   * Running it here means it is checked on every balance sweep. */
  const unread = M.Mods.audit();
  if (unread.length) {
    console.log('WARNING: modifier keys declared but never read by the sim:');
    unread.forEach((key) => console.log('  ' + key));
    console.log('');
  }
  if (args.audit) return;

  const leaders = args.leader ? [args.leader] : LEADERS.map((l) => l.id);
  const strategies = args.strategy ? [args.strategy] : Object.keys(STRATEGIES);
  const seeds = Array.from({ length: args.seeds }, (_, i) => 1000 + i * 7919);

  if (args.curve) {
    const run = runOnce({
      leaderId: leaders[0], strategy: strategies[0], seed: seeds[0], sampleEvery: 180,
    });
    console.log('curve: ' + run.leaderId + ' / ' + run.strategy + ' / seed ' + run.seed);
    table(run.samples, [
      { label: 'day', right: true, get: (s) => s.day },
      { label: 'mandate', right: true, get: (s) => s.mandate.toFixed(1) },
      { label: 'treasury', right: true, get: (s) => s.treasury },
      { label: 'pc', right: true, get: (s) => s.pc },
      { label: 'stab', right: true, get: (s) => s.stability.toFixed(1) },
      { label: 'dev', right: true, get: (s) => s.development },
      { label: 'unrest', right: true, get: (s) => s.unstable },
      { label: 'revolt', right: true, get: (s) => s.revolts },
    ]);
    console.log('\nended day ' + run.days + (run.won ? ' — TERM SERVED' : ' — mandate exhausted') +
      ', score ' + run.score);
    console.log('\nwhere the term went (Mandate spent, of 100):');
    Object.entries(run.mandateBy)
      .sort((a, b) => b[1] - a[1])
      .forEach(([key, value]) =>
        console.log('  ' + key.padEnd(12) + value.toFixed(1).padStart(6)));
    return;
  }

  const rows = [];
  for (const leaderId of leaders) {
    for (const strategy of strategies) {
      const runs = seeds.map((seed) => runOnce({ leaderId, strategy, seed }));
      rows.push(aggregate(runs));
    }
  }
  table(rows, SUMMARY_COLUMNS);

  if (args.compare) {
    console.log('\nwins by strategy (all leaders, ' + seeds.length + ' seeds each):');
    Object.keys(STRATEGIES).forEach((strategy) => {
      const mine = rows.filter((r) => r.strategy === strategy);
      const won = mine.reduce((a, r) => a + r.won, 0);
      const total = mine.reduce((a, r) => a + r.runs, 0);
      console.log('  ' + strategy.padEnd(12) + won + '/' + total +
        '   mean score ' + Math.round(mean(mine.map((r) => r.score))));
    });
  }
}

main();
