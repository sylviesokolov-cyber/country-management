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

  /* The speed the player was running at when an event interrupted them. The
   * sim pauses the clock so the choice is read rather than reflexed; putting
   * them back where they were afterwards is the difference between an
   * interruption and a punishment. */
  var speedBeforeEvent = 1;

  /* Autosave cadence, in ticks (days). Frequent enough that nothing is lost
   * when a phone browser kills a backgrounded tab; rare enough that we're not
   * serialising the world 60 times a second. */
  var AUTOSAVE_EVERY_TICKS = 20;

  function boot() {
    /* Resume the last run if there is one. If there is not, we still need a
     * state object for the very first render — the HUD and map draw behind the
     * leader screen — so a provisional run is created and then THROWN AWAY the
     * moment a leader is picked. It is never saved, because a run the player
     * has not started is not a run. */
    /* Audio arms itself here and starts on the player's first tap — every
     * mobile browser refuses to run an AudioContext before a gesture, and a
     * suspended one silently swallows everything scheduled into it. */
    Mandate.Audio.install();

    var resumed = Mandate.State.load();
    state = resumed || Mandate.State.createNewGame();

    /* Populate derived values (output, per-day rates) before the first frame,
     * WITHOUT advancing the clock — reloading the page must never cost the
     * player a day. */
    Mandate.Sim.refresh(state);

    /* --- build the view once --- */
    /* The icon sprite goes in FIRST: every view below builds elements that
     * reference it, and `hydrate` swaps the `data-icon` placeholders in
     * index.html for real glyphs. */
    Mandate.Icons.inject();
    Mandate.Icons.hydrate();

    Mandate.MapView.build(Util.el('map'), onRegionTap);
    Mandate.MapView.buildLayerSwitch(
      Util.el('layer-switch'), Util.el('layer-caption'));
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
      onQueueTech: function (id) { commit(Mandate.Sim.queueTech(state, id), 'tick'); },
      onCancelTech: function (id) { commit(Mandate.Sim.cancelTech(state, id), 'close'); },
      onHire: function (id) { commit(Mandate.Sim.hire(state, id), 'hire'); },
      onDismiss: function (id) { commit(Mandate.Sim.dismiss(state, id), 'withdraw'); },
      onAssign: function (id, regionId) {
        commit(Mandate.Sim.assign(state, id, regionId), 'tick');
      },
      onEnactPolicy: function (categoryId, optionId) {
        commit(Mandate.Sim.enactPolicy(state, categoryId, optionId), 'policy');
      },
      onStartProject: function (id) { commit(Mandate.Sim.startProject(state, id), 'invest'); },
      onAbandonProject: function () { commit(Mandate.Sim.abandonProject(state), 'withdraw'); },
    });

    /* The Settings tab. Saving and restarting are boot-level concerns, so
     * they live here rather than in the tab that draws the buttons. */
    Mandate.SettingsUI.build({
      onSave: function () { return Mandate.State.save(state); },
      onRestart: resign,
    });

    /* The two bottom-corner buttons are just overlay openers. */
    Mandate.View.onTap(Util.el('btn-ministry'), function () { onOverlayOpen('tech'); });
    Mandate.View.onTap(Util.el('btn-regions'), function () { onOverlayOpen('regions'); });

    /* The news ticker and the alert toasts. Both are pure view: they read the
     * run log and the derived totals and never decide that anything happened.
     * The ticker opens the log; a toast about a province offers to take you
     * there. */
    Mandate.Alerts.build({
      onOpenLog: function () { onOverlayOpen('events'); },
      onPickRegion: onPickRegionFromList,
    });

    Mandate.EventUI.build({
      onChoose: onEventChoice,
      /* The run log's rows go to the same place the Regions list does. */
      onPickRegion: onPickRegionFromList,
    });
    Mandate.LeaderSelect.build({ onPick: onLeaderPicked });

    Mandate.View.onTap(Util.el('veil-restart'), function () {
      Util.el('veil').classList.remove('is-open');
      Mandate.Audio.setScene('menu');
      /* Close whatever was left open behind the summary — the leader screen
       * is a fresh start, and the last run's Ministry showing through it is
       * the previous government's paperwork. */
      Mandate.Panel.close();
      Mandate.Overlay.close();
      Mandate.LeaderSelect.open();
    });

    /* --- start the clock --- */
    loop = new Mandate.GameLoop({
      state: state,
      onTick: onTick,
      onRender: render,
    });
    loop.start();

    /* A resumed run goes straight back to the map. A fresh one starts at the
     * leader screen, which is modal over everything: until a leader is chosen
     * there is no run, and the provisional state above is only scenery. */
    if (resumed) {
      Mandate.LeaderSelect.close();
      Mandate.Audio.setScene('run');
    } else {
      Mandate.LeaderSelect.open();
      Mandate.Audio.setScene('menu');
      state.speed = 0;
    }

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
    Mandate.EventUI.render(s);
    Mandate.Alerts.render(s);
    /* The score and the cues read state exactly like every other view, on the
     * same pass. Nothing pushes audio; audio notices. */
    Mandate.Audio.observe(s);
    renderGameOver(s);
  }

  /* ------------------------------------------------------------------------
   * INPUT
   * ---------------------------------------------------------------------- */

  function onSpeedChange(speed) {
    state.speed = speed;
    speedBeforeEvent = speed || speedBeforeEvent;
    /* Clearing the accumulator stops any partially-elapsed tick from firing
     * the instant the player unpauses. */
    loop.resetClock();
    Mandate.State.save(state);
  }

  function onRegionTap(regionId) {
    Mandate.Overlay.close();         /* only one thing open at a time */
    Mandate.Hud.closeWhy();
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
  function commit(happened, cue) {
    /* The refusal is as much feedback as the confirmation: a tap that did
     * nothing has to sound like a tap that did nothing, or the player is left
     * wondering whether the button is broken. */
    if (!happened) { Mandate.Audio.sfx('deny'); return; }
    if (cue) Mandate.Audio.sfx(cue);
    Mandate.State.save(state);
    Mandate.Overlay.refresh(state);
  }

  /* Each region action has its OWN sound, because they differ in kind rather
   * than in size (DESIGN.md 2.2): building is wood and a rising fifth,
   * garrisoning is a drum, relief is the one warm chord in the game. A player
   * should be able to tell which one they just pressed without looking. */
  var ACTION_CUES = {
    invest: 'invest', publicWorks: 'works', garrison: 'garrison',
    withdraw: 'withdraw', relief: 'relief',
  };

  function onRegionAction(regionId, actionId) {
    /* The UI asks; the simulation decides. If the action is illegal this is a
     * no-op and the button simply stays greyed out on the next frame. */
    if (Mandate.Sim.applyAction(state, regionId, actionId)) {
      Mandate.Audio.sfx(ACTION_CUES[actionId] || 'tap');
      Mandate.State.save(state);
      /* A region action can change what a management tab shows — an Invest
       * moves the Manpower cap, a Garrison changes what a posting is worth. */
      Mandate.Overlay.refresh(state);
    }
  }

  /**
   * The player answered an event. The sim decides whether the choice was
   * legal; if it happened, the clock goes back to the speed they were running
   * at before they were interrupted.
   */
  function onEventChoice(choiceId) {
    if (!Mandate.Sim.resolveEvent(state, choiceId)) { Mandate.Audio.sfx('deny'); return; }
    Mandate.Audio.sfx('policy');
    state.speed = speedBeforeEvent;
    loop.resetClock();
    Mandate.State.save(state);
    Mandate.Overlay.refresh(state);
  }

  /**
   * A leader was chosen: this is where a run actually begins. The state built
   * at boot was scenery, so it is replaced outright rather than patched — a
   * leader changes the modifier table, and a half-started run carrying one
   * leader's opening resources under another leader's rules would be a bug
   * nobody would ever find.
   */
  function onLeaderPicked(leaderId, setup) {
    Mandate.Audio.sfx('leader');
    Mandate.Audio.reset();
    Mandate.Audio.setScene('run');
    Mandate.State.clearSave();
    state = Mandate.State.createNewGame(leaderId, setup);
    Mandate.Sim.refresh(state);
    Mandate.Sim.log(state, 'system',
      Mandate.LEADERS.byId(leaderId).title + ' takes office for ' +
      Mandate.SETUP.term(state.setup.termId).label.toLowerCase() + ', on ' +
      Mandate.SETUP.difficulty(state.setup.difficultyId).label.toLowerCase() +
      '.');

    loop.state = state;
    loop.resetClock();
    speedBeforeEvent = 1;

    Mandate.Panel.close();
    Mandate.Overlay.close();
    Mandate.Hud.closeWhy();
    /* One term's warnings must not carry into the next: without this, a run
     * started after losing at 5 Mandate would never fire the low-mandate
     * warning again, because the watch would still be latched on. */
    Mandate.Alerts.reset();
    Mandate.View.invalidate();
    Mandate.LeaderSelect.close();
    Util.el('veil').classList.remove('is-open');

    Mandate.State.save(state);
  }

  /**
   * Resign: end this term now, from the Settings tab.
   *
   * It goes through Sim.endRun rather than simply clearing the save, so a
   * resignation is a run that ENDED — logged, scored as the failure it is,
   * and with the same end-of-term screen as any other. A quit button that
   * quietly deletes the world would be the one place in the game where
   * something happened that the run log did not know about.
   */
  function resign() {
    if (!state.gameOver) {
      Mandate.Sim.endRun(state, false,
        'You resigned. The term was not served out.');
    }
    Mandate.Audio.silenceEnding();
    Mandate.State.clearSave();
    Mandate.Overlay.close();
    Mandate.Panel.close();
    Util.el('veil').classList.remove('is-open');
    Mandate.Audio.setScene('menu');
    Mandate.LeaderSelect.open();
  }

  function onOverlayOpen(tabId) {
    Mandate.Panel.close();
    Mandate.Hud.closeWhy();
    /* Tapping the button for the tab that is already open closes it — standard
     * phone behaviour, and it makes the corner buttons a toggle. */
    if (Mandate.View.viewState.activeTab === tabId) {
      Mandate.Overlay.close();
    } else {
      Mandate.Overlay.open(tabId);
    }
  }

  /* ------------------------------------------------------------------------
   * END OF TERM — the run summary.
   *
   * Built once, on the frame the run actually ends, rather than every frame:
   * the veil is static from then on.
   *
   * A run now ends one of TWO ways and the screen has to read differently for
   * each. Losing is an obituary; finishing the term is a result. Same figures,
   * completely different sentence at the top — and the score, which is the
   * thing a player carries into the next run.
   * ---------------------------------------------------------------------- */
  function renderGameOver(s) {
    var veil = Util.el('veil');
    if (!veil) return;

    /* Never over the leader screen: a finished run whose summary has been
     * dismissed must not reappear on top of the next choice. */
    var shouldShow = !!s.gameOver && !Mandate.LeaderSelect.isOpen();
    if (veil.classList.contains('is-open') === shouldShow) return;

    veil.classList.toggle('is-open', shouldShow);
    if (!shouldShow) return;

    Util.el('veil-title').textContent = s.won
      ? 'You served the full term'
      : 'Your term is over';
    Util.el('veil-reason').textContent = s.gameOverReason || '';
    buildScore(Util.el('veil-score'), s);
    buildRunSummary(Util.el('veil-stats'), s);
    buildMandateSpend(Util.el('veil-spend'), s);
  }

  /**
   * The score, and whether it beat this leader's previous best.
   *
   * recordBestScore() is called from here rather than from the sim on purpose:
   * the sim has no business touching localStorage, and the scoreboard is a
   * fact about the player rather than about the world. It is called exactly
   * once because this whole function runs exactly once per run.
   */
  function buildScore(el, s) {
    if (!el) return;
    el.innerHTML = '';

    var leader = Mandate.LEADERS.byId(s.leaderId);
    var previous = Mandate.State.loadBestScores()[s.leaderId];
    var isBest = Mandate.State.recordBestScore(s);

    el.appendChild(scoreLine('veil-score__value', Util.formatInt(s.score)));
    el.appendChild(scoreLine('veil-score__label',
      (leader ? leader.title + ' \u00b7 ' : '') +
      (isBest
        /* "first term served" was wrong on a first run that was LOST, which
         * is most first runs. The score is a first score either way; whether
         * the term was served is what `won` says. */
        ? (previous ? 'a new best' : 'your first term with them')
        : 'best ' + Util.formatInt(previous.score))));
  }

  function scoreLine(className, text) {
    var node = document.createElement('div');
    node.className = className;
    node.textContent = text;
    return node;
  }

  /**
   * WHERE THE TERM WENT — the hundred points of Mandate, itemised.
   *
   * This is the half of the end-of-term screen that teaches something. The
   * stats below say what the country looked like when you left it; this says
   * what you spent your time on to get there, and a player who loses at 2,400
   * days with 38 points gone to unrest has been told exactly what to do
   * differently, in a way that "final score 8,412" never manages.
   *
   * It reads `stats.mandateBy`, which Sim.chargeMandate accumulates from the
   * same arithmetic that actually moved the meter — so this cannot flatter
   * the run it is describing.
   */
  function buildMandateSpend(el, s) {
    if (!el) return;
    el.innerHTML = '';

    var spend = s.stats.mandateBy || {};
    var rows = Object.keys(spend)
      .map(function (key) { return { key: key, value: spend[key] }; })
      /* An event that HANDED Mandate back nets off against what events cost;
       * a net gain is real and worth showing, so only the empty lines go. */
      .filter(function (row) { return Math.abs(row.value) >= 0.5; })
      .sort(function (a, b) { return b.value - a.value; });
    if (!rows.length) return;

    var total = rows.reduce(function (sum, row) { return sum + Math.abs(row.value); }, 0);

    el.appendChild(scoreLine('veil-spend__title', 'Where your mandate went'));
    rows.forEach(function (row) {
      var line = document.createElement('div');
      line.className = 'veil-spend__row';

      var label = document.createElement('span');
      label.className = 'veil-spend__label';
      label.textContent = SPEND_LABELS[row.key] || row.key;

      var bar = document.createElement('span');
      bar.className = 'veil-spend__bar';
      var fill = document.createElement('span');
      fill.className = 'veil-spend__fill';
      fill.style.width = (Math.abs(row.value) / total * 100).toFixed(1) + '%';
      bar.appendChild(fill);

      var value = document.createElement('span');
      value.className = 'veil-spend__value';
      value.textContent = (row.value < 0 ? '+' : '') + Math.round(Math.abs(row.value));

      line.appendChild(label);
      line.appendChild(bar);
      line.appendChild(value);
      el.appendChild(line);
    });
  }

  /* The keys Sim.mandateBreakdown emits, in the player's language rather than
   * the simulation's. */
  var SPEND_LABELS = {
    baseline: 'Time in office',
    unrest: 'Regions in unrest',
    revolt: 'Provinces in revolt',
    garrison: 'Troops deployed',
    policy: 'Standing policies',
    austerity: 'Deficit financing',
    actions: 'Decisions taken',
    events: 'Events answered',
  };

  function buildRunSummary(listEl, s) {
    if (!listEl) return;
    listEl.innerHTML = '';

    var startDate = Mandate.BALANCE.time.startDate;
    var years = (s.day / 365).toFixed(1);
    var calm = Math.round(Mandate.Sim.calmShare(s) * 100);

    [
      ['Days in office',
        Util.formatInt(s.day) + ' of ' + Util.formatInt(Mandate.Sim.termDays(s)) +
        '  (' + years + ' years)'],
      ['Left office', Util.formatDate(Util.dateFromDay(startDate, s.day))],
      ['National stability', Math.round(s.derived.nationalStability) + '%'],
      ['Development built',
        Util.formatInt(s.derived.nationalDevelopment) + '  (from ' +
        Util.formatInt(Mandate.Sim.startingDevelopment()) + ')'],
      ['Term without unrest', calm + '%'],
      ['Provinces lost to revolt',
        Util.formatInt(s.stats.revoltsStarted || 0) +
        (s.stats.daysInRevolt
          ? '  (' + Util.formatInt(s.stats.daysInRevolt) + ' days in revolt)'
          : '')],
      ['Research completed',
        s.stats.techCompleted + ' of ' + Mandate.TECH.nodes.length + ' nodes'],
      ['Appointments made', Util.formatInt(s.stats.appointeesHired)],
      ['Events decided', Util.formatInt(s.stats.eventsResolved)],
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
