/* ============================================================================
 * src/ui/fullscreen.js — the "fill the screen" button.
 * ----------------------------------------------------------------------------
 * A browser tab always keeps its own chrome (the URL bar, at minimum) — no
 * amount of CSS can remove that; only the Fullscreen API can. And that API
 * can ONLY be invoked from a direct user gesture (a tap on a real button),
 * never automatically on load, which is why this exists as a visible control
 * rather than something main.js just calls at boot.
 *
 * iOS Safari has no Fullscreen API at all, so the button is feature-detected
 * and hidden entirely there — "Add to Home Screen" (wired up via
 * manifest.json) is the only route to a chrome-free view on iOS, and is also
 * the more permanent fix everywhere else: once installed, the browser chrome
 * never comes back, without needing this button at all.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Fullscreen = {};

  /* Safari (desktop and iOS) historically only exposes the vendor-prefixed
   * names, so every call below goes through these two small helpers rather
   * than assuming the unprefixed API exists. */
  function requestOn(el) {
    var fn = el.requestFullscreen || el.webkitRequestFullscreen;
    return fn ? fn.call(el) : Promise.reject(new Error('no fullscreen API'));
  }

  function exit() {
    var fn = document.exitFullscreen || document.webkitExitFullscreen;
    return fn ? fn.call(document) : Promise.reject(new Error('no fullscreen API'));
  }

  function current() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  Fullscreen.isSupported = function () {
    var el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen);
  };

  Fullscreen.build = function () {
    if (!Fullscreen.isSupported()) return;   /* button stays hidden (see CSS) */

    var btn = Mandate.Util.el('btn-fullscreen');
    if (!btn) return;
    btn.hidden = false;

    Mandate.View.onTap(btn, function () {
      if (current()) {
        exit();
      } else {
        /* #app rather than <html>: fullscreening the app root keeps the
         * element's own background and border-radius rules simple, and
         * avoids fullscreening content (like a stray browser extension
         * overlay) that isn't part of the game. */
        requestOn(Mandate.Util.el('app')).then(function () {
          /* Best-effort only: orientation lock requires fullscreen on most
           * browsers, is unsupported on several, and is entirely optional —
           * the CSS rotate-gate is the real cross-browser fallback. */
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(function () {});
          }
        }).catch(function () {
          /* Some browsers refuse the very first request in edge cases
           * (rapid double-taps, an already-pending request). Silently do
           * nothing rather than surface an error for a cosmetic feature. */
        });
      }
    });

    function sync() {
      var isFull = !!current();
      btn.setAttribute('aria-pressed', isFull ? 'true' : 'false');
      btn.setAttribute('aria-label', isFull ? 'Exit fullscreen' : 'Enter fullscreen');
    }

    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    sync();
  };

  Mandate.Fullscreen = Fullscreen;
})(window.Mandate = window.Mandate || {});
