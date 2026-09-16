/* ============================================================================
 * data/appointees.js — THE HIRING POOL: names and titles, nothing else.
 * ----------------------------------------------------------------------------
 * Candidates are GENERATED, not authored. This file supplies the raw material
 * — names and honorifics — and src/sim.js draws a candidate by rolling a role,
 * one perk trait and (sometimes) one drawback from data/traits.js.
 *
 * Why generated: the pool has to keep refreshing for the whole run, and an
 * authored list either repeats or has to be enormous. The interesting part of
 * an appointee is their TRAITS, which are authored; the name only has to be
 * memorable enough that "move Tesoro to Belask" is a sentence the player can
 * think.
 *
 * Every draw goes through the seeded RNG in state, so the same save always
 * produces the same pool — see Sim.random().
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  Mandate.APPOINTEES = {
    /* Deliberately not tied to any real place: the country is invented, so the
     * names are drawn from a couple of loosely European-sounding registers and
     * mixed freely. */
    firstNames: [
      'Adrien', 'Marek', 'Ilse', 'Tomas', 'Vela', 'Corin', 'Adela', 'Rusev',
      'Nadia', 'Emeric', 'Sora', 'Lenn', 'Oksana', 'Piers', 'Dalia', 'Vaughn',
      'Mira', 'Ansel', 'Petra', 'Kosta', 'Yelena', 'Bram', 'Noor', 'Ferenc',
    ],
    surnames: [
      'Tesoro', 'Vance', 'Kolar', 'Adranei', 'Brask', 'Ostrov', 'Merrow',
      'Halvane', 'Sikora', 'Dray', 'Vasko', 'Renholt', 'Barca', 'Okonjo',
      'Feld', 'Marchetti', 'Zoric', 'Lindqvist', 'Abara', 'Quill',
      'Vosk', 'Amari', 'Petrou', 'Strand',
    ],

    /* Shown above the name in the hiring list — pure flavour, but it is what
     * makes a minister read as a different kind of person from a governor. */
    titles: {
      minister: [
        'Minister-designate', 'Permanent Secretary', 'Chief of Staff',
        'Director of the Bureau', 'State Counsellor',
      ],
      governor: [
        'Governor-designate', 'Provincial Administrator', 'Prefect',
        'District Commissioner', 'Regional Secretary',
      ],
    },

    roleLabels: { minister: 'Minister', governor: 'Governor' },
  };
})(window.Mandate = window.Mandate || {});
