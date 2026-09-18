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
 *     node tools/harness.js --difficulty hard --term short
 *     node tools/harness.js --ladder           # every difficulty x term
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
  'data/setup.js',
  'data/map-geometry.js',
  'data/regions.js',
  'data/tech.js',
  'data/traits.js',
  'data/appointees.js',
  'data/policies.js',
  'data/projects.js',
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

/**
 * Start a national project when one is affordable, preferring an order.
 *
 * Phase 5 added these to answer the flat late game, and a strategy that never
 * starts one measures the game as it was rather than as it is. Deliberately
 * greedy and unclever, like every other decision in this file: take the first
 * thing on the preference list you can pay for today.
 */
function projectPlan(state, order) {
  if (state.projects.active) {
    /* Cut the losses. A project bills the Treasury every day whether or not
     * there is one, so carrying on through austerity means paying for a
     * monument with the provinces — and the harness will do exactly that
     * forever, because nothing in it ever changes its mind. A player would
     * stop. Nothing is refunded, which is the point of the decision. */
    if (state.derived.austerity) Sim.abandonProject(state);
    return null;
  }
  for (const id of order) {
    if (Sim.projectStatus(state, id) !== 'available') continue;
    if (Sim.startProject(state, id)) return { started: true };

    /* Eligible and unaffordable. Whether the strategy now SAVES for it — which
     * means holding Treasury back from Invest and not queueing research — is
     * the whole difficulty of measuring this system, and two wrong answers
     * were measured before this one:
     *
     *   spend everything, always   projects never start, and the harness
     *                              reports that they do nothing (proj 0.0)
     *   save from zero, always     the builder stops developing and stops
     *                              researching for a third of the term
     *                              (19 wins -> 2, tech 13 -> 6)
     *
     * Neither is a player. A player starts saving when the thing is nearly in
     * reach, so: only once HALF the Political Capital is already in hand. */
    const project = M.PROJECTS.byId(id);
    const pc = project.cost.politicalCapital || 0;
    if (state.resources.politicalCapital < pc * 0.5) return null;

    /* Two different reserves, and conflating them was the third wrong answer.
     * Holding Political Capital back from the tech tree costs research and
     * nothing else. Holding TREASURY back costs development — so it is only
     * held once the Political Capital is actually in hand and money is the
     * only thing still missing. Reserved from half-price onward instead, the
     * builder stopped developing for six hundred days waiting on a currency
     * it earns at a fifth of a point a day, and died in unrest at day 1,978
     * with the money still in the bank. */
    return {
      saving: true,
      treasury: state.resources.politicalCapital >= pc ? (project.cost.treasury || 0) : 0,
    };
  }
  return null;
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
      /* Projects BEFORE research, so Political Capital is reserved for the
        * big commitment rather than dribbled into the tree. That ordering is
        * itself the late-game decision the projects exist to create. */
      const plan = projectPlan(state, ['endowment', 'court', 'compact', 'academy']);
      if (plan && plan.started) return;
      if (!(plan && plan.saving)) {
        research(state, ['governance', 'economy', 'infrastructure', 'security']);
      }
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
      /* The project is decided BEFORE the day's Invest, because a project
       * that is being saved for holds Treasury back from it. A flat reserve
       * held all term is not the answer either — tried at 900, and a builder
       * that keeps a permanent war chest never develops the country and wins
       * 2 runs from 36. The reserve exists only while something is actually
       * being saved for. */
      const plan = projectPlan(state, ['reclamation', 'court', 'academy', 'endowment', 'compact']);
      if (plan && plan.started) return;
      const reserve = plan && plan.saving ? plan.treasury : 0;

      /* Then build, richest-first — development pays back fastest where
       * stability is already high. */
      if (state.resources.treasury > 400 + reserve) {
        const best = state.regions.slice().sort((a, b) => b.stability - a.stability);
        for (const region of best) {
          if (act(state, region, 'invest')) return;
        }
      }
      if (!(plan && plan.saving)) {
        research(state, ['economy', 'infrastructure', 'governance', 'security']);
      }
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
      const plan = projectPlan(state, ['reserve', 'court', 'reclamation', 'endowment']);
      if (plan && plan.started) return;
      const reserve = plan && plan.saving ? plan.treasury : 0;

      if (state.resources.treasury > 500 + reserve) {
        const best = state.regions.slice().sort((a, b) => b.stability - a.stability);
        for (const region of best) {
          if (act(state, region, 'invest')) return;
        }
      }
      if (!(plan && plan.saving)) {
        research(state, ['security', 'infrastructure', 'economy', 'governance']);
      }
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
function runOnce({ leaderId, strategy, seed, sampleEvery, setup }) {
  const state = State.createNewGame(leaderId, setup);
  state.rngSeed = seed >>> 0 || 1;
  Sim.refresh(state);

  const samples = [];
  const strat = STRATEGIES[strategy];
  const limit = Sim.termDays(state);

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
    /* The late-game evidence. `treasury` is the number that named the problem
     * in the first place — a won run used to end holding 20,000 with nothing
     * to spend it on — and `projects` is what it is being spent on now. */
    treasury: Math.round(state.resources.treasury),
    projects: state.stats.projectsCompleted || 0,
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
  { label: 'proj', right: true, get: (r) => r.projects.toFixed(1) },
  { label: 'end¤', right: true, get: (r) => Math.round(r.treasury) },
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
    treasury: mean(runs.map((r) => r.treasury)),
    projects: mean(runs.map((r) => r.projects)),
    mandateBy: meanMandateBy(runs),
  };
}

