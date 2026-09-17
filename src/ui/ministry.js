/* ============================================================================
 * src/ui/ministry.js — the three Phase 3 screens: Tech, Appointees, Policies.
 * ----------------------------------------------------------------------------
 * These live here rather than in src/ui/overlay.js because overlay.js is the
 * SHELL — tabs, open/close, the render cadence — and it stayed small and
 * readable for two phases by never learning what is inside a tab. It still
 * doesn't: it calls one function per tab and this file draws it.
 *
 * Every screen follows the same two rules as the rest of the view layer:
 *
 *   1. It renders from state and nothing else. There is no local copy of what
 *      is researched or who is hired.
 *   2. It never decides whether something is allowed. Each button asks the sim
 *      (Sim.canQueueTech, Sim.canHire, Sim.canEnactPolicy), which returns both
 *      the verdict and the reason, so a greyed-out button and a refused action
 *      can never disagree — they are the same call.
 *
 * These tabs are rebuilt whenever the day changes (see Overlay.render), which
 * is about once a second at 1x. That is cheap enough at this size and means
 * affordability, research progress and cooldowns are simply always current
 * instead of needing a change-notification scheme.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Ministry = {};
  var Util = Mandate.Util;
  var View = Mandate.View;
  var node = null;   /* View.node, bound in build() */
  var handlers = {};

  Ministry.build = function (opts) {
    handlers = opts;
    node = View.node;
  };

  /* ========================================================================
   * TECH
   * ====================================================================== */

  Ministry.renderTech = function (body, state) {
    body.innerHTML = '';
    body.appendChild(researchStatus(state));

    var grid = node('div', 'branch-grid');
    Mandate.TECH.branches.forEach(function (branch) {
      grid.appendChild(branchColumn(state, branch));
    });
    body.appendChild(grid);

    var note = node('p', 'note');
    note.innerHTML = 'A node costs <strong>Political Capital</strong> the moment ' +
      'you queue it, and <strong>research days</strong> once it reaches the front ' +
      'of the queue. The tree is far longer than a term — you are choosing a ' +
      'direction, not a shopping list. Tap a queued node to cancel it and get the ' +
      'Political Capital back.';
    body.appendChild(note);
  };

  /**
   * The bar across the top: what is being researched, how far along, and how
   * long it will take AT THE CURRENT RATE. The estimate matters more than the
   * progress: research speed is itself a thing the player can buy, and "347
   * days left" is the number that tells them whether a Scholar was worth it.
   */
  function researchStatus(state) {
    var wrap = node('div', 'research-status');

    if (!state.tech.queue.length) {
      wrap.appendChild(node('div', 'research-status__idle', 'No research under way'));
      wrap.appendChild(node('div', 'research-status__rate',
        Util.formatRate(state.derived.researchPerDay) + ' research/day available'));
      return wrap;
    }

    var current = Mandate.TECH.byId(state.tech.queue[0]);
    var rate = state.derived.researchPerDay;
    var left = rate > 0 ? Math.ceil((current.days - state.tech.progress) / rate) : Infinity;

    var head = node('div', 'research-status__head');
    head.appendChild(node('span', 'research-status__label', 'Researching'));
    head.appendChild(node('span', 'research-status__name', current.name));
    wrap.appendChild(head);

    var bar = node('div', 'bar');
    var fill = node('div', 'bar__fill bar__fill--research');
    fill.style.width = Math.min(100, (state.tech.progress / current.days) * 100).toFixed(1) + '%';
    bar.appendChild(fill);
    wrap.appendChild(bar);

    wrap.appendChild(node('div', 'research-status__rate',
      Math.floor(state.tech.progress) + ' / ' + current.days + ' days · ' +
      (isFinite(left) ? left + ' days left' : 'stalled') +
      ' at ' + rate.toFixed(2) + '/day'));

    /* Everything queued behind the head, as cancellable chips. */
    if (state.tech.queue.length > 1) {
      var queue = node('div', 'queue-chips');
      queue.appendChild(node('span', 'queue-chips__label', 'Then:'));
      state.tech.queue.slice(1).forEach(function (id) {
        var techNode = Mandate.TECH.byId(id);
        var chip = node('button', 'queue-chip', techNode.name);
        chip.title = 'Cancel and refund ' + techNode.cost + ' Political Capital';
        chip.setAttribute('aria-label', 'Cancel ' + techNode.name);
        View.onTap(chip, function () { handlers.onCancelTech(id); });
        queue.appendChild(chip);
      });
      wrap.appendChild(queue);
    }

    return wrap;
  }

  function branchColumn(state, branch) {
    var column = node('div', 'branch');

    var head = node('div', 'branch__head');
    var icon = node('span', 'branch__icon');
    icon.appendChild(Mandate.Icons.el(branch.icon));
    icon.setAttribute('aria-hidden', 'true');
    head.appendChild(icon);
    head.appendChild(node('span', null, branch.label));
    column.appendChild(head);

    Mandate.TECH.nodes.filter(function (techNode) {
      return techNode.branch === branch.id;
    }).sort(function (a, b) {
      return a.tier - b.tier;
    }).forEach(function (techNode) {
      column.appendChild(techRow(state, techNode));
    });

    return column;
  }

  function techRow(state, techNode) {
    var status = Mandate.Sim.techStatus(state, techNode.id);

    var row = node('button', 'tech');
    row.dataset.status = status;

    var main = node('div', 'tech__main');
    main.appendChild(node('div', 'tech__name', techNode.name));
    main.appendChild(node('div', 'tech__blurb', techNode.blurb));
    row.appendChild(main);

    var side = node('div', 'tech__side');
    if (status === 'done') {
      var tick = node('span', 'tech__tick');
      tick.appendChild(Mandate.Icons.el('done'));
      side.appendChild(tick);
    } else {
      side.appendChild(node('span', 'tech__cost', techNode.cost + ' pc'));
      side.appendChild(node('span', 'tech__days', techNode.days + 'd'));
    }
    row.appendChild(side);

    /* One line under the row saying what the sim would say if you tapped it.
     * For a locked node that is the missing prerequisite, which is the only
     * useful thing a locked row can tell you. */
    if (status !== 'done') {
      var check = Mandate.Sim.canQueueTech(state, techNode.id);
      if (!check.ok) row.appendChild(node('small', 'tech__reason', check.reason));
      row.disabled = !check.ok && status !== 'queued' && status !== 'researching';
    } else {
      row.disabled = true;
    }

    View.onTap(row, function () {
      if (status === 'queued') { handlers.onCancelTech(techNode.id); return; }
      if (row.disabled) return;
      handlers.onQueueTech(techNode.id);
    });

    return row;
  }

  /* ========================================================================
   * APPOINTEES
   * ====================================================================== */

  Ministry.renderAppointees = function (body, state) {
    body.innerHTML = '';

    body.appendChild(slotHeading(state, 'minister', 'Ministers', 'the whole country'));
    body.appendChild(hiredList(state, 'minister'));

    body.appendChild(slotHeading(state, 'governor', 'Governors', 'the region you post them to'));
    body.appendChild(hiredList(state, 'governor'));

    body.appendChild(node('h3', null, 'Available'));
    body.appendChild(poolList(state));

    var note = node('p', 'note');
    note.innerHTML = 'A minister’s traits apply <strong>nationally</strong>; ' +
      'a governor’s apply only in the <strong>region they are posted to</strong>, ' +
      'so the same person is worth very different amounts in different places. ' +
      'Salaries are paid <strong>every day</strong>, out of the same bill as ' +
      'everything else you own — an over-staffed government goes bankrupt like ' +
      'an over-built one. A new candidate appears every ' +
      Mandate.BALANCE.appointees.refreshEveryDays + ' days.';
    body.appendChild(note);
  };

  function slotHeading(state, role, label, scopeText) {
    var used = Mandate.Sim.hiredCount(state, role);
    var slots = Mandate.Sim.slotsFor(state, role);

    var head = node('h3', 'slot-head');
    head.appendChild(node('span', null, label));
    var count = node('span', 'slot-head__count', used + ' / ' + slots + ' slots');
    if (used >= slots) count.dataset.full = 'true';
    head.appendChild(count);
    head.appendChild(node('span', 'slot-head__scope', 'affects ' + scopeText));
    return head;
  }

  function hiredList(state, role) {
    var list = node('div', 'person-list');
    var any = false;

    state.appointees.hired.forEach(function (person) {
      if (person.role !== role) return;
      any = true;
      list.appendChild(personCard(state, person, true));
    });

    if (!any) list.appendChild(node('p', 'note', 'Nobody appointed.'));
    return list;
  }

  function poolList(state) {
    var list = node('div', 'person-list');
    if (!state.appointees.pool.length) {
      list.appendChild(node('p', 'note', 'No candidates available right now.'));
      return list;
    }
    state.appointees.pool.forEach(function (candidate) {
      list.appendChild(personCard(state, candidate, false));
    });
    return list;
  }

  /**
   * One person, hired or not. The same card either way — what changes is the
   * control on the right, because "what would this person do for me" is the
   * same question before and after you hire them.
   */
  function personCard(state, person, hired) {
    var card = node('div', 'person');

    var head = node('div', 'person__head');
    head.appendChild(node('div', 'person__title', person.title));
    head.appendChild(node('div', 'person__name', person.name));
    card.appendChild(head);

    var traits = node('div', 'person__traits');
    Mandate.Mods.traitsOf(person).forEach(function (trait) {
      var pill = node('span', 'trait', trait.label);
      if (trait.drawback) pill.dataset.drawback = 'true';
      pill.title = trait.blurb;
      traits.appendChild(pill);
    });
    card.appendChild(traits);

    /* The traits' own words, so the card explains itself without a tooltip —
     * there is no hover on a phone. */
    Mandate.Mods.traitsOf(person).forEach(function (trait) {
      var line = node('div', 'person__effect', trait.blurb);
      if (trait.drawback) line.dataset.drawback = 'true';
      card.appendChild(line);
    });

    var foot = node('div', 'person__foot');
    foot.appendChild(node('span', 'person__salary',
      person.salary.toFixed(2) + ' ¤/day'));

    if (hired) {
      if (person.role === 'governor') foot.appendChild(postingControl(state, person));
      var fire = node('button', 'mini-btn mini-btn--danger', 'Dismiss');
      View.onTap(fire, function () { handlers.onDismiss(person.id); });
      foot.appendChild(fire);
    } else {
      var check = Mandate.Sim.canHire(state, person.id);
      foot.appendChild(node('span', 'person__fee',
        Util.formatInt(Mandate.Sim.hiringFee(state, person)) + ' ¤ to hire'));
      var hire = node('button', 'mini-btn', check.ok ? 'Hire' : check.reason);
      hire.disabled = !check.ok;
      View.onTap(hire, function () {
        if (hire.disabled) return;
        handlers.onHire(person.id);
      });
      foot.appendChild(hire);
    }

    card.appendChild(foot);
    return card;
  }

  /**
   * Where a governor is posted. A native <select> rather than a custom
   * control: it is one tap on a phone, it opens the platform's own picker,
   * and it stays usable with a keyboard and a screen reader for free.
   */
  function postingControl(state, person) {
    var select = document.createElement('select');
    select.className = 'posting';
    select.setAttribute('aria-label', 'Post ' + person.name + ' to a region');

    var none = document.createElement('option');
    none.value = '';
    none.textContent = 'Unposted';
    select.appendChild(none);

    state.regions.forEach(function (region) {
      var def = Mandate.State.regionDef(region.id) || { name: region.id };
      var option = document.createElement('option');
      option.value = region.id;
      /* Flag a region that already has somebody: posting here recalls them,
       * and the player should know that before they tap, not after. */
      var incumbent = Mandate.Sim.governorOf(state, region.id);
      option.textContent = def.name +
        (incumbent && incumbent.id !== person.id ? ' (occupied)' : '');
      select.appendChild(option);
    });

    select.value = person.regionId || '';
    /* `change`, not onTap: a select is the one control where the tap is the
     * browser's business and only the result is ours. */
    select.addEventListener('change', function () {
      handlers.onAssign(person.id, select.value || null);
    });
    return select;
  }

  /* ========================================================================
   * POLICIES
   * ====================================================================== */

  Ministry.renderPolicies = function (body, state) {
    body.innerHTML = '';

    Mandate.POLICIES.forEach(function (category) {
      body.appendChild(policyCategory(state, category));
    });

    var note = node('p', 'note');
    note.innerHTML = 'One option in each category is <strong>always</strong> in ' +
      'force — a policy is a posture, not a bonus. Changing one costs ' +
      'Political Capital and locks that category for ' +
      Mandate.BALANCE.policies.cooldownDays + ' days, so these are decisions ' +
      'you live with rather than dials you turn.';
    body.appendChild(note);
  };

  function policyCategory(state, category) {
    var wrap = node('div', 'policy');

    var head = node('div', 'policy__head');
    head.appendChild(node('h3', null, category.label));
    var cooldown = Mandate.Sim.policyCooldownLeft(state, category.id);
    if (cooldown > 0) {
      head.appendChild(node('span', 'policy__cooldown',
        'locked for ' + Math.ceil(cooldown) + ' days'));
    }
    wrap.appendChild(head);
    wrap.appendChild(node('p', 'policy__blurb', category.blurb));

    var options = node('div', 'policy__options');
    category.options.forEach(function (option) {
      /* When the category is on cooldown every option would print the same
       * countdown, which is the heading's job — once, not three times. */
      options.appendChild(policyOption(state, category, option, cooldown > 0));
    });
    wrap.appendChild(options);
    return wrap;
  }

  function policyOption(state, category, option, quietReason) {
    var active = state.policies.active[category.id] === option.id;

    var btn = node('button', 'policy-option');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');

    var head = node('div', 'policy-option__head');
    head.appendChild(node('span', 'policy-option__label', option.label));
    if (active) {
      head.appendChild(node('span', 'policy-option__active', 'In force'));
    } else if (option.cost) {
      head.appendChild(node('span', 'policy-option__cost', option.cost + ' pc'));
    }
    btn.appendChild(head);
    btn.appendChild(node('div', 'policy-option__blurb', option.blurb));

    if (option.upkeep) {
      var upkeep = Object.keys(option.upkeep).map(function (key) {
        return '−' + option.upkeep[key] + ' ' + shortLabel(key) + '/day';
      }).join(', ');
      btn.appendChild(node('div', 'policy-option__upkeep', upkeep));
    }

    if (!active) {
      var check = Mandate.Sim.canEnactPolicy(state, category.id, option.id);
      btn.disabled = !check.ok;
      if (!check.ok && !quietReason) {
        btn.appendChild(node('small', 'policy-option__reason', check.reason));
      }
      View.onTap(btn, function () {
        if (btn.disabled) return;
        handlers.onEnactPolicy(category.id, option.id);
      });
    } else {
      btn.disabled = true;
    }

    return btn;
  }

  function shortLabel(key) {
    if (key === 'treasury') return '¤';
    if (key === 'manpower') return 'mp';
    if (key === 'politicalCapital') return 'pc';
    if (key === 'mandate') return 'mandate';
    return key;
  }

  Mandate.Ministry = Ministry;
})(window.Mandate = window.Mandate || {});
