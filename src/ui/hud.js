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

  /* Is the "why is my mandate draining?" panel showing? A camera fact, so it
   * lives here rather than in the save. */
  var whyOpen = false;
  /* The breakdown is rebuilt only when its SHAPE changes — the set of causes
   * and their rounded rates. Rebuilding six rows every frame would throw away
   * the memoisation the rest of the HUD depends on. */
  var lastWhySignature = null;

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
      /* The progressbar role moved onto the track when the gauge became a
         button — a <button> cannot also be a progressbar, and the value has
         to live on whichever element carries that role. */
      mandateTrack: Util.el('hud-mandate-track'),
      date: Util.el('hud-date'),
      term: Util.el('hud-term'),
      mandateRate: Util.el('hud-mandate-rate'),
      why: Util.el('mandate-why'),
      whyList: Util.el('mandate-why-list'),
      whyTotal: Util.el('mandate-why-total'),
    };

    /* THE GAUGE IS A BUTTON. This is the single most useful thing Phase 5
     * takes from the reference games: Rebel Inc.'s reputation meter never
     * simply falls, it tells you in words what is eating it. A bar that
     * drains for reasons the player cannot inspect teaches them nothing, so
     * every run they lose is the same run.
     *
     * The numbers come from Sim.mandateBreakdown, which is also what actually
     * charges the meter — so the reasons and the rate cannot drift apart. */
    View.onTap(els.mandateGauge, function () { Hud.toggleWhy(); });
    View.onTap(Util.el('mandate-why-close'), function () { Hud.toggleWhy(false); });

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
    if (els.mandateTrack) {
      els.mandateTrack.setAttribute('aria-valuenow', Math.round(state.mandate));
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

    /* The rate under the number. Phase 5: the gauge used to show a level with
     * no sense of how fast it was going, which is the one thing a player
     * needs in order to pace a term. */
    View.setText(els.mandateRate, Util.formatRate(state.derived.mandatePerDay) + '/d');

    renderWhy(state);

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

  /* ------------------------------------------------------------------------
   * "WHERE IS MY MANDATE GOING?"
   *
   * One row per cause, biggest first, with the days each one is costing at
   * today's rate. Days rather than raw decimals on purpose: "0.03/day" is a
   * number, "about 12 days a year" is a decision. The player is spending a
   * term, so the term is the unit they should be shown.
   * ---------------------------------------------------------------------- */

  Hud.toggleWhy = function (force) {
    whyOpen = force === undefined ? !whyOpen : !!force;
    View.setOpen(els.why, whyOpen);
    if (els.mandateGauge) {
      els.mandateGauge.setAttribute('aria-expanded', whyOpen ? 'true' : 'false');
    }
  };

  Hud.closeWhy = function () { Hud.toggleWhy(false); };

  function renderWhy(state) {
    if (!whyOpen || !els.whyList) return;

    var breakdown = state.derived.mandateBreakdown || { total: 0, lines: [] };
    var lines = breakdown.lines.slice().sort(function (a, b) {
      return b.perDay - a.perDay;
    });

    /* Rebuild only when the itemisation actually changed. The rates move
     * continuously, so the signature rounds them — otherwise this rebuilds
     * every frame and the panel can never be read. */
    var signature = lines.map(function (line) {
      return line.key + ':' + line.perDay.toFixed(3) + ':' + line.detail;
    }).join('|');
    if (signature === lastWhySignature) return;
    lastWhySignature = signature;

    els.whyList.innerHTML = '';
    lines.forEach(function (line) {
      var row = View.node('div', 'why__row');
      var head = View.node('div', 'why__head');
      head.appendChild(View.node('div', 'why__label', line.label));
      head.appendChild(View.node('div', 'why__value', share(line, breakdown) + '%'));
      row.appendChild(head);
      if (line.detail) row.appendChild(View.node('div', 'why__detail', line.detail));

      /* A share bar, so the largest cause is obvious without reading. */
      var bar = View.node('div', 'why__bar');
      var fill = View.node('div', 'why__fill');
      fill.style.width = share(line, breakdown) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);

      els.whyList.appendChild(row);
    });

    View.setText(els.whyTotal, breakdown.total > 0
      ? 'At this rate the term ends in ' +
        Math.round(state.mandate / breakdown.total).toLocaleString('en-US') + ' days.'
      : 'Nothing is spending your mandate.');
  }

  /**
   * A line's share of today's total drain, as a whole percentage.
   *
   * Deliberately a share and not the raw rate. "0.008 per day" is a number
   * the player cannot act on; "31% of what is costing you the term" is the
   * thing they actually want to know, which is *which one to go and fix*.
   * The headline under the list carries the absolute figure — days of term
   * left at this rate — so nothing is hidden, it is just ranked first by
   * what is most useful.
   */
  function share(line, breakdown) {
    if (!breakdown.total) return 0;
    return Math.round((line.perDay / breakdown.total) * 100);
  }

  Mandate.Hud = Hud;
})(window.Mandate = window.Mandate || {});
