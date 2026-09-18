/* ============================================================================
 * src/ui/overlay.js — the full-screen management overlay.
 * ----------------------------------------------------------------------------
 * Tabs across the top, content below — the shape the reference games use for
 * their upgrade and management screens. In landscape there is no vertical room
 * for a permanent tab bar, so the whole screen becomes the menu instead, opened
 * from the "Ministry" and "Regions" buttons in the bottom corners.
 *
 * As of Phase 4 every tab is real, and each one is a single call into another
 * module (src/ui/ministry.js, src/ui/events.js). This file still knows nothing
 * about what a tech node, an appointee or an event is, which is why it has
 * stayed the same size across four phases: adding a system has never once
 * meant editing the shell.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Overlay = {};
  var Util = Mandate.Util;
  var View = Mandate.View;

  var overlayEl, bodyEl;
  var tabButtons = [];
  var handlers = {};

  /* Each tab is { title, render(state) -> fills bodyEl }. Nothing else. */
  var TABS = {
    tech: {
      title: 'Technology',
      render: function (state) { Mandate.Ministry.renderTech(bodyEl, state); },
    },
    appointees: {
      title: 'Appointees',
      render: function (state) { Mandate.Ministry.renderAppointees(bodyEl, state); },
    },
    policies: {
      title: 'Policies',
      render: function (state) { Mandate.Ministry.renderPolicies(bodyEl, state); },
    },
    /* The Events tab is the RUN LOG. Deliberately the same tab the event card
     * belongs to: "what is happening" and "what has happened" are one question
     * asked at different times, and a separate History tab is a tab nobody
     * opens. */
    events: {
      title: 'Events',
      render: function (state) { Mandate.EventUI.renderLog(bodyEl, state); },
    },
    regions: {
      title: 'Regions',
      render: function (state) {
        bodyEl.innerHTML = '';

        var heading = document.createElement('h3');
        heading.textContent = 'Regions (' + state.regions.length + ')';
        bodyEl.appendChild(heading);

        var list = document.createElement('div');
        list.className = 'region-list';

        /* Worst first: the list is a triage tool, not an index. */
        var sorted = state.regions.slice().sort(function (a, b) {
          return a.stability - b.stability;
        });

        sorted.forEach(function (region) {
          var def = Mandate.State.regionDef(region.id) || { name: region.id };
          var band = Mandate.Sim.stabilityBand(region);

          var row = document.createElement('button');
          row.className = 'region-row';

          var swatch = document.createElement('span');
          swatch.className = 'region-row__swatch';
          /* Reuse the exact map band colour so list and map always agree. */
          swatch.style.setProperty('--region-fill', 'var(--c-band-' + band.id + ')');

          var name = document.createElement('span');
          name.className = 'region-row__name';
          name.textContent = def.name;

          /* A garrison is the thing you most need to remember you are paying
           * for, so it gets a marker in the list as well as on the map. */
          if (region.garrisoned) {
            var garrison = document.createElement('span');
            garrison.className = 'region-row__garrison';
            garrison.setAttribute('aria-hidden', 'true');
            garrison.textContent = '\u25cf';
            name.appendChild(garrison);
          }

          /* The arrow is where the region is HEADED. Worst-first sorting
           * answers "what is bad now"; the arrow answers "what is about to
           * be", which is the question that actually costs you Mandate. */
          var trend = document.createElement('span');
          trend.className = 'region-row__trend';
          trend.dataset.mood = region.stabilityTrend > 0.0005 ? 'up'
            : region.stabilityTrend < -0.0005 ? 'down' : 'flat';
          trend.textContent = region.stabilityTrend > 0.0005 ? '\u2191'
            : region.stabilityTrend < -0.0005 ? '\u2193' : '\u2192';

          var nums = document.createElement('span');
          nums.className = 'region-row__nums';
          nums.textContent = Math.round(region.stability) + ' / ' +
            Math.round(region.development);

          row.appendChild(swatch);
          row.appendChild(name);
          row.appendChild(trend);
          row.appendChild(nums);
          row.setAttribute('aria-label',
            def.name + ', ' + band.label +
            (region.garrisoned ? ', garrisoned' : '') +
            ', settling at ' + Math.round(region.naturalStability) +
            ', development ' + Math.round(region.development));

          /* Tapping a row selects that region and gets out of the way. */
          View.onTap(row, function () { handlers.onPickRegion(region.id); });

          list.appendChild(row);
        });

        bodyEl.appendChild(list);

        var legend = document.createElement('p');
        legend.className = 'note';
        legend.innerHTML = 'Sorted worst first. Numbers are ' +
          '<strong>stability / development</strong>; the arrow is which way ' +
          'stability is drifting. A dot marks a garrison. Tap a region to ' +
          'open it.';
        bodyEl.appendChild(legend);
      },
    },
    /* The late game. Six national projects, one at a time — see the header
     * of data/projects.js for why this tab exists at all. */
    projects: {
      title: 'Projects',
      render: function (state) { Mandate.Ministry.renderProjects(bodyEl, state); },
    },
    /* Sound, and the two run controls. The only tab with a live INPUT in it,
     * which is why it carries `update` instead of being rebuilt on the day
     * tick like the others — see the note on Overlay.render. */
    settings: {
      title: 'Settings',
      render: function (state) { Mandate.SettingsUI.render(bodyEl, state); },
      update: function (state) { Mandate.SettingsUI.update(state); },
      leave: function () { Mandate.SettingsUI.leave(); },
    },
  };

  Overlay.build = function (opts) {
    handlers = opts;
    overlayEl = Util.el('overlay');
    bodyEl = Util.el('overlay-body');

    View.onTap(Util.el('overlay-close'), function () { Overlay.close(); });

    tabButtons = Array.prototype.slice.call(document.querySelectorAll('.overlay__tab'));
    tabButtons.forEach(function (btn) {
      View.onTap(btn, function () { Overlay.open(btn.dataset.tab); });
    });
  };

  Overlay.isOpen = function () {
    return View.viewState.activeTab !== null;
  };

  Overlay.open = function (tabId) {
    var tab = TABS[tabId];
    if (!tab) return;

    leaveCurrent();
    View.viewState.activeTab = tabId;
    bodyEl.scrollTop = 0;   /* a freshly opened tab starts at the top */
    tab.render(handlers.getState());
    View.setOpen(overlayEl, true);
    syncButtons();
  };

  /** Rebuild the open tab right now — after an action changed what it shows. */
  Overlay.refresh = function (state) {
    if (!View.viewState.activeTab) return;
    rebuild(TABS[View.viewState.activeTab], state);
  };

  /**
   * Rebuilding replaces every element in the body, which would throw the
   * player back to the top of a long list mid-scroll. Tech in particular is
   * taller than a landscape phone, so the scroll position has to survive the
   * rebuild or the tab is unusable while the clock is running.
   */
  function rebuild(tab, state) {
    if (!tab) return;
    var scroll = bodyEl.scrollTop;
    tab.render(state);
    bodyEl.scrollTop = scroll;
  }

  Overlay.close = function () {
    leaveCurrent();
    View.viewState.activeTab = null;
    View.setOpen(overlayEl, false);
    syncButtons();
  };

  /**
   * Per-frame refresh. Only the Regions tab shows live numbers, and rebuilding
   * a 16-row list every frame would be wasteful, so it is rebuilt on a slow
   * cadence instead — often enough to feel live, rarely enough to be free.
   */
  var lastRenderedDay = -1;
  var lastRenderedTab = null;
  Overlay.render = function (state) {
    var tabId = View.viewState.activeTab;
    if (!tabId) return;
    var tab = TABS[tabId];

    /* A tab that owns live controls updates its own values in place. Throwing
     * away a <input type="range"> and building a new one once a second would
     * take the slider out from under the player's thumb mid-drag. */
    if (tab && tab.update) { tab.update(state); return; }

    if (state.day === lastRenderedDay && tabId === lastRenderedTab) return;
    lastRenderedDay = state.day;
    lastRenderedTab = tabId;
    rebuild(tab, state);
  };

  /** Tell the tab we are leaving it, if it cares (the Settings tab disarms
   *  its "resign" confirmation this way). */
  function leaveCurrent() {
    var tab = TABS[View.viewState.activeTab];
    if (tab && tab.leave) tab.leave();
  }

  function syncButtons() {
    tabButtons.forEach(function (btn) {
      var active = btn.dataset.tab === View.viewState.activeTab;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  Mandate.Overlay = Overlay;
})(window.Mandate = window.Mandate || {});
