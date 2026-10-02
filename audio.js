// Synthesized audio helpers: a cue list + a voice table → live playback (LivePlayer) or an offline-rendered WAV.
// cue:   { t: seconds from the track start, kind: voice name, dur?: length of a sustained sound, ...voice params }
// voice: (ctx, out, at, cue) => void — starts making sound at absolute context time `at`
// Loaded as a classic script; attaches itself to window.Stillmotion.audio.
(() => {
  function env(g, at, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  function osc(ctx, out, type, f, at, stop) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.connect(out);
    o.start(at);
    o.stop(stop);
    return o;
  }

  // 2-second looping white noise from a seeded generator, so renders are reproducible
  const buffers = new WeakMap();
  function noise(ctx, out, at, stop) {
    if (!buffers.has(ctx)) {
      const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < n; i++) {
        s = (s * 16807) % 2147483647;
        d[i] = (s / 2147483647) * 2 - 1;
      }
      buffers.set(ctx, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffers.get(ctx);
    src.loop = true;
    src.connect(out);
    src.start(at);
    src.stop(stop);
    return src;
  }

  // Schedule cues starting `from` seconds into the track. Sustained cues that already began are trimmed.
  function schedule(out, base, cues, voices, from = 0) {
    const ctx = out.context;
    for (const c of cues) {
      if (!voices[c.kind]) throw new Error(`Unknown voice "${c.kind}"`);
      if (c.dur) {
        if (c.t + c.dur <= from) continue;
        const s = Math.max(c.t, from);
        voices[c.kind](ctx, out, base + s - from, { ...c, dur: c.t + c.dur - s });
      } else if (c.t >= from) {
        voices[c.kind](ctx, out, base + c.t - from, c);
      }
    }
  }

  function makeMaster(ctx, gain = 0.9) {
    const comp = ctx.createDynamicsCompressor(), g = ctx.createGain();
    g.gain.value = gain;
    g.connect(comp).connect(ctx.destination);
    return g;
  }

  // Live playback: each play() gets a fresh bus; the previous bus fades out and disconnects.
  // Browsers require a user gesture before audio starts, so call toggle() from a click/keypress.
  class LivePlayer {
    constructor(voices) {
      this.voices = voices;
      this.ctx = null;
      this.bus = null;
      this.on = false;
    }
    play(cues, from = 0) {
      if (!this.on) return;
      this.stop();
      this.bus = this.ctx.createGain();
      this.bus.connect(this.master);
      schedule(this.bus, this.ctx.currentTime + 0.02, cues, this.voices, from);
    }
    stop() {
      if (!this.bus) return;
      const old = this.bus;
      old.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
      setTimeout(() => old.disconnect(), 300);
      this.bus = null;
    }
    toggle(cues, from) {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = makeMaster(this.ctx);
      }
      this.on = !this.on;
      if (this.on) {
        this.ctx.resume();
        this.play(cues, from);
      } else {
        this.stop();
      }
      return this.on;
    }
    pause(paused) {
      if (this.ctx) paused ? this.ctx.suspend() : this.ctx.resume();
    }
  }

  // 16-bit stereo PCM WAV, base64-encoded (so it can cross the Puppeteer boundary as a string)
  function encodeWav(buf) {
    const sr = buf.sampleRate, n = buf.length, data = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, s) => [...s].forEach((ch, k) => data.setUint8(o + k, ch.charCodeAt(0)));
    str(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt ');
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true);
    data.setUint32(24, sr, true); data.setUint32(28, sr * 4, true); data.setUint16(32, 4, true);
    data.setUint16(34, 16, true); str(36, 'data'); data.setUint32(40, n * 4, true);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (let k = 0; k < n; k++) {
      data.setInt16(44 + k * 4, Math.max(-1, Math.min(1, L[k])) * 0x7fff, true);
      data.setInt16(46 + k * 4, Math.max(-1, Math.min(1, R[k])) * 0x7fff, true);
    }
    const bytes = new Uint8Array(data.buffer);
    let bin = '';
    for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
    return btoa(bin);
  }

  // tracks: [{ base: start second, cues }] — rendered offline in one pass
  async function renderWavBase64(totalSec, tracks, voices, sr = 44100) {
    const oc = new OfflineAudioContext(2, Math.ceil(sr * totalSec), sr);
    const master = makeMaster(oc);
    tracks.forEach(({ base, cues }) => schedule(master, base, cues, voices));
    return encodeWav(await oc.startRendering());
  }

  window.Stillmotion = Object.assign(window.Stillmotion || {}, {
    audio: { env, osc, noise, schedule, makeMaster, LivePlayer, encodeWav, renderWavBase64 },
  });
})();
