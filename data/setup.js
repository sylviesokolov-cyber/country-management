/* ============================================================================
 * data/setup.js — the two choices made BEFORE a leader is picked.
 * ----------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 *
 * Every run of Mandate was, until now, exactly the same length against exactly
 * the same clock. Six leaders varied the START of a run and events varied its
 * MIDDLE, but nothing let a player say "this one is too hard for me" or "I
 * have twenty minutes, not an hour" — and those are the two things a player
 * asks of a strategy game before anything else. Civ has shipped both since
 * 1991 (eight difficulty levels and four game speeds, both pure data).
 *
 * BOTH OPTIONS ARE ORDINARY MODIFIER PAYLOADS. That is the whole design.
 * A difficulty is not a branch in the simulation, it is the same `mods` object
 * a tech node or a leader declares, merged by src/modifiers.js into the one
 * table the sim reads by key. So there is no `if (difficulty === 'hard')`
 * anywhere in `src/`, exactly as there is no `if (leader === ...)`, and a
 * fourth difficulty is an object in this file.
 *
 * TWO RULES THIS FILE MUST NOT BREAK
 *
 *   1. `standard` + `full` is the game as it was balanced. Both carry EMPTY
 *      payloads, deliberately — every number in BALANCE.md was measured
 *      against them, and a "baseline" that quietly multiplied something by
 *      1.0 would invite someone to make it 1.02 later and invalidate the lot.
 *
 *   2. **A term can never be waited out.** DESIGN.md §2.8: the term sits
 *      above what baseline Mandate decay alone allows, so the only way to
 *      reach the end is to govern well enough that approval buys back the
 *      difference. A shorter term is therefore NOT simply a smaller number of
 *      days — it comes with faster decay, because a half-length term at the
 *      standard drain rate could be survived by a player who did nothing at
 *      all, which is the one failure state the whole design exists to
 *      prevent. `Setup.audit()` at the bottom checks this arithmetic, and the
 *      harness calls it.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Setup = {};

  /* ------------------------------------------------------------------------
   * DIFFICULTY
   *
   * Six knobs, all of them modifier keys that already existed. In rough order
   * of how much they matter:
   *
   *   mandateDecay.mult     the clock itself — the single biggest lever
   *   output.mult           how much the country earns
   *   pc.perDay.mult        how fast consent accrues
   *   research.mult         how far down the tree one term reaches
   *   natural.base          where an untended region settles
   *   neighbourUnrest.mult  how fast one crisis becomes three
   *
   * They are deliberately spread thin rather than concentrated in the clock:
   * a difficulty that only moved `mandateDecay.mult` would change how long
   * you live without changing a single decision you make while alive.
   * ---------------------------------------------------------------------- */
  Setup.DIFFICULTIES = [
    {
      id: 'steady',
      label: 'Steady',
      blurb: 'A country that wants to be governed.',
      detail: 'Slower clock, richer provinces, unrest that stays where it starts.',
      mods: {
        /* STEADY DOES NOT TOUCH THE CLOCK, and that is the whole lesson of
         * this file. It started at 0.82, which let a do-nothing player win a
         * full term outright; 0.95 fixed that but left only SEVEN days of
         * margin once it compounded with the short term's own multiplier
         * (0.03 x 0.95 x 1.93 empties the meter on day 1,818 of an 1,825-day
         * term). Both were caught by Setup.audit() rather than by a playtest.
         *
         * So an easier game makes the COUNTRY better, never the clock kinder:
         * richer provinces, faster consent, faster research, a higher floor
         * for a neglected region and unrest that travels less. The relief
         * still reaches the clock — a better-governed country earns more
         * approval, and approval is what slows the drain — but it has to be
         * earned through the simulation rather than handed over in advance.
         * That also keeps rule 2 true for free at every term length. */
        'output.mult': 1.12,
        'pc.perDay.mult': 1.15,
        'research.mult': 1.15,
        'natural.base': 3,
        'neighbourUnrest.mult': 0.8,
      },
    },
    {
      /* The baseline. EMPTY BY DESIGN — see rule 1 in the header. */
      id: 'standard',
      label: 'Standard',
      blurb: 'The country as it was left to you.',
      detail: 'Every number in the balance log was measured here.',
      mods: {},
    },
    {
      id: 'hard',
      label: 'Hard',
      blurb: 'A country that has stopped believing in governments.',
      detail: 'Faster clock, poorer provinces, and a crisis that travels.',
      mods: {
        'mandateDecay.mult': 1.06,
        'output.mult': 0.97,
        'pc.perDay.mult': 0.95,
        'research.mult': 0.97,
        'natural.base': -1.5,
        'neighbourUnrest.mult': 1.08,
      },
    },
  ];

  /* ------------------------------------------------------------------------
   * TERM LENGTH
   *
   * `days` is the win condition; the payload is what keeps it honest.
   *
   * A short term is NOT the same run compressed — that is what the 2x speed
   * button already does, and shipping a second way to do it would be a
   * setting that changes nothing. Per-day rates are untouched here, so a
   * five-year government earns, researches and builds at the same speed as a
   * ten-year one and simply gets half as far. It is a sprint: you cannot
   * reach the bottom of the tech tree, so you have to pick a branch and
   * commit to it.
   *
   * What the payload does is hold rule 2. Baseline decay is 0.03/day, which
   * empties a full meter in ~3,300 days — so an 1,825-day term at the
   * standard rate could be won by a player who never touched the screen.
   * `short` therefore runs the clock at 2.05x, which puts idle survival at
   * ~1,626 days against an 1,825-day term: the same "just out of reach" gap
   * the full term has.
   *
   * 2.05 rather than 2.0 because these multipliers COMPOUND with the
   * difficulty's. Steady already spends most of its allowance on the clock
   * (0.95), and 0.95 x 2.0 leaves only a seven-day margin on a short term —
   * near enough to waitable that a single quiet event would close it.
   * ---------------------------------------------------------------------- */
  Setup.TERMS = [
    {
      id: 'short',
      label: 'Short term',
      blurb: 'Five years. About half an hour.',
      detail: 'The same country at the same speed — you simply get half as ' +
              'far. Pick a branch and commit to it.',
      days: 1825,
      mods: { 'mandateDecay.mult': 1.93 },
    },
    {
      /* The baseline. EMPTY BY DESIGN — see rule 1 in the header. */
      id: 'full',
      label: 'Full term',
      blurb: 'Ten years. About an hour.',
      detail: 'The full arc: a tech tree you can finish and a late game ' +
              'with national projects in it.',
      days: 3650,
      mods: {},
    },
  ];

  /* ------------------------------------------------------------------------
   * LOOKUP
   *
   * Both fall back to the baseline rather than returning undefined. A save
   * naming a difficulty that no longer exists is a data edit, not a corrupt
   * save, and dropping the player back to the leader screen over it would be
   * a worse answer than quietly playing the standard game.
   * ---------------------------------------------------------------------- */
  function finder(list, fallbackId) {
    return function (id) {
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      for (var j = 0; j < list.length; j++) if (list[j].id === fallbackId) return list[j];
      return list[0];
    };
  }

  Setup.difficulty = finder(Setup.DIFFICULTIES, 'standard');
  Setup.term = finder(Setup.TERMS, 'full');

  Setup.DEFAULT = { difficultyId: 'standard', termId: 'full' };

  /** The two payloads a run's setup contributes to the modifier table. */
  Setup.payloads = function (setup) {
    var s = setup || Setup.DEFAULT;
    return [Setup.difficulty(s.difficultyId), Setup.term(s.termId)];
  };

  /** How many days this run's term lasts. The win condition, in one place. */
  Setup.termDays = function (setup) {
    return Setup.term((setup || Setup.DEFAULT).termId).days;
  };

  /**
   * A stable key for the best-score table.
   *
   * Scores from a short Steady run and a full Hard one are not the same
   * quantity and must never share a slot, or the leader screen reports a
   * personal best that was set under rules the player is not currently
   * playing. The baseline setup keeps the bare leader id so that best scores
   * recorded before this file existed are still found.
   */
  Setup.scoreKey = function (leaderId, setup) {
    var s = setup || Setup.DEFAULT;
    if (s.difficultyId === 'standard' && s.termId === 'full') return leaderId;
    return leaderId + '|' + s.difficultyId + '|' + s.termId;
  };

  /* ------------------------------------------------------------------------
   * AUDIT — the never-waitable-term invariant, as arithmetic.
   *
   * For every difficulty x term pair, work out how long a player who does
   * absolutely nothing survives on baseline decay alone, and check the term
   * outlasts them. Returns a list of problems; empty means the ladder is
   * sound. The harness calls this, so a bad number is caught by a command
   * rather than by a player who won a term by putting the phone down.
   *
   * Only the BASELINE drain is modelled here, which is the same simplification
   * DESIGN.md §2.8 makes: unrest, revolts and actions all drain faster, so a
   * term that survives this check survives the real game by more.
   * ---------------------------------------------------------------------- */
  Setup.audit = function () {
    var B = Mandate.BALANCE;
    var problems = [];

    Setup.DIFFICULTIES.forEach(function (difficulty) {
      Setup.TERMS.forEach(function (term) {
        var decay = B.mandate.decayPerDay *
          (difficulty.mods['mandateDecay.mult'] || 1) *
          (term.mods['mandateDecay.mult'] || 1);
        var idleDays = B.mandate.start / decay;
        if (idleDays >= term.days) {
          problems.push(
            difficulty.id + ' + ' + term.id + ': idling survives ' +
            Math.round(idleDays) + ' days of a ' + term.days + '-day term'
          );
        }
      });
    });

    return problems;
  };

  Mandate.SETUP = Setup;
})(window.Mandate = window.Mandate || {});
