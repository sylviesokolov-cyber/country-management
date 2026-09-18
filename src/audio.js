/* ============================================================================
 * src/audio.js — the score and the sound effects, generated at runtime.
 * ----------------------------------------------------------------------------
 * WHY THERE ARE NO AUDIO FILES IN THIS REPO
 *
 * Every other option was worse for this specific project:
 *
 *   - `<audio src="assets/music.ogg">` and `fetch()` + `decodeAudioData` are
 *     both blocked by CORS when index.html is opened straight off the
 *     filesystem. "Open the file on your phone and it works" is a hard
 *     requirement (DESIGN.md §4.7), and it is the same reason this project
 *     has no ES modules and no CDN font.
 *   - A licensable music bed good enough to loop for 55 minutes is 3-8MB per
 *     track. This entire game is currently under 400KB including six font
 *     faces. Phase 6 ships it as an Android app, where that is download size.
 *   - A fixed recording cannot follow the state of the country. Half the
 *     point of a score in this genre is that it tells you the map is going
 *     wrong before you have looked at the map.
 *
 * So the music is SYNTHESISED, in the Web Audio graph, every run. It costs
 * nothing to download, it is licence-free by construction, and — the actual
 * reason, not merely the convenient one — it is ADAPTIVE: one `tension` value
 * derived from the state of the country moves the tempo, the mode, the filter
 * and which layers are playing. A country sliding into revolt does not get
 * louder music, it gets a different arrangement.
 *
 * ARCHITECTURE
 *
 *   state -> Audio.observe()  -> tension (smoothed)  -> the arrangement
 *   log   -> Audio.observe()  -> one-shot cues
 *   taps  -> Audio.sfx(name)  -> one-shot cues
 *
 * This file is VIEW, not simulation: it only ever reads state, exactly like
 * src/ui/*. The sim does not know it exists, and a silent build of the game
 * (settings muted, or no Web Audio at all) plays identically.
 *
 * THE SCHEDULER is the standard Web Audio pattern ("A Tale of Two Clocks"): a
 * coarse `setInterval` wakes up every LOOKAHEAD_MS and schedules every note
 * that falls inside the next SCHEDULE_AHEAD seconds against `ctx.currentTime`.
 * Notes are therefore sample-accurate even though the timer that queued them
 * is not, which is the difference between a score and a metronome with a limp.
 * ========================================================================== */
