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
  var lastAusterity = null;

  Hud.build = function (onSpeedChange) {
    els = {
      treasuryChip: Util.el('hud-treasury-chip'),
      treasury: Util.el('hud-treasury'),
      treasuryRate: Util.el('hud-treasury-rate'),
      capital: Util.el('hud-capital'),
      capitalRate: Util.el('hud-capital-rate'),
      manpower: Util.el('hud-manpower'),
      manpowerRate: Util.el('hud-manpower-rate'),
      stability: Util.el('hud-stability'),
      mandate: Util.el('hud-mandate'),
      mandateFill: Util.el('hud-mandate-fill'),
      mandateGauge: Util.el('hud-mandate-gauge'),
      date: Util.el('hud-date'),
      term: Util.el('hud-term'),
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
     * always show the trend, not just the total. It is NET of the upkeep
     * bill, so a country quietly spending more than it earns reads as
     * negative here rather than looking healthy until it collapses. */
    View.setText(els.treasuryRate, Util.formatRate(state.derived.treasuryPerDay) + '/d');

    /* Austerity — the bill is about to go unpaid — turns the chip red. It is
     * the one state the player must never find out about late, because it
     * eats development and stability at the same time. */
    if (els.treasuryChip && lastAusterity !== state.derived.austerity) {
      els.treasuryChip.classList.toggle('chip--austerity', state.derived.austerity);
      lastAusterity = state.derived.austerity;
    }

    View.setText(els.capital, Util.formatInt(state.resources.politicalCapital));
    View.setText(els.capitalRate,
      Util.formatRate(state.derived.politicalCapitalPerDay) + '/d');

    /* "held/cap" — Manpower fills up and stops, so the headroom matters as
     * much as the total. */
    View.setText(els.manpower, Util.formatInt(state.resources.manpower) +
      '/' + Util.formatInt(state.derived.manpowerCap));
    View.setText(els.manpowerRate, Util.formatRate(state.derived.manpowerPerDay) + '/d');

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

    /* How far through the term. Phase 4 gave the clock a far end as well as a
     * near one, and a player who doesn't know the term is finite cannot pace
     * it: "Year 8 of 10" changes what you do with your last Political Capital
     * in a way that a date alone never will. Years, not days, because the
     * decision it informs is a coarse one. */
    var termYears = Math.ceil(B.mandate.termDays / 365);
    var year = Math.min(termYears, Math.floor(state.day / 365) + 1);
    View.setText(els.term, 'Year ' + year + ' of ' + termYears);

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
