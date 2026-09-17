/* ============================================================================
 * src/ui/icons.js — the icon system.
 * ----------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * Every icon in the game used to be an emoji. Emoji are the single loudest
 * "this is a prototype" signal a UI can send: they are a different artist's
 * work on every platform, they carry their own colour so they never match the
 * palette, they cannot be given a stroke weight, and on Android they render
 * in a style that has nothing to do with anything else on the screen. A HUD
 * built from them cannot look designed, because it is not.
 *
 * So: one sprite of 46 line icons, one stroke weight, one geometry
 * (24x24, 2px, round caps), all drawn in `currentColor` so a chip's icon is
 * automatically the chip's colour and a disabled button's icon dims with it.
 *
 * WHY A SPRITE IN JS RATHER THAN A FILE
 *
 * `<use href="assets/icons.svg#id">` — the normal way to do this — does not
 * work from `file://`, and opening index.html straight off the filesystem is
 * a requirement of this project (see the note on the script tags in
 * index.html). An external sprite would also be a second network request on a
 * phone. So the sprite is a string here, injected once at boot, and every
 * `<use>` in the game points at the live document.
 *
 * WHERE THE ARTWORK COMES FROM
 *
 * Lucide (https://lucide.dev), ISC licensed — see assets/LICENSES.md. Two
 * glyphs this game needed are not in the set and are drawn here by hand in
 * the same language; you should not be able to tell which.
 *
 * USAGE
 *
 *     Icons.el('treasury')             -> an <svg> element, 1em square
 *     Icons.el('revolt', 'chip__icon') -> ...with a class
 *     Icons.markup('close')            -> the same thing as a string
 *
 * Size and colour are CSS, never attributes: `.icon { width: 1em }` means an
 * icon is always exactly as big as the text beside it.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Icons = {};
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var XLINK = 'http://www.w3.org/1999/xlink';

  /* Every symbol shares the presentation attributes, set once on the <svg>
   * wrapper below rather than repeated 40 times here. */
  var SPRITE =
    '<symbol id="i-agrarian" viewBox="0 0 24 24"><path d="M2 22 16 8" /> <path d="M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" /> <path d="M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" /> <path d="M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" /> <path d="M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z" /> <path d="M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z" /> <path d="M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z" /> <path d="M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z" /></symbol>' +
    '<symbol id="i-appointees" viewBox="0 0 24 24"><path d="m14.305 19.53.923-.382" /> <path d="m15.228 16.852-.923-.383" /> <path d="m16.852 15.228-.383-.923" /> <path d="m16.852 20.772-.383.924" /> <path d="m19.148 15.228.383-.923" /> <path d="m19.53 21.696-.382-.924" /> <path d="M2 21a8 8 0 0 1 10.434-7.62" /> <path d="m20.772 16.852.924-.383" /> <path d="m20.772 19.148.924.383" /> <circle cx="10" cy="8" r="5" /> <circle cx="18" cy="18" r="3" /></symbol>' +
    '<symbol id="i-best" viewBox="0 0 24 24"><path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2" /> <path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2" /> <path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3" /> <path d="M4 22h16" /> <path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z" /> <path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3" /></symbol>' +
    '<symbol id="i-buff" viewBox="0 0 24 24"><path d="m5 12 7-7 7 7" /> <path d="M12 19V5" /></symbol>' +
    '<symbol id="i-capital" viewBox="0 0 24 24"><path d="M10 18v-7" /> <path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z" /> <path d="M14 18v-7" /> <path d="M18 18v-7" /> <path d="M3 22h18" /> <path d="M6 18v-7" /></symbol>' +
    '<symbol id="i-capitalcity" viewBox="0 0 24 24"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" /></symbol>' +
    '<symbol id="i-chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></symbol>' +
    '<symbol id="i-close" viewBox="0 0 24 24"><path d="M18 6 6 18" /> <path d="m6 6 12 12" /></symbol>' +
    '<symbol id="i-coastal" viewBox="0 0 24 24"><path d="M2 7c1.5 0 2.5 1.2 4 1.2S8.5 7 10 7s2.5 1.2 4 1.2S16.5 7 18 7s2.5 1.2 4 1.2"/><path d="M2 13c1.5 0 2.5 1.2 4 1.2s2.5-1.2 4-1.2 2.5 1.2 4 1.2 2.5-1.2 4-1.2 2.5 1.2 4 1.2"/><path d="M2 19c1.5 0 2.5 1.2 4 1.2s2.5-1.2 4-1.2 2.5 1.2 4 1.2 2.5-1.2 4-1.2 2.5 1.2 4 1.2"/></symbol>' +
    '<symbol id="i-date" viewBox="0 0 24 24"><path d="M8 2v3" /> <path d="M16 2v3" /> <rect x="3" y="3" width="18" height="18" rx="2" /> <path d="M3 9h18" /> <path d="M8 13h.01" /> <path d="M12 13h.01" /> <path d="M16 13h.01" /> <path d="M8 17h.01" /> <path d="M12 17h.01" /> <path d="M16 17h.01" /></symbol>' +
    '<symbol id="i-development" viewBox="0 0 24 24"><path d="M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2" /> <rect x="14" y="2" width="8" height="8" rx="1" /></symbol>' +
    '<symbol id="i-done" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /> <path d="m16 9-5.5 5.5L8 12" /></symbol>' +
    '<symbol id="i-events" viewBox="0 0 24 24"><path d="M7 18v-6a5 5 0 1 1 10 0v6" /> <path d="M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z" /> <path d="M21 12h1" /> <path d="M18.5 4.5 18 5" /> <path d="M2 12h1" /> <path d="M12 2v1" /> <path d="m4.929 4.929.707.707" /> <path d="M12 12v6" /></symbol>' +
    '<symbol id="i-fast" viewBox="0 0 24 24"><path d="m6 17 5-5-5-5" /> <path d="m13 17 5-5-5-5" /></symbol>' +
    '<symbol id="i-frontier" viewBox="0 0 24 24"><circle cx="4" cy="4" r="2" /> <path d="m14 5 3-3 3 3" /> <path d="m14 10 3-3 3 3" /> <path d="M17 14V2" /> <path d="M17 14H7l-5 8h20Z" /> <path d="M8 14v8" /> <path d="m9 14 5 8" /></symbol>' +
    '<symbol id="i-fullscreen" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3" /> <path d="M21 8V5a2 2 0 0 0-2-2h-3" /> <path d="M3 16v3a2 2 0 0 0 2 2h3" /> <path d="M16 21h3a2 2 0 0 0 2-2v-3" /></symbol>' +
    '<symbol id="i-garrison" viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></symbol>' +
    '<symbol id="i-handicap" viewBox="0 0 24 24"><path d="M12 5v14" /> <path d="m19 12-7 7-7-7" /></symbol>' +
    '<symbol id="i-highland" viewBox="0 0 24 24"><path d="m8 3 4 8 5-5 5 15H2L8 3z" /></symbol>' +
    '<symbol id="i-industry" viewBox="0 0 24 24"><path d="M11 10.27 7 3.34" /> <path d="m11 13.73-4 6.93" /> <path d="M12 22v-2" /> <path d="M12 2v2" /> <path d="M14 12h8" /> <path d="m17 20.66-1-1.73" /> <path d="m17 3.34-1 1.73" /> <path d="M2 12h2" /> <path d="m20.66 17-1.73-1" /> <path d="m20.66 7-1.73 1" /> <path d="m3.34 17 1.73-1" /> <path d="m3.34 7 1.73 1" /> <circle cx="12" cy="12" r="2" /> <circle cx="12" cy="12" r="8" /></symbol>' +
    '<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /> <path d="M12 16v-4" /> <path d="M12 8h.01" /></symbol>' +
    '<symbol id="i-invest" viewBox="0 0 24 24"><path d="M16 7h6v6" /> <path d="m22 7-8.5 8.5-5-5L2 17" /></symbol>' +
    '<symbol id="i-leader" viewBox="0 0 24 24"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" /> <path d="M5 21h14" /></symbol>' +
    '<symbol id="i-locked" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /> <path d="M7 11V7a5 5 0 0 1 10 0v4" /></symbol>' +
    '<symbol id="i-mandate" viewBox="0 0 24 24"><path d="M5 22h14" /> <path d="M5 2h14" /> <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" /> <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" /></symbol>' +
    '<symbol id="i-manpower" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> <path d="M16 3.128a4 4 0 0 1 0 7.744" /> <path d="M22 21v-2a4 4 0 0 0-3-3.87" /> <circle cx="9" cy="7" r="4" /></symbol>' +
    '<symbol id="i-mechanic" viewBox="0 0 24 24"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /> <path d="M20 2v4" /> <path d="M22 4h-4" /> <circle cx="4" cy="20" r="2" /></symbol>' +
    '<symbol id="i-ministry" viewBox="0 0 24 24"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M3 22h18"/><path d="M10 7h4"/><path d="M10 11h4"/><path d="M10 15h4"/><path d="M10 22v-3h4v3"/></symbol>' +
    '<symbol id="i-output" viewBox="0 0 24 24"><path d="M12 16h.01" /> <path d="M16 16h.01" /> <path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /> <path d="M8 16h.01" /></symbol>' +
    '<symbol id="i-pause" viewBox="0 0 24 24"><rect x="14" y="3" width="5" height="18" rx="1" /> <rect x="5" y="3" width="5" height="18" rx="1" /></symbol>' +
    '<symbol id="i-play" viewBox="0 0 24 24"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" /></symbol>' +
    '<symbol id="i-policies" viewBox="0 0 24 24"><path d="M15 12h-5" /> <path d="M15 8h-5" /> <path d="M19 17V5a2 2 0 0 0-2-2H4" /> <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" /></symbol>' +
    '<symbol id="i-regions" viewBox="0 0 24 24"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /> <path d="M15 5.764v15" /> <path d="M9 3.236v15" /></symbol>' +
    '<symbol id="i-relief" viewBox="0 0 24 24"><path d="M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762" /></symbol>' +
    '<symbol id="i-revolt" viewBox="0 0 24 24"><path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4" /></symbol>' +
    '<symbol id="i-security" viewBox="0 0 24 24"><path d="m13 19 6-6" /> <path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5" /> <path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586" /> <path d="m16 16 4 4" /> <path d="m19 21 2-2" /> <path d="m5 14 4 4" /> <path d="m5 21-2-2" /> <path d="M7.5 16.5 4 20" /></symbol>' +
    '<symbol id="i-stability" viewBox="0 0 24 24"><path d="M12 3v18" /> <path d="m19 8 3 8a5 5 0 0 1-6 0zV7" /> <path d="M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1" /> <path d="m5 8 3 8a5 5 0 0 1-6 0zV7" /> <path d="M7 21h10" /></symbol>' +
    '<symbol id="i-tech" viewBox="0 0 24 24"><path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" /> <path d="M6.453 15h11.094" /> <path d="M8.5 2h7" /></symbol>' +
    '<symbol id="i-time" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /> <path d="M12 6v6l4 2" /></symbol>' +
    '<symbol id="i-treasury" viewBox="0 0 24 24"><path d="M13.744 17.736a6 6 0 1 1-7.48-7.48" /> <path d="M15 6h1v4" /> <path d="m6.134 14.768.866-.5 2 3.464" /> <circle cx="16" cy="8" r="6" /></symbol>' +
    '<symbol id="i-unrest" viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" /> <path d="M12 9v4l2 2" /> <path d="M5 3 2 6" /> <path d="m22 6-3-3" /> <path d="M6.38 18.7 4 21" /> <path d="M17.64 18.67 20 21" /></symbol>' +
    '<symbol id="i-upkeep" viewBox="0 0 24 24"><path d="M12 17V7" /> <path d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8" /> <path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z" /></symbol>' +
    '<symbol id="i-urban" viewBox="0 0 24 24"><path d="M12 10h.01" /> <path d="M12 14h.01" /> <path d="M12 6h.01" /> <path d="M16 10h.01" /> <path d="M16 14h.01" /> <path d="M16 6h.01" /> <path d="M8 10h.01" /> <path d="M8 14h.01" /> <path d="M8 6h.01" /> <path d="M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" /> <rect x="4" y="2" width="16" height="20" rx="2" /></symbol>' +
    '<symbol id="i-warning" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /> <path d="M12 9v4" /> <path d="M12 17h.01" /></symbol>' +
    '<symbol id="i-withdraw" viewBox="0 0 24 24"><path d="m2 2 20 20" /> <path d="M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71" /> <path d="M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264" /></symbol>' +
    '<symbol id="i-works" viewBox="0 0 24 24"><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" /> <path d="M14 6a6 6 0 0 1 6 6v3" /> <path d="M4 15v-3a6 6 0 0 1 6-6" /> <rect x="2" y="15" width="20" height="4" rx="1" /></symbol>' +
    '';

  var injected = false;

  /**
   * Put the sprite in the document. Idempotent, and safe to call before the
   * first icon is created — which is what boot does.
   *
   * The host <svg> is hidden with `display:none`, NOT with `hidden` or
   * `visibility`: a `<use>` can still reference symbols inside a
   * display:none subtree, and anything that actually removes it from the
   * render tree (like `hidden`) breaks every icon on the page.
   */
  Icons.inject = function () {
    if (injected) return;
    injected = true;
    var host = document.createElementNS(SVG_NS, 'svg');
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('id', 'icon-sprite');
    host.style.display = 'none';
    host.innerHTML = SPRITE;
    document.body.insertBefore(host, document.body.firstChild);
  };

  /** Does the sprite have this icon? Used by the data-driven screens, which
   *  look icons up by a name that comes out of a data file. */
  Icons.has = function (id) {
    return SPRITE.indexOf('id="i-' + id + '"') !== -1;
  };

  /**
   * An <svg> element referencing one symbol.
   *
   * Always `aria-hidden`: every icon in this game sits beside a real text
   * label or inside a button that already has an aria-label, so announcing it
   * would only ever read the same thing twice.
   */
  Icons.el = function (id, className) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icon' + (className ? ' ' + className : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#i-' + id);
    /* Safari below 14 only honours the xlink form. It costs one attribute. */
    use.setAttributeNS(XLINK, 'xlink:href', '#i-' + id);
    svg.appendChild(use);
    return svg;
  };

  /** The string form, for the few places that build markup rather than nodes. */
  Icons.markup = function (id, className) {
    return '<svg class="icon' + (className ? ' ' + className : '') +
      '" aria-hidden="true" focusable="false"><use href="#i-' + id + '"/></svg>';
  };

  /**
   * Replace an element's contents with an icon, keeping the element.
   * The HUD markup declares `data-icon="treasury"` on its spans and this
   * swaps them all in at boot — so index.html stays readable and no view
   * module has to know which span holds which glyph.
   */
  Icons.hydrate = function (root) {
    var nodes = (root || document).querySelectorAll('[data-icon]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var id = node.dataset.icon;
      if (!Icons.has(id)) continue;
      node.textContent = '';
      node.appendChild(Icons.el(id));
    }
  };

  Mandate.Icons = Icons;
})(window.Mandate = window.Mandate || {});
