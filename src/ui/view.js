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
   * onTap: use `pointerdown`, not `click`.
   *
   * On touch devices `click` fires only after the browser has decided the
   * gesture wasn't a scroll, a drag or a double-tap-zoom — historically ~300ms,
   * still noticeably laggy today. `pointerdown` fires the instant the finger
   * lands, which is what makes a game feel responsive rather than sluggish.
   *
   * The cost is keyboard accessibility (no keyboard fires pointer events), so
   * we add Enter/Space handling explicitly.
   * ---------------------------------------------------------------------- */
  View.onTap = function (el, handler) {
    if (!el) return;

    el.addEventListener('pointerdown', function (event) {
      /* Ignore right-click / middle-click when played in a desktop browser. */
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      cue(el);
      handler(event);
    });

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
