/* ============================================================================
 * src/ui/hud.js — top HUD: resources, mandate meter, date, speed buttons.
 * Reads state, writes text. Speed buttons are the one place it writes back,
 * and even that goes through a callback owned by main.js.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Hud = {};
  var Util = Mandate.Util;
  var View = Mandate.View;

  var els = {};
  var speedButtons = [];

  Hud.build = function (onSpeedChange) {
    els = {
      treasury: Util.el('hud-treasury'),
      capital: Util.el('hud-capital'),
      manpower: Util.el('hud-manpower'),
      mandate: Util.el('hud-mandate'),
      mandateFill: Util.el('hud-mandate-fill'),
      mandateTrack: Util.el('hud-mandate-track'),
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

    /* Treasury shows its per-day rate alongside the total: a strategy HUD
     * should always answer "and where is this heading?". */
    View.setText(els.treasury,
      Util.formatInt(state.resources.treasury) +
      '  ' + Util.formatRate(state.derived.treasuryPerDay) + '/d');

    View.setText(els.capital, Util.formatInt(state.resources.politicalCapital));
    View.setText(els.manpower, Util.formatInt(state.resources.manpower));

    var pct = (state.mandate / B.mandate.max) * 100;
    View.setText(els.mandate, state.mandate.toFixed(1));
    View.setStyle(els.mandateFill, 'width', pct.toFixed(1) + '%');
    if (els.mandateFill) {
      var low = state.mandate < B.mandate.warnBelow;
      if (els.mandateFill.classList.contains('mandate__fill--low') !== low) {
        els.mandateFill.classList.toggle('mandate__fill--low', low);
      }
    }
    if (els.mandateTrack) els.mandateTrack.setAttribute('aria-valuenow', Math.round(state.mandate));

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
