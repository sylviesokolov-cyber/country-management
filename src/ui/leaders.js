/* ============================================================================
 * src/ui/leaders.js — the leader selection screen.
 * ----------------------------------------------------------------------------
 * The first thing a new run shows, and the last thing a finished one offers.
 *
 * It is built entirely from data/leaders.js — this file has no idea how many
 * leaders exist, what they do, or which is hardest. Adding a seventh leader is
 * adding an object to the data file; nothing here changes. That is the same
 * rule the region panel follows for actions and the tech tab follows for
 * nodes, and it is why DESIGN.md §2.5 insists leaders stay data-driven.
 *
 * Each card shows all three payloads separately — buff, handicap, mechanic —
 * because they are three different KINDS of thing and folding them into one
 * list would lose that. The mechanic is the one worth reading, so it is last
 * and it is the one with its own accent.
 *
 * Best scores live outside the save (State.loadBestScores) and appear on the
 * card, which is what makes the selection screen a scoreboard as well as a
 * choice: "Punishing, best 14,656" is a much better invitation than
 * "Punishing".
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var LeaderSelect = {};
  var Util = Mandate.Util;
  var View = Mandate.View;
  var node = null;

  var veilEl, gridEl;
  var onPick = function () {};

  LeaderSelect.build = function (opts) {
    node = View.node;
    onPick = opts.onPick;
    veilEl = Util.el('leader-veil');
    gridEl = Util.el('leader-grid');
  };

  LeaderSelect.isOpen = function () {
    return veilEl && veilEl.classList.contains('is-open');
  };

  /** Draw the screen fresh — best scores may have changed since last time. */
  LeaderSelect.open = function () {
    var best = Mandate.State.loadBestScores();
    gridEl.innerHTML = '';
    Mandate.LEADERS.forEach(function (leader) {
      gridEl.appendChild(card(leader, best[leader.id]));
    });
    veilEl.classList.add('is-open');
    veilEl.setAttribute('aria-hidden', 'false');
  };

  LeaderSelect.close = function () {
    veilEl.classList.remove('is-open');
    veilEl.setAttribute('aria-hidden', 'true');
  };

  function card(leader, best) {
    var btn = node('button', 'leader');
    btn.dataset.difficulty = String(leader.difficulty);

    var head = node('div', 'leader__head');
    var titleRow = node('div', 'leader__title-row');
    titleRow.appendChild(node('div', 'leader__title', leader.title));
    /* The difficulty goes at the TOP, not in the footer where it started: six
     * cards do not fit on a landscape phone, so the foot of a card is often
     * below the fold and "Punishing" is the one thing on it that should never
     * be missed. */
    titleRow.appendChild(node('span', 'leader__difficulty',
      Mandate.LEADERS.DIFFICULTY_LABELS[leader.difficulty] || ''));
    head.appendChild(titleRow);
    head.appendChild(node('div', 'leader__name', leader.name));
    btn.appendChild(head);

    btn.appendChild(node('p', 'leader__blurb', leader.blurb));

    var traits = node('div', 'leader__traits');
    traits.appendChild(trait('buff', '▲', leader.buff.label));
    traits.appendChild(trait('handicap', '▼', leader.handicap.label));
    traits.appendChild(trait('mechanic', '✦', leader.mechanic.label));
    btn.appendChild(traits);

    var foot = node('div', 'leader__foot');
    var bestEl = node('span', 'leader__best', best
      ? 'Best ' + Util.formatInt(best.score) + (best.won ? ' ★' : '')
      : 'No term served');
    /* An empty scoreboard slot is an absence, not an achievement, so it does
     * not get the score colour. */
    if (!best) bestEl.dataset.empty = 'true';
    foot.appendChild(bestEl);
    btn.appendChild(foot);

    View.onTap(btn, function () { onPick(leader.id); });
    return btn;
  }

  function trait(kind, glyph, text) {
    var row = node('div', 'leader-trait');
    row.dataset.kind = kind;
    var icon = node('span', 'leader-trait__icon', glyph);
    icon.setAttribute('aria-hidden', 'true');
    row.appendChild(icon);
    row.appendChild(node('span', 'leader-trait__text', text));
    return row;
  }

  Mandate.LeaderSelect = LeaderSelect;
})(window.Mandate = window.Mandate || {});
