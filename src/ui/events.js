/* ============================================================================
 * src/ui/events.js — the event card, and the run log behind it.
 * ----------------------------------------------------------------------------
 * An event stops the game and asks a question. Two rules make that bearable
 * rather than annoying:
 *
 *   1. It is the ONLY thing on screen. Everything else is behind a scrim,
 *      because a branching choice read while you are also watching a region
 *      slide is not a choice, it is a reflex test. (The sim pauses the clock;
 *      main.js restores the previous speed when the player answers.)
 *   2. Every choice states its price and its consequence up front, and a
 *      choice you cannot afford is visibly greyed out with the reason, not
 *      hidden. Knowing what you can't do is part of the decision.
 *
 * As with everything else in src/ui, this asks the sim whether a choice is
 * legal (Sim.canChooseEvent) rather than working it out — the button and the
 * effect are then the same call and cannot disagree.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Events = {};
  var Util = Mandate.Util;
  var View = Mandate.View;
  var node = null;

  var veilEl, dayEl, titleEl, textEl, choicesEl;
  var handlers = {};
  var shownEventKey = null;

  Events.build = function (opts) {
    handlers = opts;
    node = View.node;
    veilEl = Util.el('event-veil');
    dayEl = Util.el('event-day');
    titleEl = Util.el('event-title');
    textEl = Util.el('event-text');
    choicesEl = Util.el('event-choices');
  };

  /**
   * Per-frame. The card is rebuilt only when the PENDING EVENT CHANGES, not
   * every frame — but the choice buttons are re-checked every frame while it
   * is open, because the Treasury is frozen but a player can still close the
   * card by answering, and because a save loaded mid-event must come back with
   * the right buttons live.
   */
  Events.render = function (state) {
    var pending = state.events && state.events.pending;
    var key = pending ? pending.eventId + '@' + pending.day : null;

    if (key !== shownEventKey) {
      shownEventKey = key;
      if (pending) build(state, pending);
      veilEl.classList.toggle('is-open', !!pending);
      return;
    }
    if (pending) refreshChoices(state);
  };

  function build(state, pending) {
    var event = Mandate.EVENTS.byId(pending.eventId);
    if (!event) return;

    View.setText(dayEl,
      Util.formatDate(Util.dateFromDay(Mandate.BALANCE.time.startDate, pending.day)));
    titleEl.textContent = Mandate.Sim.fillText(state, event.title, pending.regionId);
    textEl.textContent = Mandate.Sim.fillText(state, event.text, pending.regionId);

    choicesEl.innerHTML = '';
    event.choices.forEach(function (choice) {
      choicesEl.appendChild(buildChoice(state, pending, choice));
    });
    refreshChoices(state);
  }

  function buildChoice(state, pending, choice) {
    var btn = node('button', 'choice');
    btn.dataset.choiceId = choice.id;

    var main = node('div', 'choice__main');
    main.appendChild(node('div', 'choice__label',
      Mandate.Sim.fillText(state, choice.label, pending.regionId)));
    main.appendChild(node('div', 'choice__blurb',
      Mandate.Sim.fillText(state, choice.blurb, pending.regionId)));
    btn.appendChild(main);

    var side = node('div', 'choice__side');
    var price = priceOf(choice);
    if (price) side.appendChild(node('span', 'choice__cost', price));
    if (choice.mandateCost) {
      side.appendChild(node('span', 'choice__mandate', '−' + choice.mandateCost + ' mandate'));
    }
    /* A lasting consequence is the most important thing on the button and the
     * easiest to miss, so it gets its own line rather than being folded into
     * the blurb. */
    if (choice.effect) {
      side.appendChild(node('span', 'choice__lasting',
        Mandate.Sim.fillText(state, choice.effect.label, pending.regionId) +
        (choice.effect.days < 9000 ? ' · ' + choice.effect.days + 'd' : ' · permanent')));
    }
    side.appendChild(node('small', 'choice__reason', ''));
    btn.appendChild(side);

    View.onTap(btn, function () {
      if (btn.disabled) return;
      handlers.onChoose(choice.id);
    });
    return btn;
  }

  function priceOf(choice) {
    var parts = Object.keys(choice.cost || {}).map(function (key) {
      return Util.formatInt(choice.cost[key]) + ' ' + shortLabel(key);
    });
    return parts.join(' + ');
  }

  function shortLabel(key) {
    if (key === 'treasury') return '¤';
    if (key === 'manpower') return 'mp';
    if (key === 'politicalCapital') return 'pc';
    return key;
  }

  function refreshChoices(state) {
    var buttons = choicesEl.querySelectorAll('.choice');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var check = Mandate.Sim.canChooseEvent(state, btn.dataset.choiceId);
      if (btn.disabled !== !check.ok) btn.disabled = !check.ok;
      var reason = btn.querySelector('.choice__reason');
      var text = check.ok ? '' : check.reason;
      if (reason.textContent !== text) reason.textContent = text;
    }
  }

  /* ========================================================================
   * THE RUN LOG — what the Events tab shows when nothing is pending.
   *
   * It is the same tab on purpose: "what is happening" and "what has happened"
   * are the same question asked at different times, and a separate History tab
   * would be a tab nobody opened.
   * ====================================================================== */

  var KIND_ICONS = {
    event: '❕', tech: '⚙', ministry: '\u{1F464}', policy: '\u{1F4DC}',
    effect: '⏳', win: '★', lose: '†', system: 'ℹ',
  };

  Events.renderLog = function (body, state) {
    body.innerHTML = '';

    var leader = Mandate.LEADERS.byId(state.leaderId);
    if (leader) {
      var head = node('div', 'log-head');
      head.appendChild(node('span', 'log-head__title', leader.title));
      head.appendChild(node('span', 'log-head__name', leader.name));
      body.appendChild(head);
    }

    /* Anything an event choice left running, and when it ends. This belongs
     * here rather than in the HUD: it is a small number of things, they are
     * all temporary, and they are all consequences of something in the log
     * directly below. */
    if (state.effects && state.effects.length) {
      body.appendChild(node('h3', null, 'In force'));
      var effects = node('div', 'effect-list');
      state.effects.forEach(function (effect) {
        var row = node('div', 'effect-row');
        row.appendChild(node('span', 'effect-row__label', effect.label));
        var left = effect.untilDay - state.day;
        row.appendChild(node('span', 'effect-row__left',
          left > 9000 ? 'permanent' : left + ' days left'));
        effects.appendChild(row);
      });
      body.appendChild(effects);
    }

    body.appendChild(node('h3', null, 'The record'));

    if (!state.log || !state.log.length) {
      body.appendChild(node('p', 'note',
        'Nothing has happened yet. Research, appointments and the decisions ' +
        'your government takes are recorded here as the term runs.'));
      return;
    }

    var list = node('div', 'log-list');
    /* Newest first: the thing you want is almost always the last thing. */
    state.log.slice().reverse().forEach(function (entry) {
      var row = node('div', 'log-row');
      row.dataset.kind = entry.kind;

      var icon = node('span', 'log-row__icon', KIND_ICONS[entry.kind] || '·');
      icon.setAttribute('aria-hidden', 'true');
      row.appendChild(icon);

      var body_ = node('div', 'log-row__body');
      body_.appendChild(node('div', 'log-row__text', entry.text));
      body_.appendChild(node('div', 'log-row__day',
        Util.formatDate(Util.dateFromDay(Mandate.BALANCE.time.startDate, entry.day))));
      row.appendChild(body_);

      list.appendChild(row);
    });
    body.appendChild(list);

    var note = node('p', 'note');
    note.textContent = 'The last ' + Mandate.BALANCE.log.maxEntries +
      ' entries of your term, newest first.';
    body.appendChild(note);
  };

  Mandate.EventUI = Events;
})(window.Mandate = window.Mandate || {});
