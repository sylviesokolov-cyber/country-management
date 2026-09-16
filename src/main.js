/* ============================================================================
 * src/main.js — boot and wiring. The only file that knows about all the others.
 * ----------------------------------------------------------------------------
 * The whole game in five lines:
 *
 *     state = load() or createNewGame()
 *     loop  = GameLoop({ onTick: Sim.tick, onRender: render })
 *     render(state) = Hud.render + Map.render + Panel.render
 *     taps -> Sim.applyAction(state, ...)
 *     autosave every so often
 *
 * Note there is no "update the UI after an action" code anywhere. The render
 * pass runs every frame from state, so any change the sim makes shows up on
 * the next frame automatically. That is the payoff for keeping simulation and
 * rendering apart.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Util = Mandate.Util;
  var state = null;
  var loop = null;

  /* Autosave cadence, in ticks (days). Frequent enough that nothing is lost
   * when a phone browser kills a backgrounded tab; rare enough that we're not
   * serialising the world 60 times a second. */
  var AUTOSAVE_EVERY_TICKS = 20;

  function boot() {
    /* Resume the last run if there is one, otherwise start fresh. */
    state = Mandate.State.load() || Mandate.State.createNewGame();

    /* Populate derived values (output, per-day rates) before the first frame,
     * WITHOUT advancing the clock — reloading the page must never cost the
     * player a day. */
    Mandate.Sim.refresh(state);

    /* --- build the view once --- */
    Mandate.MapView.build(Util.el('map'), onRegionTap);
    Mandate.Hud.build(onSpeedChange);
    Mandate.Panel.build({ onAction: onRegionAction });
    Mandate.Fullscreen.build();
    Mandate.Overlay.build({
      /* The overlay renders from live state, so it asks for it rather than
       * holding a stale reference. */
      getState: function () { return state; },
      onPickRegion: onPickRegionFromList,
    });
    /* The Phase 3 screens. Every handler is the same three lines: ask the sim,
     * save if it happened, redraw the open tab. The redraw is explicit because
     * these tabs only rebuild when the DAY changes — without it a tap would
     * appear to do nothing for up to a second, or forever while paused. */
    Mandate.Ministry.build({
      onQueueTech: function (id) { commit(Mandate.Sim.queueTech(state, id)); },
      onCancelTech: function (id) { commit(Mandate.Sim.cancelTech(state, id)); },
      onHire: function (id) { commit(Mandate.Sim.hire(state, id)); },
      onDismiss: function (id) { commit(Mandate.Sim.dismiss(state, id)); },
      onAssign: function (id, regionId) {
        commit(Mandate.Sim.assign(state, id, regionId));
      },
      onEnactPolicy: function (categoryId, optionId) {
        commit(Mandate.Sim.enactPolicy(state, categoryId, optionId));
      },
    });

    /* The two bottom-corner buttons are just overlay openers. */
    Mandate.View.onTap(Util.el('btn-ministry'), function () { onOverlayOpen('tech'); });
    Mandate.View.onTap(Util.el('btn-regions'), function () { onOverlayOpen('regions'); });

    Mandate.View.onTap(Util.el('veil-restart'), startNewRun);

    /* --- start the clock --- */
    loop = new Mandate.GameLoop({
      state: state,
      onTick: onTick,
      onRender: render,
    });
    loop.start();

    wireLifecycle();

    /* Handy in the phone browser's dev console / for debugging on desktop:
     *   Mandate.debug.state.resources.treasury = 99999 */
    Mandate.debug = { get state() { return state; }, loop: loop };
  }

  /* ------------------------------------------------------------------------
   * SIM CALLBACKS
   * ---------------------------------------------------------------------- */

  function onTick(s) {
    Mandate.Sim.tick(s);
    if (s.day % AUTOSAVE_EVERY_TICKS === 0) Mandate.State.save(s);
  }

  function render(s) {
    Mandate.Hud.render(s);
    Mandate.MapView.render(s);
    Mandate.Panel.render(s);
    Mandate.Overlay.render(s);
    renderGameOver(s);
  }

  /* ------------------------------------------------------------------------
   * INPUT
   * ---------------------------------------------------------------------- */

  function onSpeedChange(speed) {
    state.speed = speed;
    /* Clearing the accumulator stops any partially-elapsed tick from firing
     * the instant the player unpauses. */
    loop.resetClock();
    Mandate.State.save(state);
  }

  function onRegionTap(regionId) {
    Mandate.Overlay.close();         /* only one thing open at a time */
    if (Mandate.View.viewState.selectedRegionId === regionId) {
      Mandate.Panel.close();         /* tapping the open region closes it */
    } else {
      Mandate.Panel.open(state, regionId);
    }
  }

  /* Picking a region from the Regions list: select it and get out of the way
   * so the player lands back on the map with the panel open. */
  function onPickRegionFromList(regionId) {
    Mandate.Overlay.close();
    Mandate.Panel.open(state, regionId);
  }

  /**
   * The tail of every management decision: if the sim accepted it, save and
   * redraw the open tab. Passing the sim's own return value through means the
   * UI never has to decide for itself whether something happened.
   */
  function commit(happened) {
    if (!happened) return;
    Mandate.State.save(state);
    Mandate.Overlay.refresh(state);
  }

  function onRegionAction(regionId, actionId) {
    /* The UI asks; the simulation decides. If the action is illegal this is a
     * no-op and the button simply stays greyed out on the next frame. */
    if (Mandate.Sim.applyAction(state, regionId, actionId)) {
      Mandate.State.save(state);
      /* A region action can change what a management tab shows — an Invest
       * moves the Manpower cap, a Garrison changes what a posting is worth. */
      Mandate.Overlay.refresh(state);
    }
  }

  function onOverlayOpen(tabId) {
    Mandate.Panel.close();
    /* Tapping the button for the tab that is already open closes it — standard
     * phone behaviour, and it makes the corner buttons a toggle. */
    if (Mandate.View.viewState.activeTab === tabId) {
      Mandate.Overlay.close();
    } else {
      Mandate.Overlay.open(tabId);
    }
  }

  /* ------------------------------------------------------------------------
   * GAME OVER — the run summary.
   *
   * Built once, on the frame the run actually ends, rather than every frame:
   * the veil is static from then on. Phase 4 turns these figures into a real
   * score and keeps a best-per-leader table; for now they are the honest
   * record of what one term amounted to.
   * ---------------------------------------------------------------------- */
  function renderGameOver(s) {
    var veil = Util.el('veil');
    if (!veil) return;

    var shouldShow = !!s.gameOver;
    if (veil.classList.contains('is-open') === shouldShow) return;

    veil.classList.toggle('is-open', shouldShow);
    if (!shouldShow) return;

    Util.el('veil-reason').textContent = s.gameOverReason || '';
    buildRunSummary(Util.el('veil-stats'), s);
  }

  function buildRunSummary(listEl, s) {
    if (!listEl) return;
    listEl.innerHTML = '';

    var startDate = Mandate.BALANCE.time.startDate;
    var years = (s.day / 365).toFixed(1);
    var calm = s.day > 0
      ? Math.round(((s.day - s.stats.daysInUnrest) / s.day) * 100)
      : 100;

    [
      ['Days in office', Util.formatInt(s.day) + '  (' + years + ' years)'],
      ['Left office', Util.formatDate(Util.dateFromDay(startDate, s.day))],
      ['National stability', Math.round(s.derived.nationalStability) + '%'],
      ['Development built',
        Util.formatInt(s.derived.nationalDevelopment) + '  (from ' +
        Util.formatInt(startingDevelopment()) + ')'],
      ['Term without unrest', calm + '%'],
      ['Research completed',
        s.stats.techCompleted + ' of ' + Mandate.TECH.nodes.length + ' nodes'],
      ['Appointments made', Util.formatInt(s.stats.appointeesHired)],
      ['Decisions taken', Util.formatInt(s.stats.actionsTaken)],
      ['Treasury raised', Util.formatInt(s.stats.treasuryEarned)],
    ].forEach(function (pair) {
      var dt = document.createElement('dt');
      dt.textContent = pair[0];
      var dd = document.createElement('dd');
      dd.textContent = pair[1];
      listEl.appendChild(dt);
      listEl.appendChild(dd);
    });
  }

  /** What the country was handed to you as, straight from the data file. */
  function startingDevelopment() {
    return Mandate.REGIONS.reduce(function (total, def) {
      return total + def.development;
    }, 0);
  }

  /**
   * Throw the run away and start another. The loop holds its own reference to
   * the state object, so it has to be handed the new one — otherwise the
   * clock would keep ticking the dead world while the UI drew the new one.
   */
  function startNewRun() {
    Mandate.State.clearSave();
    state = Mandate.State.createNewGame();
    Mandate.Sim.refresh(state);

    loop.state = state;
    loop.resetClock();

    Mandate.Panel.close();
    Mandate.Overlay.close();
    /* The memo cache is keyed by element, not by run: without this the new
     * game's identical-looking values would be skipped as "unchanged". */
    Mandate.View.invalidate();

    Mandate.State.save(state);
  }

  /* ------------------------------------------------------------------------
   * PHONE LIFECYCLE
   * A mobile browser can freeze or discard a backgrounded tab at any moment.
   * ---------------------------------------------------------------------- */
  function wireLifecycle() {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        /* Save before the tab can be discarded, and pause so the run doesn't
         * advance while the player is in another app. */
        Mandate.State.save(state);
        state.speed = 0;
      } else {
        /* Throw away the real time that passed while hidden. */
        loop.resetClock();
      }
    });

    /* `pagehide` is the reliable "I might not come back" hook on iOS Safari —
     * `beforeunload` is unreliable there. */
    window.addEventListener('pagehide', function () {
      Mandate.State.save(state);
    });

    /* Belt and braces against pinch-zoom on iOS, which ignores the viewport
     * meta tag's user-scalable=no. */
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  }

  /* The scripts are at the end of <body>, so the DOM is already parsed — but
   * guard anyway in case a future change moves them into <head>. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.Mandate = window.Mandate || {});
