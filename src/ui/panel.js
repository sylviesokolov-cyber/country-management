/* ============================================================================
 * src/ui/panel.js — the region detail panel (slides in from the right).
 * ----------------------------------------------------------------------------
 * Split into two phases, which is the pattern used everywhere in this project:
 *   open()   builds the markup for a region (rarely — only on tap)
 *   render() updates the numbers inside it (every frame, memoised)
 * Rebuilding markup per frame would kill the CSS transitions and drop taps.
 *
 * The action buttons are generated from Mandate.BALANCE.actions, so adding an
 * action is a data edit plus one branch in the sim — no UI work.
 *
 * It sits on the right edge rather than across the bottom because the game is
 * landscape: a side panel leaves most of the country visible while you act on
 * one region.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Panel = {};
  var Util = Mandate.Util;
  var View = Mandate.View;

  var panelEl, bodyEl, nameEl, terrainEl;
  var onAction = function () {};
  var statNodes = {};
  var garrisonNote = null;
  var governorNote = null;
  var revoltNote = null;
  var unrestNote = null;

  Panel.build = function (handlers) {
    panelEl = Util.el('region-panel');
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
    /* Stability is the only stat with a marker and a trend, because it is the
     * only one that moves on its own. The marker is where the region SETTLES;
     * the number is where it is today. The gap between them is the whole
     * decision the panel exists to support. */
    grid.appendChild(buildStat('stability', 'Stability',
      { bar: true, marker: true, trend: true, wide: true }));
    grid.appendChild(buildStat('development', 'Development', { bar: true }));
    grid.appendChild(buildStat('output', 'Output', {}));
    grid.appendChild(buildStat('upkeep', 'Upkeep', {}));
    bodyEl.appendChild(grid);

    /* --- the unrest clock, and the revolt it leads to --------------------
     * These sit directly under the stability bar because that is the number
     * they are about. A player who can see the bar falling but not the clock
     * filling has been told that things are bad and not that they are about
     * to become a different kind of bad. */
    revoltNote = View.node('div', 'state-note state-note--revolt');
    revoltNote.appendChild(iconSpan('revolt'));
    var revoltText = View.node('span');
    revoltText.dataset.memoKey = 'region-revolt';
    revoltNote.appendChild(revoltText);
    bodyEl.appendChild(revoltNote);

    unrestNote = View.node('div', 'state-note state-note--unrest');
    unrestNote.appendChild(iconSpan('unrest'));
    var unrestText = View.node('span');
    unrestText.dataset.memoKey = 'region-unrest';
    unrestNote.appendChild(unrestText);
    bodyEl.appendChild(unrestNote);

    /* Shown only while troops are stationed here — see Panel.render. The
     * daily cost is read from balance rather than written into the text, so
     * retuning the garrison can never leave the panel quoting an old price.
     * (The Upkeep row above already includes it; this says what it buys.) */
    garrisonNote = document.createElement('div');
    garrisonNote.className = 'garrison-note';
    garrisonNote.appendChild(iconSpan('garrison'));
    var garrisonText = document.createElement('span');
    garrisonText.textContent = 'Garrisoned: +' +
      Mandate.BALANCE.region.naturalStability.garrisonBonus +
      ' stability for ' +
      Mandate.BALANCE.region.garrison.treasuryUpkeepPerDay + ' ¤/day, ' +
      'for as long as you keep paying it.';
    garrisonNote.appendChild(garrisonText);
    bodyEl.appendChild(garrisonNote);

    /* Who governs here, if anyone. A governor's traits apply ONLY in their
     * region, so the region panel is the honest place to say so — the
     * Appointees screen can tell you who you employ, but only this can tell
     * you whether their traits are doing anything where you are looking. */
    governorNote = document.createElement('div');
    governorNote.className = 'garrison-note garrison-note--governor';
    governorNote.appendChild(iconSpan('appointees'));
    var governorText = document.createElement('span');
    governorText.dataset.memoKey = 'region-governor';
    governorNote.appendChild(governorText);
    bodyEl.appendChild(governorNote);

    /* --- action buttons, generated from the balance data --- */
    var actions = document.createElement('div');
    actions.className = 'actions';

    Object.keys(Mandate.BALANCE.actions).forEach(function (actionId) {
      actions.appendChild(buildAction(actionId));
    });
    bodyEl.appendChild(actions);

    View.invalidate();   /* the markup is new; forget memoised values */
    View.setOpen(panelEl, true);
    /* Tells the shell to inset the HUD and shrink the map (see base.css). */
    document.getElementById('app').classList.add('panel-open');
    Panel.render(state);
  };

  Panel.close = function () {
    View.viewState.selectedRegionId = null;
    View.setOpen(panelEl, false);
    document.getElementById('app').classList.remove('panel-open');
  };

  /** Per-frame refresh of the numbers in the open panel. */
  Panel.render = function (state) {
    if (!Panel.isOpen()) return;

    var region = Mandate.State.regionById(state, View.viewState.selectedRegionId);
    if (!region) return;
    var max = Mandate.BALANCE.region.max;

    setStat('stability', region.stability.toFixed(0), (region.stability / max) * 100);
    setStat('development', region.development.toFixed(0), (region.development / max) * 100);
    setStat('output', region.output.toFixed(2) + '/d', null);
    /* Via formatRate so an empty region reads "0.00/d" rather than the
     * nonsense "−0.00/d" — the exact case that helper was written for. */
    setStat('upkeep', Util.formatRate(-region.upkeep).replace('-', '\u2212') + '/d', null);

    /* The bar takes the region's band colour, the same one the map and the
     * region list use. A fixed green bar would have shown a region in crisis
     * as healthy — the panel has to tell the same story the map does. */
    setBandColour('stability', Mandate.Sim.stabilityBand(region).id);

    /* Where the region is headed, and how fast. Both come straight from the
     * sim so the panel can never disagree with what the tick will do. */
    setMarker('stability', (region.naturalStability / max) * 100);
    setTrend('stability', region.stabilityTrend, region.naturalStability);

    if (garrisonNote) garrisonNote.hidden = !region.garrisoned;

    /* --- revolt / unrest clock ------------------------------------------ */
    var V = Mandate.BALANCE.region.revolt;
    if (revoltNote) {
      revoltNote.hidden = !region.inRevolt;
      if (region.inRevolt) {
        View.setText(revoltNote.querySelector('[data-memo-key]'),
          'In open revolt. Output has collapsed and development is being ' +
          'destroyed. Order returns at ' + V.endsAbove + '% stability — ' +
          'troops or emergency relief, not a chequebook.');
      }
    }
    if (unrestNote) {
      /* Only while the clock is actually running and the revolt has not yet
       * started. A ring at zero is not news. */
      var daysLeft = Math.ceil(V.afterDays - (region.unrestDays || 0));
      var counting = !region.inRevolt && (region.unrestDays || 0) > 0;
      unrestNote.hidden = !counting;
      if (counting) {
        View.setText(unrestNote.querySelector('[data-memo-key]'),
          Mandate.Sim.isUnstable(region)
            ? 'Below the unrest line. Open revolt in about ' +
              Util.formatInt(daysLeft) + ' days if nothing changes.'
            : 'Recovering from unrest. ' + Util.formatInt(daysLeft) +
              ' days of patience banked against the next slide.');
      }
    }

    var governor = Mandate.Sim.governorOf(state, region.id);
    if (governorNote) {
      governorNote.hidden = !governor;
      if (governor) {
        View.setText(governorNote.querySelector('[data-memo-key]'),
          governor.name + ' \u2014 ' +
          Mandate.Mods.traitsOf(governor).map(function (trait) {
            return trait.label;
          }).join(', '));
      }
    }

    /* Re-check every frame: Treasury is ticking up and stability is drifting,
     * so buttons un-grey themselves the moment they become legal. Garrison
     * and Withdraw swap places rather than sitting next to each other greyed
     * out, so the panel always offers the one move that makes sense. */
    var buttons = bodyEl.querySelectorAll('.action');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var action = Mandate.BALANCE.actions[btn.dataset.actionId];
      var requiresGarrison = action.requires && typeof action.requires.garrisoned === 'boolean';
      var hidden = requiresGarrison && !!region.garrisoned !== action.requires.garrisoned;
      if (btn.hidden !== hidden) btn.hidden = hidden;
      if (hidden) continue;

      /* The price is re-read every frame, not written once when the panel was
       * built: tech and a region's governor both change what an action costs,
       * and they change it PER REGION. A button quoting a stale price would be
       * charging one number and showing another. */
      var priceEl = btn.querySelector('.action__price');
      var price = formatCost(
        Mandate.Sim.actionCost(state, btn.dataset.actionId, region.id), action.refund);
      if (priceEl.textContent !== price) priceEl.textContent = price;

      /* PATCH FATIGUE has to be visible or it is just a price that mysteriously
       * went up. The button says how much dearer this province has become for
       * this action, so "stop patching the same place" is something the player
       * can read rather than something they have to infer. */
      var fatigue = Mandate.Sim.actionFatigue(state, btn.dataset.actionId, region.id);
      btn.classList.toggle('action--fatigued', fatigue > 0.05);
      View.setText(btn.querySelector('.action__fatigue'),
        fatigue > 0.05 ? '+' + Math.round(fatigue * 100) + '% here' : '');

      var check = Mandate.Sim.canAfford(state, btn.dataset.actionId, region.id);
      var disabled = !check.ok;
      if (btn.disabled !== disabled) btn.disabled = disabled;
      View.setText(btn.querySelector('.action__reason'), check.ok ? '' : check.reason);
    }
  };

  /* --- small markup helpers ------------------------------------------- */

  function iconSpan(id) {
    var el = document.createElement('span');
    el.className = 'garrison-note__icon';
    el.appendChild(Mandate.Icons.el(id));
    return el;
  }

  function buildStat(key, label, opts) {
    var wrap = document.createElement('div');
    /* A wide stat spans the whole grid row: room for a bar, a marker and a
     * trend line without squeezing them into a third of the panel. */
    wrap.className = 'stat' + (opts.wide ? ' stat--wide' : '');

    var head = document.createElement('div');
    head.className = 'stat__head';

    var labelEl = document.createElement('div');
    labelEl.className = 'stat__label';
    labelEl.textContent = label;

    var valueEl = document.createElement('div');
    valueEl.className = 'stat__value';

    head.appendChild(labelEl);
    head.appendChild(valueEl);
    wrap.appendChild(head);

    var fillEl = null;
    var markerEl = null;
    if (opts.bar) {
      var bar = document.createElement('div');
      bar.className = 'bar';
      fillEl = document.createElement('div');
      fillEl.className = 'bar__fill bar__fill--' + key;
      bar.appendChild(fillEl);
      if (opts.marker) {
        markerEl = document.createElement('div');
        markerEl.className = 'bar__marker';
        bar.appendChild(markerEl);
      }
      wrap.appendChild(bar);
    }

    var trendEl = null;
    if (opts.trend) {
      trendEl = document.createElement('div');
      trendEl.className = 'stat__trend';
      wrap.appendChild(trendEl);
    }

    statNodes[key] = { value: valueEl, fill: fillEl, marker: markerEl, trend: trendEl };
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

  /** Recolour a bar to a stability band. */
  function setBandColour(key, bandId) {
    var node = statNodes[key];
    if (!node || !node.fill || node.fill.dataset.band === bandId) return;
    node.fill.dataset.band = bandId;
    node.fill.style.background = 'var(--c-band-' + bandId + ')';
  }

  /** Position the "settles here" tick on a bar. */
  function setMarker(key, pct) {
    var node = statNodes[key];
    if (!node || !node.marker) return;
    var left = pct.toFixed(1) + '%';
    if (node.marker.style.left !== left) node.marker.style.left = left;
  }

  /**
   * "↓ 0.02/day · settles at 31" — where the region is going, and where it
   * stops. Rounded to a whole number because the player is choosing between
   * regions, not auditing the simulation.
   */
  function setTrend(key, perDay, settlesAt) {
    var node = statNodes[key];
    if (!node || !node.trend) return;

    var arrow = perDay > 0.0005 ? '\u2191' : perDay < -0.0005 ? '\u2193' : '\u2192';
    var text = arrow + ' ' + Math.abs(perDay).toFixed(2) + '/day \u00b7 settles at ' +
      Math.round(settlesAt);
    if (node.trend.textContent !== text) node.trend.textContent = text;

    var mood = perDay > 0.0005 ? 'up' : perDay < -0.0005 ? 'down' : 'flat';
    if (node.trend.dataset.mood !== mood) node.trend.dataset.mood = mood;
  }

  function buildAction(actionId) {
    var action = Mandate.BALANCE.actions[actionId];

    var btn = document.createElement('button');
    btn.className = 'action';
    btn.dataset.actionId = actionId;
    /* The sound of a region action is decided by whether the SIM accepted it
     * — a hammer for a Public Works, a refusal buzz for one you cannot
     * afford. main.js plays it; this button stays quiet. */
    btn.dataset.sfx = 'none';

    var main = document.createElement('div');
    main.className = 'action__main';
    main.innerHTML =
      '<div class="action__label"></div><div class="action__blurb"></div>';
    /* The label line carries the action's icon, so the three region actions
     * are told apart by shape before they are read. They are the most-tapped
     * controls in the game and they used to be three identical text blocks. */
    var labelEl = main.querySelector('.action__label');
    if (action.icon && Mandate.Icons.has(action.icon)) {
      labelEl.appendChild(Mandate.Icons.el(action.icon, 'action__icon'));
    }
    labelEl.appendChild(document.createTextNode(action.label));
    main.querySelector('.action__blurb').textContent = action.blurb;

    var cost = document.createElement('div');
    cost.className = 'action__cost';
    /* Filled in by Panel.render, which knows which region is open and can
     * therefore ask the sim for the real, modified price. */
    var price = document.createElement('span');
    price.className = 'action__price';
    cost.appendChild(price);

    /* How much dearer this action has become in THIS region. Filled by
     * Panel.render; empty and invisible until the province has been leaned
     * on. See Sim.actionFatigue. */
    var fatigue = document.createElement('small');
    fatigue.className = 'action__fatigue';
    cost.appendChild(fatigue);

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

  /**
   * "60 ¤ + 6 mp", or "+3 mp" for an action that gives rather than takes.
   * An action with neither (nothing in the game yet, but the data allows it)
   * reads as "free" rather than as an empty gap.
   */
  function formatCost(cost, refund) {
    var parts = Object.keys(cost || {}).map(function (key) {
      return Util.formatInt(cost[key]) + ' ' + shortLabel(key);
    });
    if (parts.length) return parts.join(' + ');

    var refunds = Object.keys(refund || {}).map(function (key) {
      return '+' + Util.formatInt(refund[key]) + ' ' + shortLabel(key);
    });
    return refunds.length ? refunds.join(' + ') : 'free';
  }

  function shortLabel(key) {
    if (key === 'treasury') return '¤';        /* generic currency sign */
    if (key === 'manpower') return 'mp';
    if (key === 'politicalCapital') return 'pc';
    return key;
  }

  Mandate.Panel = Panel;
})(window.Mandate = window.Mandate || {});
