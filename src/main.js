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
    Mandate.Overlay.build({
      /* The overlay renders from live state, so it asks for it rather than
       * holding a stale reference. */
      getState: function () { return state; },
      onPickRegion: onPickRegionFromList,
    });

    /* The two bottom-corner buttons are just overlay openers. */
    Mandate.View.onTap(Util.el('btn-ministry'), function () { onOverlayOpen('tech'); });
    Mandate.View.onTap(Util.el('btn-regions'), function () { onOverlayOpen('regions'); });

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

  function onRegionAction(regionId, actionId) {
    /* The UI asks; the simulation decides. If the action is illegal this is a
     * no-op and the button simply stays greyed out on the next frame. */
    if (Mandate.Sim.applyAction(state, regionId, actionId)) {
      Mandate.State.save(state);
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
   * GAME OVER (Phase 2 turns this into a proper run summary)
   * ---------------------------------------------------------------------- */
  function renderGameOver(s) {
    var veil = Util.el('veil');
    if (!veil) return;
    var shouldShow = !!s.gameOver;
    if (veil.classList.contains('is-open') !== shouldShow) {
      veil.classList.toggle('is-open', shouldShow);
      Util.el('veil-reason').textContent = s.gameOverReason || '';
    }
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
