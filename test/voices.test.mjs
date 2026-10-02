import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeAudioContext, loadScripts } from './helpers.mjs';

const { voices } = loadScripts(['audio.js', 'voices.js']).Stillmotion;

// Minimal parameters each voice needs
const CUES = {
  pad: { dur: 3, f: [220, 330], g: 0.05 },
  whoosh: { dur: 1, g: 0.1 },
  chime: { f: 880, g: 0.1 },
  pluck: { f: 523, g: 0.1 },
  thump: {},
  motor: { dur: 4.3 },
  wind: { dur: 5 },
  road: { dur: 2 },
  door: {},
  whir: { dur: 0.6 },
  thud: {},
  click: {},
  hum: { dur: 3 },
  boom: {},
};

test('every bundled voice is covered by this test', () => {
  assert.deepEqual(Object.keys(voices).sort(), Object.keys(CUES).sort());
});

for (const [kind, params] of Object.entries(CUES)) {
  test(`voice "${kind}" schedules sound starting at the requested time`, () => {
    const ctx = new FakeAudioContext();
    voices[kind](ctx, ctx.createGain(), 2.5, { t: 0, kind, ...params });
    assert.ok(ctx.starts.length > 0, 'starts at least one source');
    assert.ok(ctx.starts.every((s) => s.t === 2.5), 'all sources start at `at`');
  });
}
