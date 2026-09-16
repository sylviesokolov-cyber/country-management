/* ============================================================================
 * src/loop.js — the clock. Turns real time into simulation ticks.
 * ----------------------------------------------------------------------------
 * This is the only place that knows about real-world milliseconds.
 *
 * The pattern is a FIXED TIMESTEP ACCUMULATOR, and it is worth understanding
 * because nearly every game uses it:
 *
 *   - requestAnimationFrame fires at whatever rate the phone feels like
 *     (60fps, 120fps, 1fps if the browser is busy).
 *   - We add the elapsed real time to an accumulator.
 *   - While the accumulator holds a whole tick's worth of time, we run one
 *     tick and subtract it.
 *
 * So the simulation always advances in identical, discrete steps, no matter
 * how fast or janky rendering is. A day is a day. That also means the game is
 * deterministic and could later be replayed or fast-forwarded by simply
 * calling tick() in a loop.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  function GameLoop(options) {
    this.state = options.state;
    this.onTick = options.onTick || function () {};
    this.onRender = options.onRender || function () {};

    this._accumulator = 0;
    this._lastFrameAt = 0;
    this._rafId = null;
    this._frame = this._frame.bind(this);
  }

  GameLoop.prototype.start = function () {
    this._lastFrameAt = performance.now();
    this._rafId = requestAnimationFrame(this._frame);
  };

  GameLoop.prototype.stop = function () {
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  };

  /** Called when the app is backgrounded, so we don't bank hours of time. */
  GameLoop.prototype.resetClock = function () {
    this._lastFrameAt = performance.now();
    this._accumulator = 0;
  };

  GameLoop.prototype._frame = function (now) {
    var B = Mandate.BALANCE;
    var state = this.state;

    var elapsed = now - this._lastFrameAt;
    this._lastFrameAt = now;

    var msPerTick = B.time.msPerTick[state.speed] || 0;

    if (msPerTick > 0 && !state.gameOver) {
      this._accumulator += elapsed;

      /* Cap the catch-up. If the phone slept for a minute we do NOT want to
       * simulate a minute of game time in one frame — that would both freeze
       * the UI and cheat the player out of decisions. */
      var maxBanked = msPerTick * B.time.maxCatchUpTicks;
      if (this._accumulator > maxBanked) this._accumulator = maxBanked;

      while (this._accumulator >= msPerTick) {
        this._accumulator -= msPerTick;
        this.onTick(state);
      }
    } else {
      /* Paused: don't bank time, or unpausing would fast-forward. */
      this._accumulator = 0;
    }

    /* Render EVERY frame regardless of ticks. Rendering is a pure function of
     * state, so drawing more often than the sim runs is always safe. */
    this.onRender(state);

    this._rafId = requestAnimationFrame(this._frame);
  };

  Mandate.GameLoop = GameLoop;
})(window.Mandate = window.Mandate || {});
