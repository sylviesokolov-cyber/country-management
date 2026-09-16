/* ============================================================================
 * data/regions.js — GAMEPLAY definition of each region.
 * ----------------------------------------------------------------------------
 * Matched to a shape in data/map-geometry.js by `id`. Nothing here knows or
 * cares where the region is drawn; nothing in map-geometry.js knows these
 * numbers exist. Swap either file independently.
 *
 * Ids run in reading order across the landscape map:
 *   top row     r1  r2  r3  r4  r5
 *   middle row  r6  r7  r8  r9  r10 r11
 *   bottom row      r12 r13 r14 r15 r16
 * The capital sits in the middle of the country; the rough, unstable regions
 * are pushed out to the edges, so the player is always defending a frontier.
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
    /* --- northern tier --- */
    { id: 'r1',  name: 'Karst Reach',    terrain: 'highland', stability: 52, development: 12 },
    { id: 'r2',  name: 'Vellen',         terrain: 'agrarian', stability: 61, development: 18 },
    { id: 'r3',  name: 'North Adra',     terrain: 'frontier', stability: 33, development: 8  },
    { id: 'r4',  name: 'Tarn Hollow',    terrain: 'highland', stability: 44, development: 10 },
    { id: 'r5',  name: 'Duskmoor',       terrain: 'frontier', stability: 31, development: 6  },

    /* --- central belt (the capital and the industrial core) --- */
    { id: 'r6',  name: 'Oskani Coast',   terrain: 'coastal',  stability: 57, development: 22 },
    { id: 'r7',  name: 'Sablewood',      terrain: 'agrarian', stability: 58, development: 15 },
    { id: 'r8',  name: 'Meridia',        terrain: 'urban',    stability: 68, development: 34, capital: true },
    { id: 'r9',  name: 'Belask',         terrain: 'industry', stability: 55, development: 27 },
    { id: 'r10', name: 'Cinder Flats',   terrain: 'industry', stability: 47, development: 21 },
    { id: 'r11', name: 'Port Ivane',     terrain: 'coastal',  stability: 63, development: 29 },

    /* --- southern tier --- */
    { id: 'r12', name: 'Lowfen',         terrain: 'agrarian', stability: 49, development: 13 },
    { id: 'r13', name: 'Grenhal',        terrain: 'industry', stability: 42, development: 17 },
    { id: 'r14', name: 'Harrow Bay',     terrain: 'coastal',  stability: 50, development: 19 },
    { id: 'r15', name: 'South Adra',     terrain: 'frontier', stability: 26, development: 5  },
    { id: 'r16', name: 'Ossory Straits', terrain: 'coastal',  stability: 54, development: 11 },
  ];
})(window.Mandate = window.Mandate || {});
