import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import vm from 'node:vm';
import { loadScripts } from './helpers.mjs';

// Run the CLI body with its imports supplied by the sandbox. No browser,
// encoder, HTTP server or filesystem writes are started by these tests.
const source = readFileSync(new URL('../record.mjs', import.meta.url), 'utf8')
  .replace(/^#!.*\n/, '\n')
  .replace(/^import .*;$/gm, '');

function record(audio) {
  const state = { writes: [], encoders: [], frames: [], screenshots: 0, closed: [] };
  const document = {
    fonts: { ready: Promise.resolve() },
    getAnimations: () => [],
    documentElement: { classList: { add() {} } },
  };
  const sandbox = loadScripts(['capture.js'], { document });
  sandbox.Stillmotion.installCapture({ duration: 100, update: (t) => state.frames.push(t), audio });
  const page = {
    on() {},
    async setViewport() {},
    async goto() {},
    async evaluate(fn, arg) { return fn(arg); },
    async screenshot() { state.screenshots++; return Buffer.from('synthetic PNG'); },
  };
  Object.assign(sandbox, {
    Buffer, path,
    console: { log() {} },
    process: { platform: 'linux', stdout: { write() {} } },
    parseArgs: (options) => parseArgs({ ...options, args: ['--page', 'fixture.html', '--root', '.'] }),
    tmpdir: () => '/tmp',
    mkdtemp: async () => '/tmp/stillmotion-test',
    writeFile: async (file, bytes) => state.writes.push({ file, bytes }),
    rm: async () => state.closed.push('tmp'),
    startStaticServer: async () => ({
      origin: 'http://127.0.0.1:1234', server: { close: () => state.closed.push('server') },
    }),
    puppeteer: { launch: async () => ({
      newPage: async () => page, close: async () => state.closed.push('browser'),
    }) },
    spawn(command, args) {
      state.encoders.push({ command, args: Array.from(args) });
      const ff = new EventEmitter();
      ff.stdin = { write: () => true, end: () => ff.emit('close', 0) };
      return ff;
    },
  });
  return { state, finished: vm.runInContext(`(async () => {\n${source}\n})()`, sandbox) };
}

test('recorder exports frames without a soundtrack when audio is omitted', async () => {
  const { state, finished } = record();
  await finished;
  assert.equal(state.writes.length, 0);
  assert.equal(state.encoders.length, 1);
  const { command, args } = state.encoders[0];
  assert.equal(command, 'ffmpeg');
  assert.deepEqual(args.filter((arg, i) => args[i - 1] === '-i'), ['-']);
  assert.ok(!args.includes('-c:a'));
  assert.ok(!args.includes('-b:a'));
  assert.deepEqual(state.frames, [0, 1000 / 30, 2000 / 30]);
  assert.equal(state.screenshots, 3);
  assert.deepEqual(state.closed, ['browser', 'server', 'tmp']);
});

test('recorder still renders and muxes a supplied soundtrack', async () => {
  const bytes = Buffer.from('synthetic WAV');
  let calls = 0;
  const { state, finished } = record(async () => { calls++; return bytes.toString('base64'); });
  await finished;
  assert.equal(calls, 1);
  assert.deepEqual(state.writes, [{ file: '/tmp/stillmotion-test/audio.wav', bytes }]);
  const { args } = state.encoders[0];
  assert.deepEqual(args.filter((arg, i) => args[i - 1] === '-i'), ['-', '/tmp/stillmotion-test/audio.wav']);
  assert.equal(args[args.indexOf('-c:a') + 1], 'aac');
  assert.equal(args[args.indexOf('-b:a') + 1], '192k');
  assert.equal(args[args.indexOf('-t') + 1], '0.1');
  assert.equal(state.screenshots, 3);
});

for (const asynchronous of [false, true]) {
  test(`recorder propagates ${asynchronous ? 'rejected' : 'thrown'} audio errors`, async () => {
    const error = new Error('synthetic audio failure');
    const audio = asynchronous ? async () => { throw error; } : () => { throw error; };
    const { state, finished } = record(audio);
    await assert.rejects(finished, (actual) => actual === error);
    assert.equal(state.writes.length, 0);
    assert.equal(state.encoders.length, 0);
    assert.equal(state.screenshots, 0);
    assert.deepEqual(state.closed, ['browser', 'server', 'tmp']);
  });
}

test('recorder does not treat a malformed audio callback as an omitted soundtrack', async () => {
  const { state, finished } = record('invalid callback');
  await assert.rejects(finished, /audioWav is not a function/);
  assert.equal(state.encoders.length, 0);
});
