/* ============================================================================
 * src/ui/map.js — builds and updates the SVG map.
 * ----------------------------------------------------------------------------
 * Built ONCE from data/map-geometry.js (build()), then only ever updated by
 * swapping CSS classes (render()). Rebuilding SVG nodes every frame would be
 * slow and would also lose the CSS colour transitions.
 *
 * Why inline SVG rather than a <canvas>?
 *   - Every region is a real DOM element, so tapping is just an event listener
 *     — no hit-testing maths.
 *   - Styling (fill, stroke, selected state) is plain CSS.
 *   - It scales to any screen size for free via the viewBox.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Map = {};
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* id -> <path> element, so render() never has to search the DOM. */
  var regionNodes = Object.create(null);
  /* id -> the garrison marker drawn over that region. */
  var garrisonNodes = Object.create(null);
  /* id -> the unrest-clock ring drawn over that region. */
  var unrestNodes = Object.create(null);
  /* id -> last band applied, so we only touch classList when it changes. */
  var lastBand = Object.create(null);
  var lastGarrison = Object.create(null);
  var lastRevolt = Object.create(null);
  /* id -> the rounded unrest-clock step last drawn (0-4). Rounded so the ring
   * is redrawn a handful of times over eight months rather than every frame. */
  var lastUnrestStep = Object.create(null);
  var lastSelected = null;

  /* How many steps the unrest warning ring has. Four is enough to read as
   * "filling up" at a glance and few enough that the SVG is touched rarely. */
  var UNREST_STEPS = 4;

  /**
   * A diagonal hatch for provinces in open revolt.
   *
   * Revolt has to be distinguishable from the crisis BAND, and both of them
   * are red — so colour alone cannot carry it. Roughly one man in twelve
   * cannot reliably tell those two reds apart, and the difference between
   * "this province is in trouble" and "this province is gone and Invest will
   * be refused there" is the most consequential distinction on the map.
   * A texture reads for everybody.
   *
   * The pattern's own colours are set in CSS rather than as attributes here,
   * so the palette stays entirely in base.css — a `fill="#f0563e"` in this
   * file would be the only raw colour in the project.
   */
  function buildDefs() {
    var defs = document.createElementNS(SVG_NS, 'defs');
    var pattern = document.createElementNS(SVG_NS, 'pattern');
    pattern.setAttribute('id', 'hatch-revolt');
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', '9');
    pattern.setAttribute('height', '9');
    pattern.setAttribute('patternTransform', 'rotate(45)');

    var background = document.createElementNS(SVG_NS, 'rect');
    background.setAttribute('class', 'hatch__bg');
    background.setAttribute('width', '9');
    background.setAttribute('height', '9');

    var stripe = document.createElementNS(SVG_NS, 'rect');
    stripe.setAttribute('class', 'hatch__stripe');
    stripe.setAttribute('width', '4');
    stripe.setAttribute('height', '9');

    pattern.appendChild(background);
    pattern.appendChild(stripe);
    defs.appendChild(pattern);
    return defs;
  }

  /**
   * Create the SVG content. `onRegionTap` is called with a region id.
   */
  Map.build = function (svgEl, onRegionTap) {
    var geo = Mandate.MAP_GEOMETRY;
    svgEl.setAttribute('viewBox', geo.viewBox);

    svgEl.appendChild(buildDefs());

    /* Two groups so every label paints above every region, regardless of the
     * order regions are drawn in. */
    var shapes = document.createElementNS(SVG_NS, 'g');
    var labels = document.createElementNS(SVG_NS, 'g');

    geo.regions.forEach(function (shape) {
      var def = Mandate.State.regionDef(shape.id) || { name: shape.id };

      var poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', shape.points);
      poly.setAttribute('class', 'region');
      poly.setAttribute('data-region-id', shape.id);
      /* Accessible without a mouse: each region is a real button. */
      poly.setAttribute('role', 'button');
      poly.setAttribute('tabindex', '0');
      poly.setAttribute('aria-label', def.name);

      Mandate.View.onTap(poly, function () { onRegionTap(shape.id); });

      /* Instant visual feedback on touch-down, cleared when the finger lifts
       * anywhere. Purely cosmetic, but it's most of what makes taps feel
       * "connected" on a phone. */
      poly.addEventListener('pointerdown', function () {
        poly.classList.add('region--pressed');
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (evt) {
        poly.addEventListener(evt, function () {
          poly.classList.remove('region--pressed');
        });
      });

      shapes.appendChild(poly);
      regionNodes[shape.id] = poly;

      var label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', shape.labelAt.x);
      label.setAttribute('y', shape.labelAt.y);
      label.setAttribute('class', 'region-label');
      label.textContent = def.name;
      labels.appendChild(label);

      /* THE UNREST CLOCK, as a progress ring around the region's status
       * marker.
       *
       * A province does not fall into revolt without warning: it spends eight
       * months visibly filling this up first. That warning is the whole
       * difference between a mechanic that punishes neglect and one that
       * punishes not having read the manual — Rebel Inc. shows insurgent
       * pressure building in a zone long before the zone falls, and it is the
       * reason its crises feel earned rather than arbitrary.
       *
       * Drawn as a stroked arc on a circle with `pathLength="100"`, so the
       * fill level is one attribute and needs no geometry per frame. The
       * circle also carries a dark FILL, which is what makes the arc legible:
       * the ring only ever appears on regions in the orange and red bands,
       * and an orange arc drawn straight onto an orange region is invisible.
       * The dark disc gives it something to sit against on every band, and
       * the garrison dot is appended after it so it lands inside the ring. */
      var warning = document.createElementNS(SVG_NS, 'circle');
      warning.setAttribute('cx', shape.labelAt.x);
      warning.setAttribute('cy', shape.labelAt.y - 14);
      warning.setAttribute('r', '9');
      warning.setAttribute('class', 'region-unrest');
      warning.setAttribute('pathLength', '100');
      warning.setAttribute('stroke-dasharray', '0 100');
      labels.appendChild(warning);
      unrestNodes[shape.id] = warning;

      /* A dot above the label marks a garrison. Drawn for every region and
       * hidden by default, because a garrison comes and goes constantly —
       * creating and destroying the node each time would mean touching the
       * SVG on a tick rather than just flipping a class. */
      var garrison = document.createElementNS(SVG_NS, 'circle');
      garrison.setAttribute('cx', shape.labelAt.x);
      garrison.setAttribute('cy', shape.labelAt.y - 14);
      garrison.setAttribute('r', '4.5');
      garrison.setAttribute('class', 'region-garrison');
      labels.appendChild(garrison);
      garrisonNodes[shape.id] = garrison;

      /* A small dot marks the capital. Flagged in data/regions.js. */
      if (def.capital) {
        var dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', shape.labelAt.x);
        dot.setAttribute('cy', shape.labelAt.y + 12);
        dot.setAttribute('r', '3.5');
        dot.setAttribute('class', 'region-capital');
        labels.appendChild(dot);
      }
    });

    svgEl.appendChild(shapes);
    svgEl.appendChild(labels);
  };

  /**
   * Per-frame update: recolour regions whose stability band changed, and move
   * the selection outline. Cheap enough to call every frame.
   */
  Map.render = function (state) {
    for (var i = 0; i < state.regions.length; i++) {
      var region = state.regions[i];
      var node = regionNodes[region.id];
      if (!node) continue;

      var band = Mandate.Sim.stabilityBand(region).id;
      if (lastBand[region.id] !== band) {
        if (lastBand[region.id]) node.classList.remove('region--' + lastBand[region.id]);
        node.classList.add('region--' + band);
        lastBand[region.id] = band;
      }

      var garrisoned = !!region.garrisoned;
      if (lastGarrison[region.id] !== garrisoned) {
        garrisonNodes[region.id].classList.toggle('is-on', garrisoned);
        lastGarrison[region.id] = garrisoned;
      }

      /* A province in open revolt gets its own fill, not merely the darkest
       * stability band: it is a different STATE, not a worse number, and the
       * map has to say so without the player opening anything. */
      var revolting = !!region.inRevolt;
      if (lastRevolt[region.id] !== revolting) {
        node.classList.toggle('region--revolt', revolting);
        lastRevolt[region.id] = revolting;
        /* Announce it to a screen reader too — the fill change is invisible
         * to one, and this is the most important fact on the map. */
        var def = Mandate.State.regionDef(region.id) || { name: region.id };
        node.setAttribute('aria-label',
          def.name + (revolting ? ' — in open revolt' : ''));
      }

      /* The unrest clock, rounded into steps. Hidden entirely once the revolt
       * has actually started: the ring is a countdown, and a countdown that
       * has finished is just clutter on top of the thing it warned about. */
      var progress = Mandate.Sim.revoltProgress(region);
      var step = revolting ? -1 : Math.round(progress * UNREST_STEPS);
      if (lastUnrestStep[region.id] !== step) {
        lastUnrestStep[region.id] = step;
        var ring = unrestNodes[region.id];
        ring.classList.toggle('is-on', step > 0);
        ring.setAttribute('stroke-dasharray',
          step > 0 ? (step / UNREST_STEPS) * 100 + ' 100' : '0 100');
      }
    }

    var selected = Mandate.View.viewState.selectedRegionId;
    if (selected !== lastSelected) {
      if (lastSelected && regionNodes[lastSelected]) {
        regionNodes[lastSelected].classList.remove('region--selected');
      }
      if (selected && regionNodes[selected]) {
        regionNodes[selected].classList.add('region--selected');
        /* Move the selected region to the end of its group so its thicker
         * outline isn't clipped by neighbours drawn after it. */
        regionNodes[selected].parentNode.appendChild(regionNodes[selected]);
      }
      lastSelected = selected;
    }
  };

  Mandate.MapView = Map;
})(window.Mandate = window.Mandate || {});
