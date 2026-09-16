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
      handler(event);
    });

    el.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handler(event);
      }
    });
  };

  /** Open/close a bottom sheet, keeping the ARIA state in step with the class. */
  View.setSheetOpen = function (sheetEl, open) {
    if (!sheetEl) return;
    sheetEl.classList.toggle('is-open', open);
    sheetEl.setAttribute('aria-hidden', open ? 'false' : 'true');
  };

  Mandate.View = View;
})(window.Mandate = window.Mandate || {});
