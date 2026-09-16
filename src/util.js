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

  /** 1.234 -> "1.2" for per-day rates. */
  Util.formatRate = function (value) {
    return (value >= 0 ? '+' : '') + value.toFixed(1);
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
