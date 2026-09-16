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
  /* id -> last band applied, so we only touch classList when it changes. */
  var lastBand = Object.create(null);
  var lastGarrison = Object.create(null);
  var lastSelected = null;

  /**
   * Create the SVG content. `onRegionTap` is called with a region id.
   */
  Map.build = function (svgEl, onRegionTap) {
    var geo = Mandate.MAP_GEOMETRY;
    svgEl.setAttribute('viewBox', geo.viewBox);

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

      /* A dot above the label marks a garrison. Drawn for every region and
       * hidden by default, because a garrison comes and goes constantly —
       * creating and destroying the node each time would mean touching the
       * SVG on a tick rather than just flipping a class. */
      var garrison = document.createElementNS(SVG_NS, 'circle');
      garrison.setAttribute('cx', shape.labelAt.x);
      garrison.setAttribute('cy', shape.labelAt.y - 13);
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
