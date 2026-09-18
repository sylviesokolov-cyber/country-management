/* ============================================================================
 * src/ui/view.js — shared view plumbing.
 * ----------------------------------------------------------------------------
 * The view layer only ever does two things:
 *   READ  the game state  ->  write to the DOM
 *   TAKE  a player tap    ->  call into Mandate.Sim
 * It never edits state.* directly. Keeping that rule makes every rule of the
 * game findable in src/sim.js.
 *
 * `viewState` below is the exception that proves the rule: which region is
 * open and which tab is showing are CAMERA facts, not WORLD facts, so they
 * live here and are never saved.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var View = {};

  View.viewState = {
    selectedRegionId: null,
    activeTab: null,
  };

  /* ------------------------------------------------------------------------
   * setText: write to the DOM only when the value actually changed.
   *
   * The render loop runs at 60fps but the numbers change a few times a second.
   * Assigning textContent every frame would make the browser recalculate
   * layout 60 times a second for nothing. This memo keeps rendering cheap
   * enough that "just re-render everything from state" stays viable — which is
   * what lets the UI stay dumb.
   * ---------------------------------------------------------------------- */
  var lastWritten = Object.create(null);

  View.setText = function (el, value) {
    if (!el) return;
    var key = el.id || (el.dataset && el.dataset.memoKey);
    if (key && lastWritten[key] === value) return;
    if (key) lastWritten[key] = value;
    el.textContent = value;
  };

  View.setStyle = function (el, prop, value) {
    if (!el) return;
    var key = (el.id || '') + ':' + prop;
    if (lastWritten[key] === value) return;
    lastWritten[key] = value;
    el.style.setProperty(prop, value);
  };

  /** Forget all memoised values — call after rebuilding markup. */
  View.invalidate = function () {
    lastWritten = Object.create(null);
  };

  /* ------------------------------------------------------------------------
   * onTap: confirm on release, not on touchdown — but never wait for `click`.
   *
   * On touch devices `click` fires only after the browser has decided the
   * gesture wasn't a scroll, a drag or a double-tap-zoom — historically ~300ms,
   * still noticeably laggy today. `pointerup` carries none of that delay: it
   * is a raw pointer event, so it is still effectively instant.
   *
   * This USED to fire on `pointerdown` instead, which was a real bug rather
   * than an optimisation: any tappable row inside a `.scrollable` list (the
   * region list, the run log, the tech tree, an appointee card) fired its tap
   * the instant a finger landed on it, before a drag could move the list at
   * all — so touching a row to scroll past it always opened it instead. A
   * tap now only confirms if the pointer comes up within `TAP_SLOP` pixels of
   * where it went down; anything that moves further is a scroll or a drag and
   * is silently let go, exactly like a native app's touch handling.
   *
   * The cost is keyboard accessibility (no keyboard fires pointer events), so
   * we add Enter/Space handling explicitly.
   * ---------------------------------------------------------------------- */
  var TAP_SLOP = 10;   /* px of pointer travel still forgiven as a shaky tap */

  View.onTap = function (el, handler) {
    if (!el) return;

    /* Per-element, not module-level: two controls can be mid-gesture at once
     * (two fingers on a phone), and each needs its own start point and its
     * own "has this already left tap range" flag. */
    var tracking = false;
    var startX = 0;
    var startY = 0;

    el.addEventListener('pointerdown', function (event) {
      /* Ignore right-click / middle-click when played in a desktop browser. */
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      tracking = true;
      startX = event.clientX;
      startY = event.clientY;
    });

    /* Touch pointers implicitly stay targeted at the element they started on
     * even once the finger has moved off it — the same retargeting legacy
     * touch events always did — so this keeps receiving move/up/cancel for
     * the whole gesture without needing explicit pointer capture. */
    el.addEventListener('pointermove', function (event) {
      if (!tracking) return;
      var dx = event.clientX - startX;
      var dy = event.clientY - startY;
      /* Once a gesture leaves tap range it stays a scroll for the rest of
       * it — a finger that wanders back over the start point mid-scroll must
       * not suddenly re-arm the tap. */
      if (dx * dx + dy * dy > TAP_SLOP * TAP_SLOP) tracking = false;
    });

    el.addEventListener('pointerup', function (event) {
      if (!tracking) return;
      tracking = false;
      cue(el);
      handler(event);
    });

    el.addEventListener('pointercancel', function () { tracking = false; });

    el.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        cue(el);
        handler(event);
      }
    });
  };

  /**
   * Every tappable thing makes a sound, from here, once — so no call site has
   * to remember to. A control opts out or opts up with `data-sfx`:
   *
   *   (nothing)        the generic interface tick
   *   data-sfx="open"  a named cue from src/audio.js instead
   *   data-sfx="none"  silence, because the CALLER will decide
   *
   * The last one is what the region action buttons use: whether a tap was an
   * Invest or a refusal is the simulation's answer, not the button's, and a
   * confirmation tick underneath a "you cannot afford that" buzz would be the
   * interface disagreeing with itself.
   */
  function cue(el) {
    var name = (el.dataset && el.dataset.sfx) || 'tap';
    if (name === 'none') return;
    if (Mandate.Audio) Mandate.Audio.sfx(name);
  }

  /* ------------------------------------------------------------------------
   * node: the smallest possible createElement wrapper.
   *
   * The Phase 3 screens build a few hundred elements between them, and
   * `document.createElement` + two assignments three times per row buries the
   * structure in boilerplate. innerHTML would be shorter still, but appointee
   * names come out of a generator and region names out of a data file, so
   * anything built by string concatenation is one bad data edit away from
   * injecting markup. textContent is never that.
   * ---------------------------------------------------------------------- */
  View.node = function (tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  };

  /** Open/close a panel or overlay, keeping ARIA in step with the class. */
  View.setOpen = function (el, open) {
    if (!el) return;
    el.classList.toggle('is-open', open);
    el.setAttribute('aria-hidden', open ? 'false' : 'true');
  };

  Mandate.View = View;
})(window.Mandate = window.Mandate || {});
