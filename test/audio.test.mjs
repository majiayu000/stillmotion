import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeAudioContext, loadScripts } from './helpers.mjs';

const { audio } = loadScripts(['audio.js']).Stillmotion;

// A recording voice table: each call logs (kind, at, dur)
function recorder() {
  const calls = [];
  const voice = (kind) => (ctx, out, at, cue) => calls.push({ kind, at, dur: cue.dur });
  return { calls, voices: { blip: voice('blip'), drone: voice('drone') } };
}

test('schedule offsets instant cues by base and skips cues before `from`', () => {
  const { calls, voices } = recorder();
  const out = new FakeAudioContext().createGain();
  audio.schedule(out, 10, [{ t: 0.5, kind: 'blip' }, { t: 2, kind: 'blip' }], voices, 1);
  assert.deepEqual(calls, [{ kind: 'blip', at: 10 + 2 - 1, dur: undefined }]);
});

test('schedule trims sustained cues that already started and drops finished ones', () => {
  const { calls, voices } = recorder();
  const out = new FakeAudioContext().createGain();
  const cues = [{ t: 0, kind: 'drone', dur: 4 }, { t: 0, kind: 'drone', dur: 1 }, { t: 3, kind: 'drone', dur: 2 }];
  audio.schedule(out, 0, cues, voices, 2);
  assert.deepEqual(calls, [
    { kind: 'drone', at: 0, dur: 2 },
    { kind: 'drone', at: 1, dur: 2 },
  ]);
});

test('schedule rejects unknown voices with a clear error', () => {
  const out = new FakeAudioContext().createGain();
  assert.throws(() => audio.schedule(out, 0, [{ t: 0, kind: 'nope' }], {}), /Unknown voice "nope"/);
});

test('encodeWav writes a valid 16-bit stereo header and clamps samples', () => {
  const L = Float32Array.from([0, 0.5, 2, -2]), R = Float32Array.from([0, -0.5, 1, -1]);
  const b64 = audio.encodeWav({ sampleRate: 44100, length: 4, getChannelData: (i) => (i ? R : L) });
  const buf = Buffer.from(b64, 'base64');
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(buf.readUInt16LE(22), 2);
  assert.equal(buf.readUInt32LE(24), 44100);
  assert.equal(buf.readUInt16LE(34), 16);
  assert.equal(buf.readUInt32LE(40), 16);
  assert.equal(buf.length, 44 + 16);
  const sample = (frame, ch) => buf.readInt16LE(44 + frame * 4 + ch * 2);
  assert.equal(sample(1, 0), Math.trunc(0.5 * 0x7fff));
  assert.equal(sample(2, 0), 0x7fff);
  assert.equal(sample(3, 0), -0x7fff);
  assert.equal(sample(1, 1), Math.trunc(-0.5 * 0x7fff));
});

test('LivePlayer stays silent until toggled on', () => {
  const { calls, voices } = recorder();
  const player = new audio.LivePlayer(voices);
  player.play([{ t: 0, kind: 'blip' }]);
  assert.equal(calls.length, 0);
});
