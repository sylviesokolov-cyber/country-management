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
    /* The leader's accent drives the crest, the card's top edge and its
     * selected state, all from one custom property. */
    btn.style.setProperty('--leader-accent', leader.accent);

    var head = node('div', 'leader__head');
    head.appendChild(crest(leader));

    var heading = node('div', 'leader__heading');
    var titleRow = node('div', 'leader__title-row');
    titleRow.appendChild(node('div', 'leader__title', leader.title));
    /* The difficulty goes at the TOP, not in the footer where it started: six
     * cards do not fit on a landscape phone, so the foot of a card is often
     * below the fold and "Punishing" is the one thing on it that should never
     * be missed. */
    titleRow.appendChild(node('span', 'leader__difficulty',
      Mandate.LEADERS.DIFFICULTY_LABELS[leader.difficulty] || ''));
    heading.appendChild(titleRow);
    heading.appendChild(node('div', 'leader__name', leader.name));
    head.appendChild(heading);
    btn.appendChild(head);

    btn.appendChild(node('p', 'leader__blurb', leader.blurb));

    var traits = node('div', 'leader__traits');
    traits.appendChild(trait('buff', 'buff', leader.buff.label));
    traits.appendChild(trait('handicap', 'handicap', leader.handicap.label));
    traits.appendChild(trait('mechanic', 'mechanic', leader.mechanic.label));
    btn.appendChild(traits);

    var foot = node('div', 'leader__foot');
    var bestEl = node('span', 'leader__best', best
      ? 'Best ' + Util.formatInt(best.score) + (best.won ? ' — term served' : '')
      : 'No term served');
    /* An empty scoreboard slot is an absence, not an achievement, so it does
     * not get the score colour. */
    if (!best) bestEl.dataset.empty = 'true';
    foot.appendChild(bestEl);
    btn.appendChild(foot);

    View.onTap(btn, function () { onPick(leader.id); });
    return btn;
  }

  /* ------------------------------------------------------------------------
   * CRESTS
   *
   * A small geometric emblem per leader, drawn here as inline SVG rather than
   * shipped as six image files. Three reasons: a seventh leader stays a pure
   * data edit (which DESIGN.md is emphatic about), they take their colour
   * from the leader's accent through `currentColor`, and six SVG paths cost
   * less than one PNG.
   *
   * They are deliberately abstract — heraldry, not portraiture. A portrait
   * would make a claim about who these people are that the writing does not,
   * and six drawn faces is six chances to look cheap.
   * ---------------------------------------------------------------------- */
  var CRESTS = {
    /* Rank chevrons. */
    chevrons: 'M12 15 L26 26 L40 15 M12 26 L26 37 L40 26',
    /* Ruled ledger columns. */
    ledger: 'M13 12 V40 M20 12 V40 M32 12 V40 M39 12 V40 M10 19 H42 M10 33 H42',
    /* A sun coming up over a line. */
    sunburst: 'M10 36 H42 M26 10 V20 M15 15 L21 21 M37 15 L31 21 M12 27 H20 M32 27 H40',
    /* A speaker's laurel, open at the top. */
    wreath: 'M26 40 C14 36 12 24 16 14 M26 40 C38 36 40 24 36 14 M20 22 H32',
    /* A truss. */
    lattice: 'M11 38 L26 13 L41 38 Z M17 29 H35 M26 13 V38',
    /* A keystone. */
    keystone: 'M17 15 H35 L40 38 H12 Z M26 15 V38',
  };

  function crest(leader) {
    var wrap = node('span', 'leader__crest');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 52 52');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'crest');

    /* The ring is common to all six, so the set reads as one house style and
     * only the mark inside it changes. */
    var ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('cx', '26');
    ring.setAttribute('cy', '26');
    ring.setAttribute('r', '23');
    ring.setAttribute('class', 'crest__ring');
    svg.appendChild(ring);

    var mark = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    mark.setAttribute('d', CRESTS[leader.crest] || CRESTS.keystone);
    mark.setAttribute('class', 'crest__mark');
    svg.appendChild(mark);

    wrap.appendChild(svg);
    return wrap;
  }

  function trait(kind, iconId, text) {
    var row = node('div', 'leader-trait');
    row.dataset.kind = kind;
    var icon = node('span', 'leader-trait__icon');
    icon.appendChild(Mandate.Icons.el(iconId));
    row.appendChild(icon);
    row.appendChild(node('span', 'leader-trait__text', text));
    return row;
  }

  Mandate.LeaderSelect = LeaderSelect;
})(window.Mandate = window.Mandate || {});
