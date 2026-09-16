/* ============================================================================
 * src/ui/hud.js — the floating HUD: resource chips, clock, speed, gauges.
 * ----------------------------------------------------------------------------
 * Reads state, writes text. The speed buttons are the one place it writes
 * back, and even that goes through a callback owned by main.js.
 *
 * The HUD overlays the map, so it is deliberately sparse: four chips, a date,
 * three speed buttons and one vertical gauge. Anything more detailed belongs
 * in the region panel or the management overlay, not permanently on screen.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Hud = {};
  var Util = Mandate.Util;
  var View = Mandate.View;

  var els = {};
  var speedButtons = [];
  var lastHealth = null;

  Hud.build = function (onSpeedChange) {
    els = {
      treasury: Util.el('hud-treasury'),
      treasuryRate: Util.el('hud-treasury-rate'),
      capital: Util.el('hud-capital'),
      manpower: Util.el('hud-manpower'),
      stability: Util.el('hud-stability'),
      mandate: Util.el('hud-mandate'),
      mandateFill: Util.el('hud-mandate-fill'),
      mandateGauge: Util.el('hud-mandate-gauge'),
      date: Util.el('hud-date'),
    };

    speedButtons = Array.prototype.slice.call(document.querySelectorAll('.speed__btn'));
    speedButtons.forEach(function (btn) {
      View.onTap(btn, function () {
        onSpeedChange(parseInt(btn.dataset.speed, 10));
      });
    });
  };

  Hud.render = function (state) {
    var B = Mandate.BALANCE;

    View.setText(els.treasury, Util.formatInt(state.resources.treasury));
    /* The rate answers "and where is this heading?" — a strategy HUD should
     * always show the trend, not just the total. */
    View.setText(els.treasuryRate, Util.formatRate(state.derived.treasuryPerDay) + '/d');

    View.setText(els.capital, Util.formatInt(state.resources.politicalCapital));
    View.setText(els.manpower, Util.formatInt(state.resources.manpower));
    View.setText(els.stability, Math.round(state.derived.nationalStability) + '%');

    /* The gauge drains downward, so it is the fill's HEIGHT that tracks the
     * value (the element is anchored to the bottom of the track in CSS). */
    var pct = (state.mandate / B.mandate.max) * 100;
    View.setText(els.mandate, Math.round(state.mandate));
    View.setStyle(els.mandateFill, 'height', pct.toFixed(1) + '%');
    if (els.mandateGauge) {
      els.mandateGauge.setAttribute('aria-valuenow', Math.round(state.mandate));
    }
    /* One class on the gauge drives both the bar and the number, so they can
     * never disagree. Thresholds come from balance, not from here. */
    if (els.mandateGauge) {
      var health = state.mandate < B.mandate.warnBelow ? 'low'
        : state.mandate < B.mandate.healthyAbove ? 'warn' : 'ok';
      if (lastHealth !== health) {
        els.mandateGauge.classList.remove('gauge--low', 'gauge--warn');
        if (health !== 'ok') els.mandateGauge.classList.add('gauge--' + health);
        lastHealth = health;
      }
    }

    View.setText(els.date, Util.formatDate(Util.dateFromDay(B.time.startDate, state.day)));

    /* aria-pressed doubles as the CSS hook for the active speed — one source
     * of truth for "which speed is selected". */
    for (var i = 0; i < speedButtons.length; i++) {
      var btn = speedButtons[i];
      var active = parseInt(btn.dataset.speed, 10) === state.speed;
      if ((btn.getAttribute('aria-pressed') === 'true') !== active) {
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }
  };

  Mandate.Hud = Hud;
})(window.Mandate = window.Mandate || {});
