/* ============================================================================
 * src/ui/alerts.js — the news ticker and the alert toasts.
 * ----------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 *
 * Phase 4 built a run log and put it behind a tab. That is where a log
 * belongs, but it meant the country could rise in revolt, go bankrupt and
 * lose two provinces while the player watched a map that said nothing at all.
 * Every reference game answers this the same way and it is the single most
 * copied element of the genre: Plague Inc. runs a news ticker across the top
 * of the world map all game long, and Rebel Inc. says out loud, in words,
 * that "lack of stability is critically affecting your reputation". Neither
 * makes you go and look.
 *
 * So the log gets a front page:
 *
 *   TICKER  — one line, bottom-centre, cycling the last few entries. Ambient.
 *             Never demands anything. Tapping it opens the full log.
 *   TOASTS  — the handful of things that must not be missed: a province
 *             rising, the bill about to bounce, the Mandate crossing a
 *             threshold. They stack top-centre and expire on their own.
 *
 * TWO RULES, both from the reference games.
 *
 *   1. A toast NEVER pauses the game and never takes the input. Events are
 *      the game's one interruption and they have earned it; After Inc. is
 *      widely disliked for timed tasks that seize control of the settlement,
 *      and a notification that stops the clock is the same mistake in
 *      miniature. Tapping a toast is an offer — it jumps to the region —
 *      and ignoring it costs nothing but the news.
 *   2. Good news gets the same billing as bad. A feed that only ever speaks
 *      up to scold reads as nagging, and the player stops looking at it.
 *
 * This module is pure view: it reads `state.log` and `state.derived` and
 * writes to the DOM. It never decides that something happened — the sim does
 * that, by writing a log line.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Alerts = {};
  var Util = Mandate.Util;
  var View = Mandate.View;

  var tickerEl, tickerTextEl, toastsEl;
  var onOpenLog = function () {};
  var onPickRegion = function () {};

  /* How far through `state.log` the ticker has read. Compared against the log
   * LENGTH plus the number of entries already dropped off the front, because
   * the log is capped and splices its own head off — a plain index would
   * silently skip entries on a long run. `state.stats.logWritten` is not a
   * thing, so we track the day of the last entry we showed instead, which is
   * monotonic and survives the cap. */
  var lastShownDay = -1;
  var lastShownText = null;

  /* Live toasts, so a repeat of the same alert doesn't stack up. */
  var openToasts = Object.create(null);

  /* How long a toast stays, and how many may be on screen at once. Three is
   * what fits above the map on a 390px-tall landscape phone without crowding
   * the resource chips. */
  var TOAST_MS = 7000;
  var MAX_TOASTS = 3;

  /* Thresholds we have already announced this run, so a Mandate hovering on
   * 30.01 doesn't fire the same warning sixty times a second. Reset when a
   * new run starts. */
  var announced = Object.create(null);

  /* Log kinds that are worth putting on the ticker. Everything else (a
   * research queue change, an appointment) is real history but not news, and
   * a ticker that reports everything reports nothing. */
  var TICKER_KINDS = {
    revolt: true, order: true, event: true, effect: true,
    tech: true, policy: true, system: true, win: true, lose: true,
  };

  /* The tone of each kind, for colour. Deliberately not derived from the
   * text: a line is good or bad because of what happened, not because of
   * which words the data file happened to use. */
  var TONE = {
    revolt: 'bad', lose: 'bad',
    order: 'good', tech: 'good', win: 'good',
  };

  Alerts.build = function (handlers) {
    tickerEl = Util.el('ticker');
    tickerTextEl = Util.el('ticker-text');
    toastsEl = Util.el('toasts');
    onOpenLog = handlers.onOpenLog || onOpenLog;
    onPickRegion = handlers.onPickRegion || onPickRegion;

    /* The ticker is the log's front page, so tapping it opens the log. */
    View.onTap(tickerEl, function () { onOpenLog(); });
  };

  /**
   * Called when a run starts, so one term's warnings don't carry into the
   * next. Without this, starting a new run after losing at 5 Mandate would
   * mean the "mandate is running out" warning never fired again.
   */
  Alerts.reset = function () {
    announced = Object.create(null);
    lastShownDay = -1;
    lastShownText = null;
    for (var key in openToasts) dismiss(key);
    View.setText(tickerTextEl, '');
    if (tickerEl) tickerEl.classList.remove('is-live');
  };

  Alerts.render = function (state) {
    renderTicker(state);
    renderWatches(state);
  };

  /* ------------------------------------------------------------------------
   * THE TICKER
   * ---------------------------------------------------------------------- */
  function renderTicker(state) {
    if (!tickerEl || !state.log || !state.log.length) return;

    /* The newest entry worth reporting. We show the LATEST rather than
     * queueing every one: on 2x speed a burst of four things can land in a
     * second, and a queue would still be reading out the first of them a
     * minute later, describing a country that has moved on. The full list is
     * always one tap away, which is what the log is for. */
    var latest = null;
    for (var i = state.log.length - 1; i >= 0; i--) {
      if (TICKER_KINDS[state.log[i].kind]) { latest = state.log[i]; break; }
    }
    if (!latest) return;
    if (latest.day === lastShownDay && latest.text === lastShownText) return;

    lastShownDay = latest.day;
    lastShownText = latest.text;

    tickerEl.classList.remove('ticker--good', 'ticker--bad');
    if (TONE[latest.kind]) tickerEl.classList.add('ticker--' + TONE[latest.kind]);
    tickerEl.classList.add('is-live');

    View.setText(tickerTextEl, latest.text);

    /* Restart the slide-in. Removing and re-adding a class in the same frame
     * is a no-op to the browser's animation engine, so we force a reflow
     * between the two — the one place in this project that legitimately
     * needs to. */
    tickerTextEl.classList.remove('ticker__text--in');
    void tickerTextEl.offsetWidth;
    tickerTextEl.classList.add('ticker__text--in');
  }

  /* ------------------------------------------------------------------------
   * THE WATCHES — what earns a toast.
   *
   * Each watch is a condition plus the toast it raises. They are latched:
   * a watch fires when its condition becomes true and rearms when it becomes
   * false again, so a country sitting in austerity for a year is told once,
   * not three hundred times. That latching is the whole reason this is a
   * table rather than a pile of ifs.
   * ---------------------------------------------------------------------- */
  function renderWatches(state) {
    if (state.gameOver) return;
    var B = Mandate.BALANCE;

    /* --- a province has risen ------------------------------------------ */
    /* Driven off the regions rather than the log, so the toast can carry the
     * region id and offer to take the player there. */
    for (var i = 0; i < state.regions.length; i++) {
      var region = state.regions[i];
      var key = 'revolt:' + region.id;
      if (region.inRevolt && !announced[key]) {
        announced[key] = true;
        var def = Mandate.State.regionDef(region.id) || { name: region.id };
        toast(key, 'bad', def.name + ' is in open revolt',
          'Troops or emergency relief. You cannot build here now.', region.id);
      } else if (!region.inRevolt && announced[key]) {
        announced[key] = false;
        dismiss(key);
      }
    }

    /* --- the bill is about to bounce ------------------------------------ */
    latch(state, 'austerity', state.derived.austerity, function () {
      toast('austerity', 'bad', 'The Treasury cannot cover tomorrow',
        'Unpaid bills eat development and stability until they are paid.');
    });

    /* --- the clock is running out --------------------------------------- */
    /* Two steps, not a continuous nag. The first is a heads-up while there is
     * still a term left to change; the second is the last honest warning. */
    latch(state, 'mandateWarn',
      state.mandate < B.mandate.healthyAbove && state.mandate >= B.mandate.warnBelow,
      function () {
        toast('mandateWarn', 'warn', 'Your mandate is slipping',
          'Tap the gauge to see what is spending it.');
      });

    latch(state, 'mandateLow', state.mandate < B.mandate.warnBelow, function () {
      toast('mandateLow', 'bad', 'Your mandate is nearly gone',
        'Tap the gauge to see what is spending it.');
    });
  }

  /** Fire `raise` on the rising edge of `condition`; rearm on the falling one. */
  function latch(state, key, condition, raise) {
    if (condition && !announced[key]) {
      announced[key] = true;
      raise();
    } else if (!condition && announced[key]) {
      announced[key] = false;
    }
  }

  /* ------------------------------------------------------------------------
   * TOASTS
   * ---------------------------------------------------------------------- */

  /**
   * Raise a toast. `regionId` is optional; when given, the toast is tappable
   * and takes the player there.
   *
   * Toasts expire on a timer rather than on a game condition, because the
   * game may be paused — and a notification that never goes away while the
   * player is reading the tech tree is clutter, not information.
   */
  function toast(key, tone, title, detail, regionId) {
    if (!toastsEl || openToasts[key]) return;

    var el = View.node('div', 'toast toast--' + tone);
    el.setAttribute('role', 'status');
    /* Reachable and dismissable from a keyboard, not just a pointer —
     * `View.onTap` already wires Enter/Space, but a plain `<div>` needs a
     * `tabindex` before Tab will ever land on it. */
    el.setAttribute('tabindex', '0');
    el.appendChild(View.node('div', 'toast__title', title));
    if (detail) el.appendChild(View.node('div', 'toast__detail', detail));

    if (regionId) {
      el.classList.add('toast--tappable');
      View.onTap(el, function () {
        dismiss(key);
        onPickRegion(regionId);
      });
    } else {
      View.onTap(el, function () { dismiss(key); });
    }

    toastsEl.appendChild(el);
    openToasts[key] = {
      el: el,
      timer: window.setTimeout(function () { dismiss(key); }, TOAST_MS),
    };

    /* A landscape phone is ~390px tall and the stack shares the top row with
     * the resource chips. Three provinces rising in the same week is a real
     * thing that happens — and four toasts would push the stack off the
     * screen, hiding the newest behind the oldest. Drop from the top instead:
     * the most recent news is the news. */
    trimStack();
  }

  /** Keep only the newest MAX_TOASTS on screen, oldest dropped first. */
  function trimStack() {
    var keys = Object.keys(openToasts);
    if (keys.length <= MAX_TOASTS) return;
    /* Object key order is insertion order for string keys, which is exactly
     * oldest-first here — but relying on that silently would be fragile, so
     * the DOM order is the source of truth instead. */
    var nodes = toastsEl.children;
    while (nodes.length > MAX_TOASTS) {
      var oldest = nodes[0];
      var found = null;
      for (var i = 0; i < keys.length; i++) {
        if (openToasts[keys[i]] && openToasts[keys[i]].el === oldest) found = keys[i];
      }
      if (!found) { toastsEl.removeChild(oldest); continue; }
      window.clearTimeout(openToasts[found].timer);
      delete openToasts[found];
      toastsEl.removeChild(oldest);
    }
  }

  function dismiss(key) {
    var open = openToasts[key];
    if (!open) return;
    window.clearTimeout(open.timer);
    delete openToasts[key];
    /* Let the exit transition run before the node goes. If the element is
     * already detached (a reset mid-animation) this is harmless. */
    open.el.classList.add('toast--out');
    window.setTimeout(function () {
      if (open.el.parentNode) open.el.parentNode.removeChild(open.el);
    }, 250);
  }

  Mandate.Alerts = Alerts;
})(window.Mandate = window.Mandate || {});
