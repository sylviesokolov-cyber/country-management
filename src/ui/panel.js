/* ============================================================================
 * src/ui/panel.js — the region detail sheet.
 * ----------------------------------------------------------------------------
 * Split into two phases, which is the pattern used everywhere in this project:
 *   open()   builds the markup for a region (rarely — only on tap)
 *   render() updates the numbers inside it (every frame, memoised)
 * Rebuilding markup per frame would kill the CSS transitions and drop taps.
 *
 * The action buttons are generated from Mandate.BALANCE.actions, so adding an
 * action is a data edit plus one branch in the sim — no UI work.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Panel = {};
  var Util = Mandate.Util;
  var View = Mandate.View;

  var sheetEl, bodyEl, nameEl, terrainEl;
  var onAction = function () {};
  var statNodes = {};

  Panel.build = function (handlers) {
    sheetEl = Util.el('region-sheet');
    bodyEl = Util.el('region-body');
    nameEl = Util.el('region-name');
    terrainEl = Util.el('region-terrain');
    onAction = handlers.onAction;

    View.onTap(Util.el('region-close'), function () { Panel.close(); });
  };

  Panel.isOpen = function () {
    return View.viewState.selectedRegionId !== null;
  };

  Panel.open = function (state, regionId) {
    View.viewState.selectedRegionId = regionId;

    var def = Mandate.State.regionDef(regionId);
    var region = Mandate.State.regionById(state, regionId);
    if (!def || !region) return;

    View.setText(nameEl, def.name);
    View.setText(terrainEl, def.terrain + (def.capital ? ' · capital' : ''));

    /* --- stats block --- */
    bodyEl.innerHTML = '';
    statNodes = {};

    var grid = document.createElement('div');
    grid.className = 'stat-grid';
    grid.appendChild(buildStat('stability', 'Stability', true));
    grid.appendChild(buildStat('development', 'Development', true));
    grid.appendChild(buildStat('output', 'Output', false));
    bodyEl.appendChild(grid);

    /* --- action buttons, generated from the balance data --- */
    var actions = document.createElement('div');
    actions.className = 'actions';

    Object.keys(Mandate.BALANCE.actions).forEach(function (actionId) {
      actions.appendChild(buildAction(actionId));
    });
    bodyEl.appendChild(actions);

    var note = document.createElement('div');
    note.className = 'note';
    note.innerHTML = '<strong>Phase 1 build.</strong> Regions do not yet drift ' +
      'on their own, and Political Capital and Manpower are not simulated. ' +
      'Phase 2 adds region simulation, the full economy and the game-over rule.';
    bodyEl.appendChild(note);

    View.invalidate();   /* the markup is new; forget memoised values */
    View.setSheetOpen(sheetEl, true);
    Panel.render(state);
  };

  Panel.close = function () {
    View.viewState.selectedRegionId = null;
    View.setSheetOpen(sheetEl, false);
  };

  /** Per-frame refresh of the numbers in the open panel. */
  Panel.render = function (state) {
    if (!Panel.isOpen()) return;

    var region = Mandate.State.regionById(state, View.viewState.selectedRegionId);
    if (!region) return;
    var max = Mandate.BALANCE.region.max;

    setStat('stability', region.stability.toFixed(0), (region.stability / max) * 100);
    setStat('development', region.development.toFixed(0), (region.development / max) * 100);
    setStat('output', region.output.toFixed(2), null);

    /* Re-check affordability every frame: treasury is ticking up, so buttons
     * un-grey themselves the moment the player can afford them. */
    var buttons = bodyEl.querySelectorAll('.action');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var check = Mandate.Sim.canAfford(state, btn.dataset.actionId);
      var disabled = !check.ok;
      if (btn.disabled !== disabled) btn.disabled = disabled;
      var reasonEl = btn.querySelector('.action__reason');
      View.setText(reasonEl, check.ok ? '' : check.reason);
    }
  };

  /* --- small markup helpers ------------------------------------------- */

  function buildStat(key, label, withBar) {
    var wrap = document.createElement('div');
    wrap.className = 'stat';

    var labelEl = document.createElement('div');
    labelEl.className = 'stat__label';
    labelEl.textContent = label;

    var valueEl = document.createElement('div');
    valueEl.className = 'stat__value';

    wrap.appendChild(labelEl);
    wrap.appendChild(valueEl);

    var fillEl = null;
    if (withBar) {
      var bar = document.createElement('div');
      bar.className = 'bar';
      fillEl = document.createElement('div');
      fillEl.className = 'bar__fill bar__fill--' + key;
      bar.appendChild(fillEl);
      wrap.appendChild(bar);
    }

    statNodes[key] = { value: valueEl, fill: fillEl };
    return wrap;
  }

  function setStat(key, text, pct) {
    var node = statNodes[key];
    if (!node) return;
    if (node.value.textContent !== text) node.value.textContent = text;
    if (node.fill && pct !== null) {
      var width = pct.toFixed(1) + '%';
      if (node.fill.style.width !== width) node.fill.style.width = width;
    }
  }

  function buildAction(actionId) {
    var action = Mandate.BALANCE.actions[actionId];

    var btn = document.createElement('button');
    btn.className = 'action';
    btn.dataset.actionId = actionId;

    var main = document.createElement('div');
    main.className = 'action__main';
    main.innerHTML =
      '<div class="action__label"></div><div class="action__blurb"></div>';
    main.querySelector('.action__label').textContent = action.label;
    main.querySelector('.action__blurb').textContent = action.blurb;

    var cost = document.createElement('div');
    cost.className = 'action__cost';
    cost.textContent = formatCost(action.cost);

    var reason = document.createElement('small');
    reason.className = 'action__reason';
    if (action.mandateCost) {
      var m = document.createElement('small');
      m.textContent = '−' + action.mandateCost + ' mandate';
      cost.appendChild(m);
    }
    cost.appendChild(reason);

    btn.appendChild(main);
    btn.appendChild(cost);

    View.onTap(btn, function () {
      if (btn.disabled) return;
      onAction(View.viewState.selectedRegionId, actionId);
    });

    return btn;
  }

  function formatCost(cost) {
    return Object.keys(cost).map(function (key) {
      return Util.formatInt(cost[key]) + ' ' + shortLabel(key);
    }).join(' + ');
  }

  function shortLabel(key) {
    if (key === 'treasury') return '¤';        /* generic currency sign */
    if (key === 'manpower') return 'mp';
    if (key === 'politicalCapital') return 'pc';
    return key;
  }

  Mandate.Panel = Panel;
})(window.Mandate = window.Mandate || {});