(function (Mandate) {
  'use strict';

  var Audio = {};

  /* ------------------------------------------------------------------------
   * SETTINGS — their own localStorage key, deliberately NOT in the save.
   * Volume is a fact about the room the player is sitting in, not about the
   * run. It has to outlive the run, and survive "choose a new leader".
   * (Same reasoning as the per-leader best scores in src/state.js.)
   * ---------------------------------------------------------------------- */
  var SETTINGS_KEY = 'mandate:audio';

  var settings = {
    master: 0.75,
    music: 0.65,
    sfx: 0.9,
    haptics: true,
  };

  function loadSettings() {
    try {
      var raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      ['master', 'music', 'sfx'].forEach(function (key) {
        if (typeof saved[key] === 'number' && isFinite(saved[key])) {
          settings[key] = clamp01(saved[key]);
        }
      });
      if (typeof saved.haptics === 'boolean') settings.haptics = saved.haptics;
    } catch (err) {
      /* Corrupt or blocked storage just means default volumes. Never fatal:
       * the game has to boot on a phone in private mode. */
    }
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) { /* private mode — the session still honours the slider */ }
  }

  Audio.settings = settings;

  /** Read a setting. */
  Audio.get = function (key) { return settings[key]; };

  /**
   * Write a setting and apply it immediately, so dragging a slider is audible
   * while it is being dragged rather than after it is let go.
   */
  Audio.set = function (key, value) {
    if (key === 'haptics') settings.haptics = !!value;
    else if (key in settings) settings[key] = clamp01(value);
    else return;
    saveSettings();
    applyLevels();
    /* Dragging the music slider with the music off teaches nothing; an audible
     * blip on the SFX slider is the only way to set it deliberately. */
    if (key === 'sfx' || key === 'master') Audio.sfx('tick');
  };

  /* ------------------------------------------------------------------------
   * THE GRAPH
   *
   *   music voices -> musicBus -----------------\
   *                      \-> musicSend -> verb --+-> master -> limiter -> out
   *   sfx voices   -> sfxBus   -------------------/
   *
   * One limiter across the whole output because the arrangement is additive:
   * at full crisis there are a dozen voices running, and a phone speaker
   * clipping is indistinguishable from a bug.
   * ---------------------------------------------------------------------- */
  var ctx = null;
  var master, limiter, musicBus, sfxBus, verb, musicSend, sfxSend;
  var noiseBuffer = null;
  var started = false;
  var failed = false;

  /** True once the browser has actually given us a running audio clock. */
  Audio.isRunning = function () {
    return !!ctx && ctx.state === 'running';
  };

  Audio.isAvailable = function () {
    return !failed && !!(window.AudioContext || window.webkitAudioContext);
  };

  function build() {
    if (ctx || failed) return;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) { failed = true; return; }

    try {
      ctx = new Ctor();
    } catch (err) {
      failed = true;
      return;
    }

    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;
    limiter.connect(ctx.destination);

    master = ctx.createGain();
    master.connect(limiter);

    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.connect(master);
    sfxBus.connect(master);

    verb = ctx.createConvolver();
    verb.buffer = impulseResponse(3.4, 2.6);
    verb.connect(master);

    /* Sends rather than inserts: the dry signal keeps its transient (a tap
     * has to feel instant) while the tail puts everything in the same room. */
    musicSend = ctx.createGain();
    musicSend.gain.value = 0.42;
    musicBus.connect(musicSend);
    musicSend.connect(verb);

    sfxSend = ctx.createGain();
    sfxSend.gain.value = 0.16;
    sfxBus.connect(sfxSend);
    sfxSend.connect(verb);

    noiseBuffer = makeNoise(2);
    applyLevels();
  }

  function applyLevels() {
    if (!ctx) return;
    var now = ctx.currentTime;
    /* Short ramps rather than assignment: a jumped gain value is a click. */
    master.gain.setTargetAtTime(settings.master, now, 0.02);
    musicBus.gain.setTargetAtTime(settings.music * musicDuck * sceneGain, now, 0.05);
    sfxBus.gain.setTargetAtTime(settings.sfx * 0.9, now, 0.02);
  }

  /**
   * A convolution reverb needs an impulse response, and we have no files —
   * so here is one: exponentially decaying stereo noise, which is the
   * textbook synthetic hall. Slightly different noise per channel is what
   * makes it read as a space rather than as a mono echo.
   */
  function impulseResponse(seconds, decay) {
    var rate = ctx.sampleRate;
    var length = Math.floor(rate * seconds);
    var buffer = ctx.createBuffer(2, length, rate);
    for (var ch = 0; ch < 2; ch++) {
      var data = buffer.getChannelData(ch);
      for (var i = 0; i < length; i++) {
        var t = i / length;
        /* The first few milliseconds are thinned out so the tail sounds like
         * a hall rather than like a gated snare. */
        var early = Math.min(1, i / (rate * 0.012));
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * early;
      }
    }
    return buffer;
  }

  function makeNoise(seconds) {
    var length = Math.floor(ctx.sampleRate * seconds);
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /* ------------------------------------------------------------------------
   * UNLOCKING
   * Every mobile browser refuses to start an AudioContext outside a user
   * gesture, and a suspended context silently swallows everything scheduled
   * into it. So: build on the first gesture of any kind, and re-resume on
   * every gesture afterwards, because iOS suspends again whenever it feels
   * like it (returning from the app switcher, ending a phone call).
   * ---------------------------------------------------------------------- */
  Audio.install = function () {
    loadSettings();

    var events = ['pointerdown', 'keydown', 'touchend'];
    events.forEach(function (type) {
      document.addEventListener(type, unlock, { passive: true });
    });

    /* A backgrounded tab must go quiet — a game still humming in a pocket is
     * a battery complaint and an App Store review. */
    document.addEventListener('visibilitychange', function () {
      if (!ctx) return;
      if (document.hidden) {
        try { ctx.suspend(); } catch (err) { /* already suspended */ }
      } else {
        try { ctx.resume(); } catch (err) { /* resumed on next gesture */ }
      }
    });
  };

  function unlock() {
    build();
    if (!ctx) return;
    if (ctx.state !== 'running') {
      try { ctx.resume(); } catch (err) { return; }
    }
    if (!started) {
      started = true;
      startMusic();
    }
  }
  Audio.unlock = unlock;

  /* ------------------------------------------------------------------------
   * VOICE HELPERS
   * Everything below is built out of these four. Kept deliberately small:
   * a synth engine with a hundred parameters is a synth engine nobody tunes.
   * ---------------------------------------------------------------------- */

  /**
   * One oscillator with an ADSR-ish envelope, optionally through a lowpass.
   * `opts.slide` bends the pitch to a second frequency over the note, which
   * is what makes a timpani a timpani rather than a beep.
   */
  function tone(bus, opts) {
    if (!ctx) return;
    var when = opts.when || ctx.currentTime;
    var dur = opts.dur || 0.3;
    var osc = ctx.createOscillator();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, when);
    if (opts.slide) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, opts.slide), when + (opts.slideTime || dur));
    }
    if (opts.detune) osc.detune.setValueAtTime(opts.detune, when);

    var gain = ctx.createGain();
    var peak = opts.gain === undefined ? 0.2 : opts.gain;
    var attack = opts.attack === undefined ? 0.01 : opts.attack;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
    /* Exponential release: linear fades sound like someone turning a knob. */
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    var node = osc;
    if (opts.cutoff) {
      var filter = ctx.createBiquadFilter();
      filter.type = opts.filterType || 'lowpass';
      filter.frequency.setValueAtTime(opts.cutoff, when);
      if (opts.cutoffTo) {
        filter.frequency.exponentialRampToValueAtTime(
          Math.max(40, opts.cutoffTo), when + dur);
      }
      filter.Q.value = opts.q === undefined ? 1 : opts.q;
      node.connect(filter);
      node = filter;
    }
    node.connect(gain);
    gain.connect(opts.pan === undefined ? bus : panned(bus, opts.pan, when, dur));

    osc.start(when);
    osc.stop(when + dur + 0.05);
    return gain;
  }

  /** A stereo position for one note. Widens the pads; keeps the HUD centred. */
  function panned(bus, value, when, dur) {
    if (!ctx.createStereoPanner) return bus;
    var pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(value, when);
    pan.connect(bus);
    /* Nothing holds a reference to it; it is collected with the note. */
    return pan;
  }

  /** Filtered noise — transients, rumble, breath, the snare in a war drum. */
  function noise(bus, opts) {
    if (!ctx || !noiseBuffer) return;
    var when = opts.when || ctx.currentTime;
    var dur = opts.dur || 0.2;

    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    var filter = ctx.createBiquadFilter();
    filter.type = opts.filterType || 'bandpass';
    filter.frequency.setValueAtTime(opts.freq || 900, when);
    if (opts.freqTo) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(40, opts.freqTo), when + dur);
    }
    filter.Q.value = opts.q === undefined ? 0.8 : opts.q;

    var gain = ctx.createGain();
    var peak = opts.gain === undefined ? 0.12 : opts.gain;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak),
      when + (opts.attack === undefined ? 0.006 : opts.attack));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    src.start(when);
    src.stop(when + dur + 0.05);
  }

  /**
   * Two-operator FM. One sine modulating another's frequency is the cheapest
   * way to get a struck-metal timbre — bells, the research chime, the coin
   * cluster on a Treasury spend. `ratio` picks the character: 2 is hollow and
   * woody, 3.5 is a handbell, 7 is glassy.
   */
  function fm(bus, opts) {
    if (!ctx) return;
    var when = opts.when || ctx.currentTime;
    var dur = opts.dur || 0.6;

    var carrier = ctx.createOscillator();
    carrier.frequency.setValueAtTime(opts.freq, when);

    var mod = ctx.createOscillator();
    mod.frequency.setValueAtTime(opts.freq * (opts.ratio || 3.5), when);

    var modGain = ctx.createGain();
    var index = opts.index === undefined ? 300 : opts.index;
    modGain.gain.setValueAtTime(index, when);
    /* The modulation index decaying faster than the note is what makes a
     * struck sound: bright on the strike, pure as it rings out. */
    modGain.gain.exponentialRampToValueAtTime(1, when + dur * 0.5);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    var gain = ctx.createGain();
    var peak = opts.gain === undefined ? 0.18 : opts.gain;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak),
      when + (opts.attack === undefined ? 0.005 : opts.attack));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    carrier.connect(gain);
    gain.connect(opts.pan === undefined ? bus : panned(bus, opts.pan, when, dur));

    carrier.start(when);
    mod.start(when);
    carrier.stop(when + dur + 0.05);
    mod.stop(when + dur + 0.05);
  }

  /** MIDI note number -> Hz. Everything musical below is written in MIDI. */
  function hz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function ramp(value, lo, hi) {
    return clamp01((value - lo) / (hi - lo));
  }

  /* ------------------------------------------------------------------------
   * THE SCORE
   *
   * D is the tonic all run, because the mode changing under a fixed tonic is
   * what makes the country's decline audible as the SAME piece going wrong,
   * rather than as a different track fading in. Three modes, in order of how
   * much trouble the government is in:
   *
   *   calm    D ionian    — open, warm, a fifth in the bass
   *   uneasy  D aeolian   — the flattened third and sixth; nothing resolves
   *   crisis  D phrygian  — the flattened SECOND, which is the sound of
   *                         something being wrong on purpose
   *
   * Progressions are written as scale DEGREES, not chords, so the same
   * progression re-harmonises itself when the mode changes.
   * ---------------------------------------------------------------------- */
  var TONIC = 50;                 /* D3 */

  var MODES = {
    calm:   { scale: [0, 2, 4, 5, 7, 9, 11], progression: [0, 5, 3, 4], bright: 1.0 },
    uneasy: { scale: [0, 2, 3, 5, 7, 8, 10], progression: [0, 5, 3, 6], bright: 0.7 },
    crisis: { scale: [0, 1, 3, 5, 7, 8, 10], progression: [0, 6, 1, 6], bright: 0.45 },
  };

  /* Bars are 4 beats; a phrase is 4 bars, one chord per bar. The mode is only
   * allowed to change at a phrase boundary — a key change landing mid-bar
   * reads as a bug even to people who cannot name what happened. */
  var BEATS_PER_BAR = 4;
  var BARS_PER_PHRASE = 4;
  var LOOKAHEAD_MS = 25;
  var SCHEDULE_AHEAD = 0.35;

  var timer = null;
  var nextBeatTime = 0;
  var beat = 0;                    /* absolute beat counter since music start */
  var mode = MODES.calm;
  var modeName = 'calm';

  /* `tension` is the whole adaptive layer in one number: 0 is a calm country,
   * 1 is a country in flames. It is SMOOTHED toward its target, because the
   * arrangement following the map frame-by-frame would flutter. */
  var tension = 0;
  var tensionTarget = 0;

  /* Scene gain lets the menu and the end-of-term screen sit under the run
   * without touching the player's music slider. */
  var sceneGain = 1;
  var scene = 'menu';
  var musicDuck = 1;
  var duckUntil = 0;

  /* Set by observe(): a paused game gets a thinner arrangement. The clock
   * stopping is a state the player should be able to HEAR, because the most
   * common way to lose a run to a phone is to put it down while it is
   * running. */
  var paused = false;

  function startMusic() {
    if (!ctx || timer) return;
    nextBeatTime = ctx.currentTime + 0.15;
    beat = 0;
    timer = window.setInterval(schedule, LOOKAHEAD_MS);
  }

  function beatSeconds() {
    /* 58bpm at rest, 82 at full crisis. Faster music at a crisis is the
     * oldest trick in the genre and it works; more than ~85 would turn an
     * ambient score into an action one, which this game is not. */
    var bpm = 58 + tension * 24;
    return 60 / bpm;
  }

  function schedule() {
    if (!ctx || ctx.state !== 'running') return;

    /* Smooth tension toward its target roughly once per scheduler wake-up.
     * ~12 seconds to travel the full range: slow enough that a single bad
     * day does not change the music, fast enough that a spreading revolt is
     * audible within a phrase. */
    tension += (tensionTarget - tension) * 0.02;

    /* Release any event duck that has expired. */
    if (musicDuck < 1 && ctx.currentTime > duckUntil) {
      musicDuck = 1;
      applyLevels();
    }

    while (nextBeatTime < ctx.currentTime + SCHEDULE_AHEAD) {
      playBeat(beat, nextBeatTime);
      nextBeatTime += beatSeconds();
      beat++;
    }
  }

  /**
   * One beat of the arrangement. Everything is decided from `beat` and
   * `tension` — there is no sequencer data, so the score never repeats
   * exactly and never needs authoring.
   */
  function playBeat(index, when) {
    var inBar = index % BEATS_PER_BAR;
    var bar = Math.floor(index / BEATS_PER_BAR);
    var barInPhrase = bar % BARS_PER_PHRASE;

    /* --- mode selection, at phrase boundaries only -------------------- */
    if (inBar === 0 && barInPhrase === 0) {
      var want = tension > 0.62 ? 'crisis' : tension > 0.3 ? 'uneasy' : 'calm';
      if (want !== modeName) {
        modeName = want;
        mode = MODES[want];
      }
    }

    var t = tension;
    /* A paused game keeps the drone and loses everything that moves. */
    var motion = paused ? 0.25 : 1;
    var level = sceneGain;

    var degree = mode.progression[barInPhrase % mode.progression.length];
    var chord = triad(degree);

    /* --- 1. the drone. Always present, all run, in every scene. ------- */
    if (inBar === 0) {
      var droneDur = beatSeconds() * BEATS_PER_BAR * 1.1;
      /* Root and fifth in the bass. The fifth detunes flat as tension rises,
       * which sours the whole bed by a few cents without ever being a note
       * anybody can point at. */
      tone(musicBus, {
        when: when, freq: hz(TONIC - 12), dur: droneDur, type: 'sawtooth',
        gain: 0.055 * level, attack: droneDur * 0.35,
        cutoff: 180 + (1 - t) * 420, q: 3, pan: -0.15,
      });
      tone(musicBus, {
        when: when, freq: hz(TONIC - 5), dur: droneDur, type: 'sawtooth',
        gain: 0.04 * level, attack: droneDur * 0.4, detune: -t * 14,
        cutoff: 160 + (1 - t) * 380, q: 3, pan: 0.15,
      });
    }

    /* --- 2. the pad: the chord itself, one swell per bar -------------- */
    if (inBar === 0) {
      var padDur = beatSeconds() * BEATS_PER_BAR * 1.05;
      var padGain = 0.032 * level * (0.7 + mode.bright * 0.3);
      chord.forEach(function (note, i) {
        tone(musicBus, {
          when: when + i * 0.03, freq: hz(note), dur: padDur, type: 'triangle',
          gain: padGain, attack: padDur * 0.45,
          cutoff: 700 + mode.bright * 1600 - t * 300, q: 0.7,
          pan: (i - 1) * 0.35,
        });
        /* A second voice a cent or two off gives the pad a chorus without a
         * chorus node — three oscillators is cheaper than a delay line. */
        tone(musicBus, {
          when: when + i * 0.03, freq: hz(note), dur: padDur, type: 'triangle',
          gain: padGain * 0.6, attack: padDur * 0.5, detune: 7,
          cutoff: 600 + mode.bright * 1400, q: 0.7, pan: (1 - i) * 0.35,
        });
      });
    }

    /* --- 3. bells: the melody. CALM ONLY. ----------------------------- *
     * The melody is the first thing to go as the country slides, which is
     * the single most effective thing in this whole file: the player hears
     * the tune stop before they notice the third province cross the line. */
    var bellLevel = (1 - ramp(t, 0.15, 0.55)) * motion;
    if (bellLevel > 0.05 && (inBar === 0 || inBar === 2 || (inBar === 3 && bar % 2))) {
      /* Pentatonic-ish picks out of the current mode, up two octaves. */
      var pick = mode.scale[(bar * 3 + inBar * 2 + index) % mode.scale.length];
      var octave = 24 + (index % 5 === 0 ? 12 : 0);
      fm(musicBus, {
        when: when + (inBar === 0 ? 0 : 0.04), freq: hz(TONIC + pick + octave),
        dur: 1.8 + Math.random() * 1.2, ratio: 3.51,
        index: 180 * mode.bright, gain: 0.085 * bellLevel * level,
        pan: ((index % 3) - 1) * 0.4,
      });
    }

    /* --- 4. the drum: enters as the country stops being calm ---------- */
    var drumLevel = ramp(t, 0.22, 0.6) * motion;
    if (drumLevel > 0.04 && (inBar === 0 || (inBar === 2 && t > 0.45))) {
      timpani(when, 0.16 * drumLevel * level, TONIC - 24);
    }

    /* --- 5. low brass cluster: crisis only ---------------------------- *
     * Root and flat-second together — the interval the phrygian mode is
     * for. It only ever appears when provinces are in revolt. */
    var brassLevel = ramp(t, 0.58, 0.9) * motion;
    if (brassLevel > 0.05 && inBar === 0 && bar % 2 === 0) {
      var brassDur = beatSeconds() * BEATS_PER_BAR * 1.6;
      [0, 1].forEach(function (offset, i) {
        tone(musicBus, {
          when: when, freq: hz(TONIC - 12 + offset), dur: brassDur,
          type: 'sawtooth', gain: 0.05 * brassLevel * level,
          attack: brassDur * 0.3, cutoff: 300, cutoffTo: 120, q: 4,
          pan: i ? 0.3 : -0.3,
        });
      });
    }

    /* --- 6. the heartbeat: the last 20% before a government falls ----- */
    var pulseLevel = ramp(t, 0.78, 1) * motion;
    if (pulseLevel > 0.05 && inBar % 2 === 0) {
      tone(musicBus, {
        when: when, freq: 62, slide: 38, slideTime: 0.28, dur: 0.34,
        type: 'sine', gain: 0.22 * pulseLevel * level, attack: 0.008,
      });
    }
  }

  /** A struck drum: pitched sine falling fast, plus a noise skin transient. */
  function timpani(when, gain, midi) {
    tone(musicBus, {
      when: when, freq: hz(midi), slide: hz(midi) * 0.72, slideTime: 0.25,
      dur: 0.9, type: 'sine', gain: gain, attack: 0.006,
    });
    noise(musicBus, {
      when: when, freq: 240, freqTo: 90, dur: 0.14,
      gain: gain * 0.5, q: 0.6,
    });
  }

  /** The triad on a scale degree, voiced around the tonic's octave. */
  function triad(degree) {
    var scale = mode.scale;
    var notes = [];
    for (var i = 0; i < 3; i++) {
      var step = degree + i * 2;
      var octaves = Math.floor(step / scale.length);
      notes.push(TONIC + 12 + scale[step % scale.length] + octaves * 12);
    }
    return notes;
  }

  /* ------------------------------------------------------------------------
   * SCENES
   * The run is not the only place the game makes noise. The leader screen and
   * the end-of-term summary each get their own treatment, set from main.js.
   * ---------------------------------------------------------------------- */
  Audio.setScene = function (name) {
    if (scene === name) return;
    scene = name;
    if (name === 'menu') {
      sceneGain = 0.75;
      tensionTarget = 0.12;
      tension = 0.12;
    } else if (name === 'run') {
      sceneGain = 1;
    } else if (name === 'won') {
      sceneGain = 0.8;
      tensionTarget = 0;
    } else if (name === 'lost') {
      sceneGain = 0.8;
      /* Losing does not get triumphant calm music. It stays in the mode the
       * run ended in, quietly. */
      tensionTarget = Math.max(0.45, tension);
    }
    applyLevels();
  };

  /**
   * Duck the music under something that must be heard over it.
   * Events take 70% for a couple of seconds; the end-of-run stings take more.
   */
  Audio.duck = function (amount, seconds) {
    if (!ctx) return;
    musicDuck = Math.min(musicDuck, clamp01(1 - amount));
    duckUntil = Math.max(duckUntil, ctx.currentTime + (seconds || 2));
    applyLevels();
  };

  /* ------------------------------------------------------------------------
   * OBSERVING THE GAME
   *
   * Called from the render pass every frame. It does two things and neither
   * of them touches state:
   *
   *   1. derives `tension` from the country, and
   *   2. turns new RUN LOG entries into one-shot cues.
   *
   * Reading the log rather than having the sim call us is deliberate, and it
   * is the same trick src/ui/alerts.js uses: the sim stays DOM-free and
   * audio-free, and anything worth announcing is already worth logging. A
   * new event kind gets a sound by appearing in LOG_CUES, with no sim edit.
   * ---------------------------------------------------------------------- */
  var lastLogDay = -1;
  var lastLogText = null;
  var lastDay = -1;
  var lastYear = -1;
  var lastEventKey = null;
  var announcedEnding = false;

  var LOG_CUES = {
    revolt: 'revolt',
    order: 'order',
    tech: 'research',
    policy: 'policy',
    effect: 'alert',
    win: null,      /* handled by the end-of-run sting, which is longer */
    lose: null,
  };

  Audio.observe = function (state) {
    if (!ctx || !state) return;

    paused = state.speed === 0 && !state.gameOver;

    /* --- an event arriving, and the run ending -------------------------
     * Both are read off state rather than pushed from main.js, for the same
     * reason the log cues are: the one place that knows a run has ended is
     * the state, and a second place that thought it knew would eventually
     * disagree with it. */
    var pending = state.events.pending;
    var eventKey = pending ? pending.eventId + '@' + pending.day : null;
    if (eventKey !== lastEventKey) {
      lastEventKey = eventKey;
      if (eventKey) { Audio.duck(0.55, 3); Audio.sfx('event'); }
    }

    if (state.gameOver && !announcedEnding) {
      announcedEnding = true;
      Audio.sfx(state.won ? 'win' : 'lose');
      Audio.setScene(state.won ? 'won' : 'lost');
    }

    if (state.day !== lastDay) {
      lastDay = state.day;
      tensionTarget = tensionOf(state);

      /* A soft marker at each in-game new year. Ten of them in a term: rare
       * enough to be a landmark rather than a metronome, and it is the one
       * thing that gives a 55-minute run a sense of pace. */
      var year = Math.floor(state.day / 365);
      if (year !== lastYear) {
        if (lastYear >= 0 && !state.gameOver) Audio.sfx('year');
        lastYear = year;
      }
    }

    /* New log entries since the last frame. The log is capped and splices its
     * own head off, so we compare against the last entry we SAW rather than
     * against an index — the same reason alerts.js does it this way. */
    var log = state.log;
    if (!log || !log.length) return;
    var tail = log[log.length - 1];
    if (tail.day === lastLogDay && tail.text === lastLogText) return;

    /* First sight of this run's log — a resumed save arrives with a hundred
     * entries in it, and replaying ten years of history as cues on the boot
     * frame would be a wall of noise. Prime and say nothing. */
    if (lastLogDay === -1) {
      lastLogDay = tail.day;
      lastLogText = tail.text;
      return;
    }

    /* Walk back to find everything newer than what we last announced, so a
     * frame that spans several ticks (2x speed, or catch-up) is not silent
     * about all but the last of them. */
    var start = log.length - 1;
    while (start > 0 && log[start - 1].day >= lastLogDay &&
           !(log[start - 1].day === lastLogDay && log[start - 1].text === lastLogText)) {
      start--;
    }
    lastLogDay = tail.day;
    lastLogText = tail.text;

    var fired = Object.create(null);
    for (var i = start; i < log.length; i++) {
      var cue = LOG_CUES[log[i].kind];
      /* Two provinces rising on the same tick is one cue, not two on top of
       * each other. */
      if (cue && !fired[cue]) {
        fired[cue] = true;
        Audio.sfx(cue);
      }
    }
  };

  /**
   * Swallow the end-of-run sting for a run that is ending on the player's own
   * terms. Resigning from the Settings tab is still a lost run as far as the
   * simulation is concerned, but a defeat fanfare over a button the player
   * deliberately pressed reads as the game being cross with them.
   */
  Audio.silenceEnding = function () {
    announcedEnding = true;
  };

  /** Called once when a run starts, so last term's log is not re-announced. */
  Audio.reset = function () {
    lastLogDay = -1;
    lastLogText = null;
    lastDay = -1;
    lastYear = -1;
    lastEventKey = null;
    announcedEnding = false;
    tension = 0.15;
    tensionTarget = 0.15;
  };

  /**
   * How much trouble the country is in, 0..1.
   *
   * Weighted so that REVOLTS dominate — they are the failure state the whole
   * Phase 5 crisis design is built around — with unrest, a spent Mandate and
   * an unpaid bill all contributing. It is not a copy of the Mandate bill on
   * purpose: the music is about how the country FEELS, and a government can
   * be comfortably ahead on the clock while three provinces burn.
   */
  function tensionOf(state) {
    var d = state.derived || {};
    var regions = (state.regions && state.regions.length) || 16;
    var B = Mandate.BALANCE;

    var unrest = ramp((d.unstableRegions || 0) / regions, 0, 0.4);
    var revolt = ramp((d.regionsInRevolt || 0) / regions, 0, 0.2);
    var clock = 1 - ramp(state.mandate / (B.mandate.max || 100), 0.12, 0.55);
    var broke = d.austerity ? 0.25 : 0;

    var t = unrest * 0.3 + revolt * 0.45 + clock * 0.3 + broke;
    return clamp01(t);
  }

  /* ------------------------------------------------------------------------
   * SOUND EFFECTS
   *
   * Every cue is a function of (bus, now). They are written to be recognised
   * rather than admired: a confirm rises, a refusal falls, spending money is
   * metallic, troops are percussive, and anything to do with a province in
   * revolt is low and dirty. A player should be able to tell what happened
   * with the phone face down.
   * ---------------------------------------------------------------------- */
  var CUES = {
    /* --- interface ---------------------------------------------------- */
    tick: function (bus, now) {
      tone(bus, { when: now, freq: 2100, dur: 0.035, type: 'triangle', gain: 0.05 });
    },
    tap: function (bus, now) {
      tone(bus, { when: now, freq: 620, dur: 0.06, type: 'triangle', gain: 0.09,
        cutoff: 2600, q: 1 });
      noise(bus, { when: now, freq: 3200, dur: 0.02, gain: 0.03 });
    },
    open: function (bus, now) {
      tone(bus, { when: now, freq: 320, slide: 620, slideTime: 0.14, dur: 0.18,
        type: 'triangle', gain: 0.07 });
      noise(bus, { when: now, freq: 700, freqTo: 2400, dur: 0.16, gain: 0.035 });
    },
    close: function (bus, now) {
      tone(bus, { when: now, freq: 560, slide: 280, slideTime: 0.12, dur: 0.16,
        type: 'triangle', gain: 0.06 });
      noise(bus, { when: now, freq: 2200, freqTo: 600, dur: 0.14, gain: 0.03 });
    },
    deny: function (bus, now) {
      /* Dull, low, and slightly detuned against itself: the sound of a door
       * that did not open. Never harsh — it fires on mistaps. */
      tone(bus, { when: now, freq: 150, dur: 0.16, type: 'square', gain: 0.07,
        cutoff: 500, q: 2 });
      tone(bus, { when: now + 0.02, freq: 142, dur: 0.14, type: 'square',
        gain: 0.05, cutoff: 420, q: 2 });
    },

    /* --- the three region actions, each a different KIND of sound ----- */
    invest: function (bus, now) {
      /* Construction: two wood knocks and a rising fifth. */
      noise(bus, { when: now, freq: 420, freqTo: 180, dur: 0.09, gain: 0.1, q: 1.4 });
      noise(bus, { when: now + 0.1, freq: 380, freqTo: 160, dur: 0.1, gain: 0.08, q: 1.4 });
      fm(bus, { when: now + 0.06, freq: hz(62), dur: 0.7, ratio: 2, index: 120, gain: 0.1 });
      fm(bus, { when: now + 0.18, freq: hz(69), dur: 0.9, ratio: 2, index: 120, gain: 0.09 });
    },
    works: function (bus, now) {
      /* A hammer, twice, and warmer than Invest — Public Works is visible. */
      noise(bus, { when: now, freq: 900, freqTo: 300, dur: 0.07, gain: 0.11, q: 1 });
      noise(bus, { when: now + 0.13, freq: 820, freqTo: 280, dur: 0.08, gain: 0.09, q: 1 });
      tone(bus, { when: now + 0.02, freq: hz(57), dur: 0.5, type: 'triangle',
        gain: 0.09, cutoff: 1400 });
    },
    garrison: function (bus, now) {
      /* A drum and a snare roll. Troops arriving is the least subtle thing
       * the player can do and it should sound like it. */
      timpani(now, 0.2, 38);
      noise(bus, { when: now + 0.04, freq: 1800, freqTo: 600, dur: 0.3,
        gain: 0.07, q: 0.5 });
      tone(bus, { when: now + 0.1, freq: hz(50), dur: 0.6, type: 'sawtooth',
        gain: 0.07, cutoff: 700, cutoffTo: 200, q: 3 });
    },
    withdraw: function (bus, now) {
      noise(bus, { when: now, freq: 1400, freqTo: 400, dur: 0.35, gain: 0.05, q: 0.5 });
      tone(bus, { when: now, freq: hz(52), slide: hz(45), slideTime: 0.3,
        dur: 0.4, type: 'triangle', gain: 0.07, cutoff: 900 });
    },
    relief: function (bus, now) {
      /* A warm major chord swelling up — the one unambiguously kind sound in
       * the game, because it is the only action that reaches a revolt. */
      [62, 66, 69, 74].forEach(function (note, i) {
        tone(bus, { when: now + i * 0.05, freq: hz(note), dur: 1.1,
          type: 'triangle', gain: 0.06, attack: 0.12, cutoff: 2200,
          pan: (i - 1.5) * 0.3 });
      });
    },
    spend: function (bus, now) {
      /* Treasury leaving the building: three metallic FM pings, fast. */
      [0, 0.045, 0.085].forEach(function (offset, i) {
        fm(bus, { when: now + offset, freq: hz(84 + i * 3), dur: 0.35,
          ratio: 7.1, index: 420, gain: 0.055, pan: (i - 1) * 0.35 });
      });
    },

    /* --- management --------------------------------------------------- */
    research: function (bus, now) {
      /* A handbell arpeggio. Research landing is the best news in the game
       * that is not the end of the term. */
      [74, 78, 81, 86].forEach(function (note, i) {
        fm(bus, { when: now + i * 0.11, freq: hz(note), dur: 1.6 - i * 0.15,
          ratio: 3.51, index: 260, gain: 0.08, pan: (i - 1.5) * 0.25 });
      });
    },
    hire: function (bus, now) {
      fm(bus, { when: now, freq: hz(69), dur: 0.5, ratio: 2, index: 150, gain: 0.09 });
      fm(bus, { when: now + 0.09, freq: hz(76), dur: 0.7, ratio: 2, index: 150, gain: 0.08 });
    },
    policy: function (bus, now) {
      /* A stamp on a document: a thud with a paper transient. */
      noise(bus, { when: now, freq: 260, freqTo: 120, dur: 0.12, gain: 0.12, q: 1.2 });
      noise(bus, { when: now + 0.01, freq: 4200, dur: 0.05, gain: 0.04 });
      tone(bus, { when: now, freq: hz(45), dur: 0.35, type: 'sine', gain: 0.1 });
    },

    /* --- the country talking back ------------------------------------- */
    event: function (bus, now) {
      /* Three bells over a low swell. The clock has stopped; something is
       * being asked of you. */
      [69, 74, 78].forEach(function (note, i) {
        fm(bus, { when: now + i * 0.13, freq: hz(note), dur: 2.2,
          ratio: 2.01, index: 300, gain: 0.09, pan: (i - 1) * 0.3 });
      });
      tone(bus, { when: now, freq: hz(38), dur: 2.4, type: 'sawtooth',
        gain: 0.07, attack: 0.5, cutoff: 260, q: 3 });
    },
    alert: function (bus, now) {
      /* Two notes, falling. Deliberately quiet: toasts are ambient and one
       * that stabs at the player would break the rule they exist under. */
      tone(bus, { when: now, freq: hz(76), dur: 0.22, type: 'triangle',
        gain: 0.07, cutoff: 2600 });
      tone(bus, { when: now + 0.14, freq: hz(71), dur: 0.35, type: 'triangle',
        gain: 0.06, cutoff: 2200 });
    },
    revolt: function (bus, now) {
      /* The worst thing that can happen to a province, and the worst sound
       * in the game: a low brass cluster, a war drum, and rubble. */
      timpani(now, 0.26, 33);
      [38, 39].forEach(function (note, i) {
        tone(bus, { when: now + i * 0.02, freq: hz(note), dur: 2.6,
          type: 'sawtooth', gain: 0.1, attack: 0.08,
          cutoff: 420, cutoffTo: 140, q: 5, pan: i ? 0.35 : -0.35 });
      });
      noise(bus, { when: now + 0.05, freq: 300, freqTo: 70, dur: 1.8,
        gain: 0.07, q: 0.4 });
      Audio.duck(0.4, 2.2);
    },
    order: function (bus, now) {
      /* A rising fifth that actually resolves — the only cue that does. */
      tone(bus, { when: now, freq: hz(50), dur: 0.5, type: 'triangle',
        gain: 0.09, cutoff: 1800 });
      tone(bus, { when: now + 0.16, freq: hz(57), dur: 0.7, type: 'triangle',
        gain: 0.08, cutoff: 2000 });
      fm(bus, { when: now + 0.32, freq: hz(74), dur: 1.4, ratio: 3.51,
        index: 200, gain: 0.08 });
    },
    year: function (bus, now) {
      /* A distant clock. One per in-game year. */
      fm(bus, { when: now, freq: hz(57), dur: 2.2, ratio: 2.76, index: 200,
        gain: 0.055 });
    },

    /* --- the end of a run --------------------------------------------- */
    win: function (bus, now) {
      Audio.duck(0.8, 5);
      /* A major fanfare over a timpani roll. Ten years is worth a fanfare. */
      [62, 66, 69, 74, 78, 81].forEach(function (note, i) {
        tone(bus, { when: now + i * 0.13, freq: hz(note), dur: 2.4 - i * 0.15,
          type: 'triangle', gain: 0.1, attack: 0.02, cutoff: 3000,
          pan: (i % 3 - 1) * 0.3 });
        fm(bus, { when: now + i * 0.13, freq: hz(note + 12), dur: 1.8,
          ratio: 3.51, index: 240, gain: 0.05 });
      });
      [0, 0.18, 0.36, 0.54].forEach(function (offset) {
        timpani(now + offset, 0.14, 38);
      });
    },
    lose: function (bus, now) {
      Audio.duck(0.85, 6);
      /* Descending, minor, and it does not land anywhere. */
      [69, 67, 64, 62].forEach(function (note, i) {
        tone(bus, { when: now + i * 0.28, freq: hz(note), dur: 2.6,
          type: 'sawtooth', gain: 0.07, attack: 0.1,
          cutoff: 700, cutoffTo: 200, q: 3, pan: (i % 2 ? 0.3 : -0.3) });
      });
      timpani(now, 0.2, 33);
      timpani(now + 1.1, 0.16, 31);
      noise(bus, { when: now, freq: 200, freqTo: 60, dur: 3.5, gain: 0.05, q: 0.4 });
    },
    leader: function (bus, now) {
      /* Taking office: a single confident chord. */
      [50, 57, 62, 66].forEach(function (note, i) {
        tone(bus, { when: now + i * 0.04, freq: hz(note), dur: 1.8,
          type: 'triangle', gain: 0.075, attack: 0.05, cutoff: 2400,
          pan: (i - 1.5) * 0.3 });
      });
      timpani(now, 0.16, 38);
    },
  };

  /* Which cues shake the phone, and how. Short and sparse on purpose: a phone
   * that buzzes on every tap is a phone with haptics turned off. */
  var HAPTICS = {
    invest: 12, works: 12, garrison: [18, 40, 18], relief: 14,
    research: [10, 30, 10], policy: 16, deny: [8, 30, 8],
    event: [20, 60, 20], revolt: [40, 80, 40, 80, 60], order: [12, 40, 12],
    win: [30, 60, 30, 60, 90], lose: [80, 120, 80],
  };

  /**
   * Play a cue by name. Safe to call at any time, from anywhere: before the
   * context exists, with audio muted, on a browser with no Web Audio at all.
   * Callers never have to check anything, which is what keeps the call sites
   * in the UI down to one line each.
   */
  Audio.sfx = function (name) {
    haptic(name);
    if (!ctx || ctx.state !== 'running' || failed) return;
    if (settings.master <= 0 || settings.sfx <= 0) return;
    var cue = CUES[name];
    if (!cue) return;
    /* A hair of lead time: scheduling exactly at currentTime occasionally
     * lands a sample late and clicks. */
    cue(sfxBus, ctx.currentTime + 0.005);
  };

  function haptic(name) {
    if (!settings.haptics) return;
    if (!navigator.vibrate) return;
    var pattern = HAPTICS[name];
    if (!pattern) return;
    /* Some browsers throw on a vibrate() outside a user gesture. */
    try { navigator.vibrate(pattern); } catch (err) { /* nothing to do */ }
  }

  Mandate.Audio = Audio;
})(window.Mandate = window.Mandate || {});
