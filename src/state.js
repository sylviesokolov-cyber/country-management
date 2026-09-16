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
  State.SCHEMA_VERSION = 2;
  State.SAVE_KEY = 'mandate:save';

  /**
   * Build a fresh game world from the data files.
   * Note how everything numeric comes from BALANCE or the region data — there
   * are no magic numbers in this function.
   */
  State.createNewGame = function () {
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

      day: 0,               /* ticks elapsed; the date is derived from this */
      speed: 1,             /* 0 = paused, 1 = 1x, 2 = 2x */
      gameOver: false,
      gameOverReason: null,

      resources: {
        treasury: B.resources.treasury.start,
        politicalCapital: B.resources.politicalCapital.start,
        manpower: B.resources.manpower.start,
      },
      mandate: B.mandate.start,

      regions: regions,

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
      return null;
    }
    return State.migrate(parsed);
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

  Mandate.State = State;
})(window.Mandate = window.Mandate || {});