/* ---------------------------------------------------------------------------
 * CLI
 * ------------------------------------------------------------------------- */
function parseArgs(argv) {
  const args = {
    seeds: 6, strategy: null, leader: null, curve: false, compare: false,
    difficulty: null, term: null, ladder: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--curve') args.curve = true;
    else if (arg === '--compare') args.compare = true;
    else if (arg === '--seeds') args.seeds = parseInt(argv[++i], 10);
    else if (arg === '--strategy') args.strategy = argv[++i];
    else if (arg === '--leader') args.leader = argv[++i];
    else if (arg === '--difficulty') args.difficulty = argv[++i];
    else if (arg === '--term') args.term = argv[++i];
    else if (arg === '--ladder') args.ladder = true;
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

  /* The other audit that must run on every sweep: no difficulty x term pair
   * may be survivable by a player who does nothing. That invariant is the
   * whole win condition (DESIGN.md 2.8), and it is arithmetic, so it is
   * checked rather than remembered. */
  const waitable = M.SETUP.audit();
  if (waitable.length) {
    console.log('WARNING: these setups can be won by idling:');
    waitable.forEach((line) => console.log('  ' + line));
    console.log('');
  }
  if (args.audit) return;

  const leaders = args.leader ? [args.leader] : LEADERS.map((l) => l.id);
  const strategies = args.strategy ? [args.strategy] : Object.keys(STRATEGIES);
  const seeds = Array.from({ length: args.seeds }, (_, i) => 1000 + i * 7919);
  const setup = {
    difficultyId: args.difficulty || M.SETUP.DEFAULT.difficultyId,
    termId: args.term || M.SETUP.DEFAULT.termId,
  };

  /* --- the ladder: is a harder difficulty actually harder? ---------------
   * The one question a difficulty ladder has to answer, and the only way to
   * answer it is to play every rung. One strategy across every difficulty x
   * term pair, so the win rates are comparable down the column. */
  if (args.ladder) {
    const rungs = [];
    for (const difficulty of M.SETUP.DIFFICULTIES) {
      for (const term of M.SETUP.TERMS) {
        const runs = [];
        for (const leaderId of leaders) {
          for (const strategy of strategies) {
            for (const seed of seeds) {
              runs.push(runOnce({
                leaderId, strategy, seed,
                setup: { difficultyId: difficulty.id, termId: term.id },
              }));
            }
          }
        }
        const row = aggregate(runs);
        row.difficulty = difficulty.id;
        row.term = term.id;
        rungs.push(row);
      }
    }
    table(rungs, [
      { label: 'difficulty', get: (r) => r.difficulty },
      { label: 'term', get: (r) => r.term },
      { label: 'runs', right: true, get: (r) => r.runs },
      { label: 'won', right: true, get: (r) => r.won + '/' + r.runs },
      { label: 'days', right: true, get: (r) => Math.round(r.days) },
      { label: 'score', right: true, get: (r) => Math.round(r.score) },
      { label: 'stab', right: true, get: (r) => r.stability.toFixed(1) },
      { label: 'dev', right: true, get: (r) => Math.round(r.development) },
      { label: 'tech', right: true, get: (r) => r.tech.toFixed(1) },
    ]);
    return;
  }

  if (args.curve) {
    const run = runOnce({
      leaderId: leaders[0], strategy: strategies[0], seed: seeds[0],
      sampleEvery: 180, setup,
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
      const runs = seeds.map((seed) => runOnce({ leaderId, strategy, seed, setup }));
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
