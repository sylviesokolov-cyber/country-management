/* ============================================================================
 * src/ui/tabs.js — bottom tab bar + its sheet.
 * ----------------------------------------------------------------------------
 * The four systems behind these tabs arrive in Phases 3 and 4. The shell exists
 * now so that (a) the layout is final and never has to move, and (b) each
 * future phase is "fill in one function", not "redesign the UI".
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Tabs = {};
  var Util = Mandate.Util;
  var View = Mandate.View;

  var sheetEl, titleEl, bodyEl;
  var tabButtons = [];

  /* Placeholder copy per tab. Phase 3/4 replaces each `render` with real UI. */
  var TAB_CONTENT = {
    tech: {
      title: 'Technology & Policy',
      body: 'Four branches — Economy, Infrastructure, Governance, Security — ' +
            'bought with Political Capital and research time. Mid-tier unlocks ' +
            'change how systems interact rather than handing out flat bonuses.' +
            '<br><br>Arrives in <strong>Phase 3</strong>.',
    },
    appointees: {
      title: 'Appointees',
      body: 'Hire ministers and governors, assign them to a region or a ' +
            'ministry, pay their salary every month. Traits give real buffs; ' +
            'some come with drawbacks. Slots are limited, so every appointment ' +
            'is a trade.<br><br>Arrives in <strong>Phase 3</strong>.',
    },
    policies: {
      title: 'Policies',
      body: 'Standing national decisions — taxation, conscription, press ' +
            'freedom — each with an ongoing cost in Mandate or resources.' +
            '<br><br>Arrives in <strong>Phase 3</strong>.',
    },
    events: {
      title: 'Events',
      body: 'Timed crises and opportunities with branching choices, plus the ' +
            'running log of what your government has done.' +
            '<br><br>Arrives in <strong>Phase 4</strong>.',
    },
  };

  Tabs.build = function (handlers) {
    sheetEl = Util.el('tab-sheet');
    titleEl = Util.el('tab-title');
    bodyEl = Util.el('tab-body');

    View.onTap(Util.el('tab-close'), function () { Tabs.close(); });

    tabButtons = Array.prototype.slice.call(document.querySelectorAll('.tab'));
    tabButtons.forEach(function (btn) {
      View.onTap(btn, function () {
        var id = btn.dataset.tab;
        /* Tapping the open tab closes it — standard phone behaviour. */
        if (View.viewState.activeTab === id) {
          Tabs.close();
        } else {
          handlers.onOpen(id);
        }
      });
    });
  };

  Tabs.open = function (tabId) {
    var content = TAB_CONTENT[tabId];
    if (!content) return;

    View.viewState.activeTab = tabId;
    View.setText(titleEl, content.title);
    bodyEl.innerHTML = '<p>' + content.body + '</p>';
    View.setSheetOpen(sheetEl, true);
    syncButtons();
  };

  Tabs.close = function () {
    View.viewState.activeTab = null;
    View.setSheetOpen(sheetEl, false);
    syncButtons();
  };

  function syncButtons() {
    tabButtons.forEach(function (btn) {
      var active = btn.dataset.tab === View.viewState.activeTab;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  Mandate.Tabs = Tabs;
})(window.Mandate = window.Mandate || {});
