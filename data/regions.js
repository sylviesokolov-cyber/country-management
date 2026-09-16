/* ============================================================================
 * data/regions.js — GAMEPLAY definition of each region.
 * ----------------------------------------------------------------------------
 * Matched to a shape in data/map-geometry.js by `id`. Nothing here knows or
 * cares where the region is drawn; nothing in map-geometry.js knows these
 * numbers exist. Swap either file independently.
 *
 * `terrain` is flavour for now, but it is the natural hook for Phase 2+
 * modifiers (e.g. highland regions resist garrisons, coastal regions earn more
 * from trade tech). Terrain multipliers, when they exist, belong in
 * data/balance.js — not here. This file says WHAT EXISTS; balance.js says HOW
 * MUCH.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  Mandate.REGIONS = [
    { id: 'r1',  name: 'Karst Reach',    terrain: 'highland', stability: 52, development: 12 },
    { id: 'r2',  name: 'Vellen',         terrain: 'agrarian', stability: 61, development: 18 },
    { id: 'r3',  name: 'North Adra',     terrain: 'frontier', stability: 38, development: 8  },
    { id: 'r4',  name: 'Oskani Coast',   terrain: 'coastal',  stability: 57, development: 22 },
    { id: 'r5',  name: 'Tarn Hollow',    terrain: 'highland', stability: 44, development: 10 },
    { id: 'r6',  name: 'Meridia',        terrain: 'urban',    stability: 68, development: 34, capital: true },
    { id: 'r7',  name: 'Belask',         terrain: 'industry', stability: 55, development: 27 },
    { id: 'r8',  name: 'Port Ivane',     terrain: 'coastal',  stability: 63, development: 29 },
    { id: 'r9',  name: 'Duskmoor',       terrain: 'frontier', stability: 31, development: 6  },
    { id: 'r10', name: 'Cinder Flats',   terrain: 'industry', stability: 47, development: 21 },
    { id: 'r11', name: 'Sablewood',      terrain: 'agrarian', stability: 58, development: 15 },
    { id: 'r12', name: 'Harrow Bay',     terrain: 'coastal',  stability: 50, development: 19 },
    { id: 'r13', name: 'South Adra',     terrain: 'frontier', stability: 26, development: 5  },
    { id: 'r14', name: 'Lowfen',         terrain: 'agrarian', stability: 49, development: 13 },
    { id: 'r15', name: 'Grenhal',        terrain: 'industry', stability: 42, development: 17 },
    { id: 'r16', name: 'Ossory Straits', terrain: 'coastal',  stability: 54, development: 11 },
  ];
})(window.Mandate = window.Mandate || {});
