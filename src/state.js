/* ============================================================================
 * src/state.js — THE GAME STATE, and saving/loading it.
 * ----------------------------------------------------------------------------
 * ARCHITECTURE NOTE (the most important one in the project):
 *
 *   The entire game is a plain JavaScript object.
 *   src/sim.js advances that object one tick at a time.
 *   src/ui/* reads that object and draws it.
 *   The UI never changes state directly — it calls into the sim.
 *
 * Nothing in here touches the DOM, and nothing here knows the game is even
 * being displayed. That is what makes the game tunable, testable and
 * save-able: the whole world is one serialisable object.
 *
 * NOTE: view-only concerns (which region is tapped open, which bottom tab is
 * showing) deliberately do NOT live in this object — see src/ui/view.js.
 * Saves should only contain the world, not the camera.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var State = {};

  /* Bump this whenever the SHAPE of the state object changes (fields added,
   * renamed, removed). `migrate()` below then decides what to do with older
   * saves. Getting this in from day one is much cheaper than retrofitting it
   * after players have saves worth keeping. */
  State.SCHEMA_VERSION = 7;
  State.SAVE_KEY = 'mandate:save';

  /**
   * Build a fresh game world from the data files.
   * Note how everything numeric comes from BALANCE or the region data — there
   * are no magic numbers in this function.
   */
  State.createNewGame = function (leaderId, setup) {
    var B = Mandate.BALANCE;

    var regions = Mandate.REGIONS.map(function (def) {
      return {
        id: def.id,
        /* Live, changing values. The static facts (name, terrain) stay in the
         * data file and are looked up by id — no need to copy them into the
         * save, and they can be re-balanced without invalidating saves. */
        stability: def.stability,
        development: def.development,
        garrisoned: false,  /* a standing commitment, not a one-off action */

        /* --- PHASE 5: the unrest clock ---------------------------------
         * `unrestDays` counts consecutive-ish days below the unrest line
         * (it bleeds off rather than resetting, so repeated brushes with
         * unrest accumulate); past BALANCE.region.revolt.afterDays the
         * province rises and `inRevolt` latches on until it is pulled back
         * well above the line. See src/sim.js updateRevolts(). */
        unrestDays: 0,
        inRevolt: false,
        /* actionId -> how much more that action costs HERE than it did the
         * first time, as a fraction. Bumped on use, bled off daily. Only the
         * patch actions have one; Invest never gets more expensive. */
        fatigue: {},

        /* Derived every tick and stored only so the UI can read them without
         * recomputing. Nothing in the sim reads them back. */
        output: 0,
        upkeep: 0,             /* Treasury this region costs per day */
        naturalStability: 0,   /* the level it settles at if left alone */
        stabilityTrend: 0,     /* stability change per day, before any action */

        actionsTaken: 0,
      };
    });

    return {
      schemaVersion: State.SCHEMA_VERSION,
      balanceVersion: B.balanceVersion,
      startedAt: new Date().toISOString(),

      /* WHO YOU ARE. Chosen on the leader screen before the run starts; their
       * buff, handicap and mechanic are merged into the modifier table and
       * never referenced by id anywhere in src/. Defaults to the first leader
       * so that a headless balance run needs no ceremony. */
      leaderId: leaderId || Mandate.LEADERS[0].id,

      /* HOW HARD, AND FOR HOW LONG. Chosen on the leader screen alongside the
       * leader, and fixed for the run — both are merged into the modifier
       * table by src/modifiers.js and neither is read by id anywhere in the
       * simulation. Stored rather than assumed because a save that does not
       * say which difficulty it was played at is a save whose score means
       * nothing. */
      setup: {
        difficultyId: (setup && setup.difficultyId) || Mandate.SETUP.DEFAULT.difficultyId,
        termId: (setup && setup.termId) || Mandate.SETUP.DEFAULT.termId,
      },

      /* A run has not STARTED until a leader has actually been chosen.
       *
       * main.js builds a provisional world at boot so the map and HUD have
       * something to draw behind the leader screen, and that world must never
       * be persisted: the phone lifecycle hooks save on `pagehide` and on
       * `visibilitychange`, so without this flag, opening the game and
       * reloading before choosing anybody would save the placeholder, find it
       * on the next boot, skip the leader screen entirely, and drop the player
       * into a run under a leader they never picked. State.save() refuses an
       * unstarted world outright — one guard, in the one place that writes. */
      started: !!leaderId,

      day: 0,               /* ticks elapsed; the date is derived from this */
      speed: 1,             /* 0 = paused, 1 = 1x, 2 = 2x */
      gameOver: false,
      gameOverReason: null,
      /* Phase 4: a run now ends in one of TWO ways. `won` is true when the
       * full term was served, false when the Mandate ran out. The end-of-term
       * screen reads very differently for each, and so does the score. */
      won: false,
      score: 0,

      resources: {
        treasury: B.resources.treasury.start,
        politicalCapital: B.resources.politicalCapital.start,
        manpower: B.resources.manpower.start,
      },
      mandate: B.mandate.start,

      regions: regions,

      /* --- PHASE 3 --------------------------------------------------------
       * Three systems, three small blocks. Note that none of them stores any
       * EFFECT: what a completed node or a hired minister actually does is
       * looked up from the data files through src/modifiers.js. The save
       * holds decisions, never consequences, so the whole game can be
       * re-balanced without invalidating a single save. */

      /* Completed node ids, the research queue (ids, in order) and how many
       * research points the node at the head of the queue has accumulated. */
      tech: {
        completed: [],
        queue: [],
        progress: 0,
      },

      /* --- PHASE 5: NATIONAL PROJECTS -----------------------------------
       * One under way at a time, and what has been finished. Like `tech`
       * above it stores decisions rather than consequences: what a completed
       * project DOES is looked up from data/projects.js through
       * src/modifiers.js. */
      projects: {
        active: null,       /* { id, progress } — progress is in days built */
        completed: [],
      },

      /* `pool` is who is available to hire right now; `hired` is who works
       * for you. A governor also carries `regionId` (null = unassigned and
       * still drawing a salary, which is deliberately allowed — an idle
       * appointee should feel like waste, not be impossible). */
      appointees: {
        pool: [],
        hired: [],
        nextId: 1,
        lastRefreshDay: 0,
        /* The opening pool is drawn by the sim (it owns the RNG), not here.
         * This flag is what stops it being re-drawn every time the game is
         * loaded — or, worse, refilled the moment a player hires everyone. */
        seeded: false,
      },

      /* One option per category, always. `changedOn` is the day each category
       * was last switched, for the cooldown. */
      policies: {
        active: Mandate.POLICIES.defaults(),
        changedOn: {},
      },

      /* --- PHASE 4 --------------------------------------------------------
       * Temporary modifiers left behind by event choices. Each is an ordinary
       * modifier payload plus an expiry: { id, label, untilDay, mods, flags }.
       * The sim drops them when their day comes, so nothing here needs to be
       * cleaned up on load. */
      effects: [],

      /* The run log, which the Events tab renders. Newest last; capped by
       * BALANCE.log.maxEntries so a full term doesn't bloat every save. */
      log: [],

      /* Event scheduling bookkeeping. `pending` is the event awaiting an
       * answer — it holds the resolved region so the wording and the effects
       * can never disagree about which province this is happening in. */
      events: {
        lastFiredDay: -99999,
        firedCounts: {},    /* eventId -> times fired, for `once` */
        lastFiredOn: {},    /* eventId -> day, for per-event cooldowns */
        pending: null,
        seen: 0,
      },

      /* Seeded RNG state. Every random draw in the game (the candidate pool
       * and the event scheduler) steps this, so a save reloads into the same
       * future rather than a different one — and a balance run is
       * reproducible. */
      rngSeed: (Date.now() >>> 0) || 1,

      /* Bumped by the sim whenever tech, appointees or policies change.
       * src/modifiers.js caches its table against this rather than rebuilding
       * it for every region on every tick. */
      modVersion: 1,

      /* Per-tick derived totals, recomputed by the sim. Cached here so the UI
       * can just read them instead of recalculating during render. */
      derived: {
        nationalOutput: 0,
        upkeepPerDay: 0,        /* what the country costs to keep standing */
        treasuryPerDay: 0,      /* NET of upkeep — what the HUD chip shows */
        treasuryGrossPerDay: 0, /* before upkeep, for the region panel */
        politicalCapitalPerDay: 0,
        manpowerPerDay: 0,
        manpowerCap: 0,
        mandatePerDay: 0,
        nationalStability: 0,
        nationalDevelopment: 0,
        unstableRegions: 0,
        regionsInRevolt: 0,
        /* The itemised Mandate bill — see Sim.mandateBreakdown. Cached here
         * so the gauge's number and the "why" behind it are the same numbers,
         * computed once a tick. */
        mandateBreakdown: { total: 0, lines: [] },
        /* Phase 3. Salaries are billed WITH the upkeep bill, so an
         * over-staffed government goes bankrupt exactly like an over-built
         * one; `upkeepPerDay` above includes this figure, and the Ministry
         * screen shows it broken out. */
        salaryPerDay: 0,
        researchPerDay: 0,
        ministerSlots: 0,
        governorSlots: 0,
        /* True on any day the bill went unpaid. The UI turns the Treasury
         * chip red on it, because austerity is the one state the player must
         * never discover late. */
        austerity: false,
      },

      /* Running totals — cheap now, and Phase 4's run summary will want them. */
      stats: {
        treasuryEarned: 0,
        actionsTaken: 0,
        /* Days on which at least one region sat below the unrest line. The
         * run summary reads this as "how much of your term was a crisis". */
        daysInUnrest: 0,
        /* Phase 5. Kept apart from daysInUnrest on purpose: a term with one
         * bad province is a different term from one with a province lost. */
        daysInRevolt: 0,
        revoltsStarted: 0,
        /* Where the term went, by cause: every key Sim.mandateBreakdown can
         * emit, plus 'actions' and 'events'. Summed by Sim.chargeMandate,
         * which is the ONLY thing in the game that moves the meter. */
        mandateBy: {},
        techCompleted: 0,
        projectsCompleted: 0,
        appointeesHired: 0,
        eventsResolved: 0,
      },
    };
  };

  /** Fast id -> region lookup. Rebuilt on load rather than saved. */
  State.regionById = function (state, id) {
    for (var i = 0; i < state.regions.length; i++) {
      if (state.regions[i].id === id) return state.regions[i];
    }
    return null;
  };

  /** Static definition (name, terrain) for a region id, from the data file. */
  State.regionDef = function (id) {
    for (var i = 0; i < Mandate.REGIONS.length; i++) {
      if (Mandate.REGIONS[i].id === id) return Mandate.REGIONS[i];
    }
    return null;
  };

  /* ------------------------------------------------------------------------
   * SAVE / LOAD
   * ---------------------------------------------------------------------- */

  State.save = function (state) {
    /* See `started` in createNewGame: a world nobody has chosen a leader for
     * is scenery, not a run, and must never reach localStorage. */
    if (!state || !state.started) return false;
    try {
      window.localStorage.setItem(State.SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      /* localStorage can be full or blocked (private mode on iOS). A failed
       * save must never break the running game. */
      console.warn('[Mandate] save failed:', err);
      return false;
    }
  };

  State.load = function () {
    var raw;
    try {
      raw = window.localStorage.getItem(State.SAVE_KEY);
    } catch (err) {
      console.warn('[Mandate] load failed:', err);
      return null;
    }
    if (!raw) return null;

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn('[Mandate] save file is corrupt, ignoring it.');
      State.clearSave();
      return null;
    }

    var migrated;
    try {
      migrated = State.migrate(parsed);
    } catch (err) {
      /* A migration step that throws is a bug in THIS file, and the player
       * should not meet it as a white screen. */
      console.warn('[Mandate] could not migrate the save:', err);
      State.clearSave();
      return null;
    }

    if (migrated && !State.isUsable(migrated)) {
      console.warn('[Mandate] save is structurally invalid, starting fresh.');
      State.clearSave();
      return null;
    }
    /* A save that could not be loaded is cleared rather than left in place:
     * otherwise every subsequent boot re-reads the same broken blob, logs the
     * same warning and throws away the same run, and the player has no way to
     * escape it short of clearing site data. */
    if (!migrated) State.clearSave();
    return migrated;
  };

  /**
   * Is this object actually a game world, rather than merely valid JSON?
   *
   * `migrate()` answers "is this the right SHAPE of save"; this answers "is
   * there a country in it". They are different questions, and only the second
   * one catches a save truncated by a browser that ran out of quota
   * mid-write — which produces a parseable object with the right
   * schemaVersion and half a world underneath it.
   *
   * Deliberately shallow. This is a guard against a broken file, not a
   * schema validator: anything it does not check, the sim recomputes on
   * Sim.refresh() anyway.
   */
  State.isUsable = function (save) {
    if (!save || typeof save !== 'object') return false;
    if (typeof save.day !== 'number' || !isFinite(save.day)) return false;
    if (typeof save.mandate !== 'number' || !isFinite(save.mandate)) return false;
    if (!save.resources || typeof save.resources.treasury !== 'number') return false;
    /* The region count has to match the data file. A save written against a
     * different map is not a save of this game, and loading it would leave
     * regions that exist in the geometry with no state behind them. */
    if (!Array.isArray(save.regions) ||
        save.regions.length !== Mandate.REGIONS.length) return false;
    for (var i = 0; i < save.regions.length; i++) {
      var region = save.regions[i];
      if (!region || !State.regionDef(region.id)) return false;
      if (typeof region.stability !== 'number' || !isFinite(region.stability)) return false;
      if (typeof region.development !== 'number' || !isFinite(region.development)) return false;
    }
    /* These are containers the sim writes into without ever checking; a save
     * missing one crashes on the first tick rather than at load. */
    return !!(save.tech && save.appointees && save.policies && save.stats &&
      save.derived && save.events && save.projects);
  };

  State.clearSave = function () {
    try {
      window.localStorage.removeItem(State.SAVE_KEY);
    } catch (err) {
      console.warn('[Mandate] could not clear save:', err);
    }
  };

  /**
   * Bring an old save up to the current schema.
   *
   * A chain of small one-step upgrades, each turning version N into N+1, and
   * anything the chain cannot reach is refused rather than half-loaded:
   *
   *   if (save.schemaVersion === 1) { ...add the fields v2 expects...
   *                                   save.schemaVersion = 2; }
   *   if (save.schemaVersion === 2) { ... }
   *
   * Never one big branching function. Returning null means "start a new game
   * instead" — always better than loading a half-broken world.
   */
  State.migrate = function (save) {
    if (!save || typeof save !== 'object') return null;

    /* v1 -> v2 (Phase 2): regions gained a garrison flag and two display-only
     * derived fields; the national derived block and stats gained entries.
     * All of them are recomputed by Sim.refresh() on load, so the migration
     * only has to make sure the fields EXIST — it never has to get them
     * right. The garrison flag is the one real world fact here, and a v1 save
     * predates garrisons entirely, so false is the truthful value. */
    if (save.schemaVersion === 1) {
      if (!Array.isArray(save.regions)) return null;
      save.regions.forEach(function (region) {
        region.garrisoned = false;
        region.upkeep = 0;
        region.naturalStability = 0;
        region.stabilityTrend = 0;
      });
      save.stats = save.stats || {};
      if (typeof save.stats.daysInUnrest !== 'number') save.stats.daysInUnrest = 0;
      save.schemaVersion = 2;
    }

    /* v2 -> v3 (Phase 3): tech, appointees and policies arrive. A v2 save is a
     * government that has researched nothing, hired nobody and is running the
     * default policy in every category — which is exactly what a fresh block
     * describes, so there is nothing to translate, only to add. The RNG seed
     * has to be invented; any value is as truthful as any other. */
    if (save.schemaVersion === 2) {
      save.tech = { completed: [], queue: [], progress: 0 };
      save.appointees = {
        pool: [], hired: [], nextId: 1,
        lastRefreshDay: save.day || 0, seeded: false,
      };
      save.policies = { active: Mandate.POLICIES.defaults(), changedOn: {} };
      save.rngSeed = (Date.now() >>> 0) || 1;
      save.modVersion = 1;
      save.stats = save.stats || {};
      save.stats.techCompleted = 0;
      save.stats.appointeesHired = 0;
      save.schemaVersion = 3;
    }

    /* v3 -> v4 (Phase 4): leaders, events and a win condition. A v3 save was
     * played without a leader at all, and there is no honest way to invent one
     * retroactively — a leader changes the modifier table, so picking one now
     * would silently re-balance a run in progress. The first leader is the
     * least-wrong answer and the reason is recorded in the run log, where the
     * player will see it. */
    if (save.schemaVersion === 3) {
      save.leaderId = Mandate.LEADERS[0].id;
      save.won = false;
      save.score = 0;
      save.effects = [];
      save.log = [{
        day: save.day || 0,
        kind: 'system',
        text: 'This term began before leaders existed; it continues under ' +
          Mandate.LEADERS[0].title + '.',
      }];
      save.events = {
        lastFiredDay: -99999, firedCounts: {}, lastFiredOn: {},
        pending: null, seen: 0,
      };
      save.stats = save.stats || {};
      save.stats.eventsResolved = 0;
      /* A v3 save is by definition a run somebody was playing. */
      save.started = true;
      save.schemaVersion = 4;
    }

    /* v4 -> v5 (Phase 5): the unrest clock, open revolt and patch fatigue. A
     * v4 save is a country where neglect had no clock on it, and there is no
     * honest way to reconstruct how long each province has been in trouble —
     * the save never recorded it. Everyone therefore starts the new clock at
     * zero, which is the generous reading and the only defensible one: it
     * cannot retroactively lose a player a province they were never warned
     * about. Fatigue starts clear for the same reason. */
    if (save.schemaVersion === 4) {
      if (!Array.isArray(save.regions)) return null;
      save.regions.forEach(function (region) {
        region.unrestDays = 0;
        region.inRevolt = false;
        region.fatigue = {};
      });
      save.stats = save.stats || {};
      save.stats.daysInRevolt = 0;
      save.stats.revoltsStarted = 0;
      save.stats.mandateBy = {};
      save.derived = save.derived || {};
      save.derived.regionsInRevolt = 0;
      save.derived.mandateBreakdown = { total: 0, lines: [] };
      save.log = save.log || [];
      save.log.push({
        day: save.day || 0,
        kind: 'system',
        text: 'Reports now reach the capital: provinces left in unrest will ' +
          'rise in open revolt.',
      });
      save.schemaVersion = 5;
    }

    /* --- v5 -> v6: national projects ------------------------------------
     * Phase 5's answer to the flat late game. A v5 save has no `projects`
     * block at all, and the sim writes into it on the first tick without
     * checking — so the container has to exist before the save is handed
     * back, not the first time something looks for it. */
    if (save.schemaVersion === 5) {
      save.projects = { active: null, completed: [] };
      save.stats = save.stats || {};
      save.stats.projectsCompleted = 0;
      save.log = save.log || [];
      save.log.push({
        day: save.day || 0,
        kind: 'system',
        text: 'The ministry will now hear proposals for national projects.',
      });
      save.schemaVersion = 6;
    }

    /* v6 -> v7: difficulty levels and term lengths arrive. Every save that
     * exists was played at what is now `standard` over what is now the `full`
     * term — both baselines carry empty payloads, so stamping them on changes
     * nothing about the run in progress. That is the whole migration, and it
     * is why the baselines are empty: a v6 save and a v7 `standard`/`full`
     * save are the same game, exactly, rather than nearly. */
    if (save.schemaVersion === 6) {
      save.setup = {
        difficultyId: Mandate.SETUP.DEFAULT.difficultyId,
        termId: Mandate.SETUP.DEFAULT.termId,
      };
      save.schemaVersion = 7;
    }

    if (save.schemaVersion !== State.SCHEMA_VERSION) {
      console.warn(
        '[Mandate] save is schema v' + save.schemaVersion +
        ', game expects v' + State.SCHEMA_VERSION + '. Discarding it.'
      );
      return null;
    }

    /* A save always resumes paused: nobody wants the clock running while they
     * are still working out what was happening. */
    save.speed = 0;
    return save;
  };

  /* ------------------------------------------------------------------------
   * BEST SCORES
   * Kept in their own localStorage key, deliberately NOT in the save: the save
   * is one run and is cleared when a new one starts, whereas a best score has
   * to outlive every run it describes. A corrupt or missing table is simply an
   * empty one — a scoreboard must never be the thing that stops the game
   * loading.
   * ---------------------------------------------------------------------- */

  State.loadBestScores = function () {
    try {
      var raw = window.localStorage.getItem(Mandate.BALANCE.scoring.bestScoresKey);
      var parsed = raw ? JSON.parse(raw) : null;
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (err) {
      console.warn('[Mandate] could not read best scores:', err);
      return {};
    }
  };

  /**
   * Record a finished run against its leader, keeping only the better of the
   * two. Returns true when this run set a new best, so the summary screen can
   * say so.
   */
  State.recordBestScore = function (state) {
    var best = State.loadBestScores();
    /* Keyed by leader AND setup: a short Steady term and a full Hard one are
     * not the same quantity, and sharing a slot would report a personal best
     * set under rules the player is not currently playing. */
    var key = Mandate.SETUP.scoreKey(state.leaderId, state.setup);
    var previous = best[key];
    if (previous && previous.score >= state.score) return false;

    best[key] = {
      score: state.score,
      days: state.day,
      won: state.won,
      development: Math.round(state.derived.nationalDevelopment),
      stability: Math.round(state.derived.nationalStability),
      at: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(
        Mandate.BALANCE.scoring.bestScoresKey, JSON.stringify(best));
    } catch (err) {
      console.warn('[Mandate] could not save best scores:', err);
    }
    return true;
  };

  Mandate.State = State;
})(window.Mandate = window.Mandate || {});
