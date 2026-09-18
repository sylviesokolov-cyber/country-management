/* ============================================================================
 * src/ui/settings.js — the Settings tab.
 * ----------------------------------------------------------------------------
 * Two jobs, and they are the two halves of "this is a real game rather than a
 * prototype" that Phase 5 had left undone:
 *
 *   SOUND    a mixer. Three levels and a haptics switch, applied live while
 *            the slider is moving, persisted outside the save.
 *   THE RUN  save now, and start again. The corrupt-save half of that TODO
 *            item was done in the last session; this is the player-facing
 *            half. A game with an autosave and no visible save button still
 *            reads as one that might lose your term.
 *
 * Everything here is view. The mixer talks to src/audio.js, which owns its
 * own settings; the two run controls are handlers passed in from main.js,
 * because saving and restarting are boot-level concerns and this file has no
 * business knowing what a run is.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Settings = {};
  var View = Mandate.View;
  var node = View.node;

  var handlers = {};

  /* The two facts on this tab that move while it is open. Held as element
   * references and written by update() rather than by rebuilding the tab,
   * because the day changes once a second at 1x and a rebuild mid-drag would
   * tear the volume slider out from under the player's thumb. */
  var liveEls = {};

  /* "Are you sure?" lives here rather than in a `confirm()` dialog, which is
   * blocking, unstyled, and on iOS arrives with the browser's own chrome over
   * a fullscreen game. The button asks a second time, in place. */
  var armedRestart = false;

  Settings.build = function (opts) {
    handlers = opts || {};
  };

  Settings.render = function (bodyEl, state) {
    bodyEl.innerHTML = '';
    liveEls = {};
    bodyEl.appendChild(soundSection());
    bodyEl.appendChild(runSection(state));
    bodyEl.appendChild(aboutSection(state));
  };

  /** Per-frame update: the two values that move, and nothing else. */
  Settings.update = function (state) {
    if (!liveEls.day) return;
    View.setText(liveEls.day, Mandate.Util.formatInt(state.day) + ' of ' +
      Mandate.Util.formatInt(Mandate.Sim.termDays(state)));
    View.setText(liveEls.mandate, Math.round(state.mandate) + ' of ' +
      Mandate.BALANCE.mandate.max);
  };

  /** Leaving the tab disarms the restart, so it can never be armed from a
   *  previous visit and fire on one tap. */
  Settings.leave = function () {
    armedRestart = false;
  };

  /* ------------------------------------------------------------------------
   * SOUND
   * ---------------------------------------------------------------------- */
  function soundSection() {
    var Audio = Mandate.Audio;
    var wrap = node('section', 'settings-group');
    wrap.appendChild(heading('sound', 'Sound'));

    if (!Audio || !Audio.isAvailable()) {
      wrap.appendChild(node('p', 'note',
        'This browser has no Web Audio support, so the game is silent. ' +
        'Nothing else is affected.'));
      return wrap;
    }

    wrap.appendChild(slider('master', 'Overall', 'sound'));
    wrap.appendChild(slider('music', 'Music', 'music'));
    wrap.appendChild(slider('sfx', 'Effects', 'events'));
    wrap.appendChild(toggle('haptics', 'Vibration',
      'A short buzz on the decisions that matter. Phones only.', 'haptics'));

    var note = node('p', 'note',
      'The score is generated as you play rather than recorded, so it follows ' +
      'the country: the melody thins out as provinces slide, and the drums ' +
      'arrive with the first revolt. If the game is silent, tap the screen ' +
      'once — phone browsers will not start audio until you do.');
    wrap.appendChild(note);
    return wrap;
  }

  function slider(key, label, icon) {
    var Audio = Mandate.Audio;
    var row = node('div', 'settings-row');

    var name = node('label', 'settings-row__label');
    if (Mandate.Icons.has(icon)) {
      name.appendChild(Mandate.Icons.el(icon, 'settings-row__icon'));
    }
    name.appendChild(document.createTextNode(label));

    var input = document.createElement('input');
    input.type = 'range';
    input.className = 'settings-slider';
    input.min = '0';
    input.max = '100';
    input.step = '5';
    input.value = String(Math.round(Audio.get(key) * 100));
    input.setAttribute('aria-label', label + ' volume');

    var value = node('span', 'settings-row__value', input.value + '%');

    /* `input`, not `change`: the point of a volume slider is that you hear
     * where you are while your thumb is still on it. */
    input.addEventListener('input', function () {
      value.textContent = input.value + '%';
      Audio.set(key, Number(input.value) / 100);
    });

    name.setAttribute('for', input.id = 'set-' + key);

    row.appendChild(name);
    row.appendChild(input);
    row.appendChild(value);
    return row;
  }

  function toggle(key, label, blurb, icon) {
    var Audio = Mandate.Audio;
    var on = !!Audio.get(key);

    var btn = node('button', 'settings-toggle');
    btn.dataset.sfx = 'none';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');

    var name = node('span', 'settings-row__label');
    if (Mandate.Icons.has(icon)) {
      name.appendChild(Mandate.Icons.el(icon, 'settings-row__icon'));
    }
    name.appendChild(document.createTextNode(label));

    var text = node('span', 'settings-toggle__text');
    text.appendChild(name);
    text.appendChild(node('small', 'settings-toggle__blurb', blurb));

    var pip = node('span', 'settings-toggle__pip');
    pip.setAttribute('aria-hidden', 'true');

    btn.appendChild(text);
    btn.appendChild(pip);

    View.onTap(btn, function () {
      on = !on;
      Audio.set(key, on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      /* Turning vibration ON should vibrate. It is the only way to check it
       * works on a phone whose system setting may be overriding ours. */
      if (on) Mandate.Audio.sfx('policy');
    });

    return btn;
  }

  /* ------------------------------------------------------------------------
   * THE RUN
   * ---------------------------------------------------------------------- */
  function runSection(state) {
    var wrap = node('section', 'settings-group');
    wrap.appendChild(heading('save', 'This term'));

    var saved = node('p', 'note',
      'The game saves itself every twenty days and whenever you leave the ' +
      'tab. This is for when you want to be certain.');

    var row = node('div', 'settings-actions');

    var save = node('button', 'mini-btn', 'Save now');
    save.dataset.sfx = 'none';
    View.onTap(save, function () {
      var ok = handlers.onSave && handlers.onSave();
      /* Report the truth: localStorage is blocked in private mode on iOS, and
       * a button that says "Saved" when nothing was written is worse than no
       * button at all. */
      save.textContent = ok ? 'Saved' : 'Could not save';
      Mandate.Audio.sfx(ok ? 'policy' : 'deny');
      window.setTimeout(function () { save.textContent = 'Save now'; }, 1800);
    });

    var restart = node('button', 'mini-btn mini-btn--danger',
      armedRestart ? 'Tap again to end the term' : 'Resign and start again');
    restart.dataset.sfx = 'none';
    View.onTap(restart, function () {
      if (!armedRestart) {
        armedRestart = true;
        restart.textContent = 'Tap again to end the term';
        Mandate.Audio.sfx('deny');
        return;
      }
      armedRestart = false;
      Mandate.Audio.sfx('close');
      if (handlers.onRestart) handlers.onRestart();
    });

    row.appendChild(save);
    row.appendChild(restart);
    wrap.appendChild(saved);
    wrap.appendChild(row);

    if (state && !state.gameOver) {
      wrap.appendChild(node('p', 'note',
        'Resigning ends this term immediately and without a score. ' +
        'There is one save slot, and starting again overwrites it.'));
    }
    return wrap;
  }

  /* ------------------------------------------------------------------------
   * ABOUT — where the run actually is, in one line.
   * ---------------------------------------------------------------------- */
  function aboutSection(state) {
    var wrap = node('section', 'settings-group');
    wrap.appendChild(heading('info', 'This government'));

    var leader = Mandate.LEADERS.byId(state.leaderId);
    var list = node('dl', 'settings-facts');

    fact(list, 'Leader', leader ? leader.title : '\u2014');
    liveEls.day = fact(list, 'Day', Mandate.Util.formatInt(state.day) + ' of ' +
      Mandate.Util.formatInt(Mandate.Sim.termDays(state)));
    liveEls.mandate = fact(list, 'Mandate', Math.round(state.mandate) + ' of ' +
      Mandate.BALANCE.mandate.max);
    fact(list, 'Save format', 'v' + Mandate.State.SCHEMA_VERSION +
      ' · balance v' + Mandate.BALANCE.balanceVersion);

    wrap.appendChild(list);
    return wrap;
  }

  function fact(list, label, value) {
    list.appendChild(node('dt', null, label));
    var dd = node('dd', null, value);
    dd.dataset.memoKey = 'settings:' + label;   /* so View.setText can memoise */
    list.appendChild(dd);
    return dd;
  }

  function heading(icon, text) {
    var h = node('h3', 'settings-head');
    if (Mandate.Icons.has(icon)) h.appendChild(Mandate.Icons.el(icon, 'settings-head__icon'));
    h.appendChild(document.createTextNode(text));
    return h;
  }

  Mandate.SettingsUI = Settings;
})(window.Mandate = window.Mandate || {});
