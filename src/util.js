/* ============================================================================
 * src/util.js — tiny shared helpers. No game knowledge lives here.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Util = {};

  /** Keep a number inside [min, max]. Used constantly by the simulation. */
  Util.clamp = function (value, min, max) {
    return value < min ? min : value > max ? max : value;
  };

  /** 1234.7 -> "1,235". Resource counters are always shown as whole numbers
   *  even though the simulation tracks fractions internally. */
  Util.formatInt = function (value) {
    return Math.floor(value).toLocaleString('en-US');
  };

  /**
   * Per-day rates, signed: 12.3 -> "+12", 1.234 -> "+1.2", 0.0281 -> "+0.03".
   *
   * The precision has to adapt, because the three resources move at wildly
   * different speeds: Treasury changes by whole points a day while Political
   * Capital changes by hundredths. A fixed one decimal place would render the
   * Political Capital rate as a permanent "+0.0", which reads as "this
   * resource is broken" rather than "this resource is slow".
   *
   * A value that rounds to zero is shown unsigned, so a rate of -0.001 never
   * displays as the nonsense "-0.00".
   */
  Util.formatRate = function (value) {
    var abs = Math.abs(value);
    var decimals = abs >= 10 ? 0 : abs >= 1 ? 1 : 2;
    var text = value.toFixed(decimals);
    if (parseFloat(text) === 0) return (0).toFixed(decimals);
    return (value > 0 ? '+' : '') + text;
  };

  /**
   * Turn "days since the start date" into a display date.
   * We do the arithmetic with a real Date in UTC rather than hand-rolling a
   * calendar: leap years and month lengths come for free, and the simulation
   * itself never touches dates — it only counts ticks.
   */
  Util.dateFromDay = function (startDate, dayIndex) {
    var ms = Date.UTC(startDate.year, startDate.month - 1, startDate.day) + dayIndex * 86400000;
    return new Date(ms);
  };

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  Util.formatDate = function (date) {
    return date.getUTCDate() + ' ' + MONTHS[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
  };

  /** document.getElementById, shortened — used a lot by the view layer. */
  Util.el = function (id) {
    return document.getElementById(id);
  };

  Mandate.Util = Util;
})(window.Mandate = window.Mandate || {});
