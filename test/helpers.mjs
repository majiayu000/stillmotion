// Test helpers: load the browser scripts into a vm sandbox, and a minimal fake Web Audio context.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);

// The sandbox doubles as `window`, so scripts can use bare globals like `Stillmotion` exactly as in a browser
export function loadScripts(names, globals = {}) {
  const sandbox = vm.createContext({ location: { search: '' }, btoa, URLSearchParams, setTimeout, ...globals });
  sandbox.window = sandbox;
  for (const name of names) vm.runInContext(readFileSync(new URL(name, root), 'utf8'), sandbox, { filename: name });
  return sandbox;
}

class Param {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) {
    // Same rule as the real API: exponential ramps cannot reach zero or negative values
    if (!(v > 0)) throw new RangeError(`exponential ramp to ${v}`);
    this.events.push(['exp', v, t]);
    return this;
  }
  setTargetAtTime(v, t) { this.events.push(['target', v, t]); return this; }
}

class Node {
  constructor(ctx) {
    this.context = ctx;
    this.outputs = [];
  }
  connect(n) {
    this.outputs.push(n);
    return n;
  }
  disconnect() { this.outputs = []; }
}

// Records every scheduled source start so tests can assert on timing
export class FakeAudioContext {
  constructor(sampleRate = 8000) {
    this.sampleRate = sampleRate;
    this.currentTime = 0;
    this.destination = new Node(this);
    this.starts = [];
  }
  source(type) {
    const n = new Node(this);
    n.start = (t) => this.starts.push({ type, t });
    n.stop = (t) => { n.stopAt = t; };
    return n;
  }
  createGain() { const n = new Node(this); n.gain = new Param(1); return n; }
  createOscillator() { const n = this.source('osc'); n.frequency = new Param(440); return n; }
  createBufferSource() { return this.source('buffer'); }
  createBiquadFilter() { const n = new Node(this); n.frequency = new Param(350); n.Q = new Param(1); return n; }
  createDynamicsCompressor() { return new Node(this); }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, getChannelData: (i) => data[i] };
  }
}
