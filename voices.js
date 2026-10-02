// A small library of synthesized voices (requires audio.js to be loaded first).
// Usage: Stillmotion.voices.chime(ctx, out, at, cue) — or pass Stillmotion.voices to schedule()/LivePlayer.
// pad (chord bed) / whoosh (filtered sweep) / chime / pluck / thump (low hit) / motor (rising electric whine)
// wind / road (road noise) / door (door shut) / whir (small motor) / thud (object landing) / click / hum / boom
(() => {
  const { env, osc, noise } = Stillmotion.audio;

  // Filtered noise; returns the filter so callers can sweep its frequency
  function filtered(ctx, out, type, f, at, stop) {
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.connect(out);
    noise(ctx, flt, at, stop);
    return flt;
  }

  // Envelope for sustained sounds: fade in, hold, fade out
  function hold(ctx, out, at, dur, peak, fadeIn, fadeOut) {
    const g = ctx.createGain(), end = at + dur;
    g.connect(out);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + Math.min(fadeIn, dur / 2));
    g.gain.setValueAtTime(peak, Math.max(at + Math.min(fadeIn, dur / 2), end - fadeOut));
    g.gain.linearRampToValueAtTime(0.0001, end);
    return g;
  }

  const VOICES = {
    pad(ctx, out, at, c) {
      const g = hold(ctx, out, at, c.dur, c.g, 1.2, 0.8);
      c.f.forEach((f, k) => osc(ctx, g, 'sine', f * (1 + (k % 2 ? 0.002 : -0.002)), at, at + c.dur));
    },
    whoosh(ctx, out, at, c) {
      const g = ctx.createGain();
      g.connect(out);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(c.g, at + c.dur * 0.6);
      g.gain.linearRampToValueAtTime(0.0001, at + c.dur);
      const bp = filtered(ctx, g, 'bandpass', 200, at, at + c.dur);
      bp.frequency.exponentialRampToValueAtTime(3200, at + c.dur);
    },
    chime(ctx, out, at, c) {
      const g = ctx.createGain(); g.connect(out); env(g, at, 0.005, c.g, 1.6);
      osc(ctx, g, 'sine', c.f, at, at + 1.7); osc(ctx, g, 'sine', c.f * 2.01, at, at + 1.7);
    },
    pluck(ctx, out, at, c) {
      const g = ctx.createGain(); g.connect(out); env(g, at, 0.003, c.g, 0.6);
      osc(ctx, g, 'sine', c.f, at, at + 0.7); osc(ctx, g, 'triangle', c.f * 1.003, at, at + 0.7);
    },
    thump(ctx, out, at) {
      const g = ctx.createGain(); g.connect(out); env(g, at, 0.005, 0.5, 0.45);
      osc(ctx, g, 'sine', 120, at, at + 0.5).frequency.exponentialRampToValueAtTime(42, at + 0.3);
    },
    // Electric whine: sawtooth + sine sweeping up over `dur`, then falling back
    motor(ctx, out, at, c) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      const g = hold(ctx, out, at, c.dur + 0.8, 0.09, 0.4, 0.8);
      lp.connect(g);
      [['sawtooth', 1], ['sine', 2]].forEach(([type, mul]) => {
        const o = osc(ctx, lp, type, 90 * mul, at, at + c.dur + 0.8);
        o.frequency.exponentialRampToValueAtTime(760 * mul, at + c.dur);
        o.frequency.exponentialRampToValueAtTime(300 * mul, at + c.dur + 0.8);
      });
    },
    wind(ctx, out, at, c) {
      const g = hold(ctx, out, at, c.dur, 0.12, 1.5, 1);
      filtered(ctx, g, 'lowpass', 300, at, at + c.dur).frequency.exponentialRampToValueAtTime(5000, at + c.dur - 0.7);
    },
    road(ctx, out, at, c) {
      filtered(ctx, hold(ctx, out, at, c.dur, 0.2, 0.3, 0.05), 'lowpass', 500, at, at + c.dur);
    },
    door(ctx, out, at) {
      VOICES.thump(ctx, out, at);
      const g = ctx.createGain(); g.connect(out); env(g, at, 0.002, 0.25, 0.18);
      filtered(ctx, g, 'lowpass', 900, at, at + 0.25);
    },
    whir(ctx, out, at, c) {
      const g = hold(ctx, out, at, c.dur, 0.05, 0.1, 0.15);
      osc(ctx, g, 'triangle', 320, at, at + c.dur).frequency.linearRampToValueAtTime(220, at + c.dur);
    },
    thud(ctx, out, at) {
      const g = ctx.createGain(); g.connect(out); env(g, at, 0.003, 0.25, 0.16);
      osc(ctx, g, 'sine', 110, at, at + 0.2).frequency.exponentialRampToValueAtTime(70, at + 0.15);
      filtered(ctx, g, 'lowpass', 600, at, at + 0.08);
    },
    click(ctx, out, at) {
      const g = ctx.createGain(); g.connect(out); env(g, at, 0.001, 0.3, 0.04);
      filtered(ctx, g, 'highpass', 2500, at, at + 0.06);
      osc(ctx, g, 'sine', 1800, at, at + 0.06);
    },
    hum(ctx, out, at, c) {
      const g = hold(ctx, out, at, c.dur, 0.03, 0.5, 0.6);
      [100, 200, 300].forEach((f) => osc(ctx, g, 'sine', f, at, at + c.dur));
    },
    boom(ctx, out, at) {
      const g = ctx.createGain(); g.connect(out); env(g, at, 0.005, 0.5, 1.8);
      osc(ctx, g, 'sine', 50, at, at + 2);
      filtered(ctx, g, 'lowpass', 200, at, at + 1);
    },
  };

  Stillmotion.voices = VOICES;
})();
