import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './helpers.mjs';

function fakePage(search) {
  const animations = [];
  const classes = new Set();
  const svgCalls = [];
  const document = {
    getAnimations: () => animations,
    documentElement: { classList: { add: (c) => classes.add(c) } },
  };
  const svg = { pauseAnimations: () => svgCalls.push('pause'), setCurrentTime: (s) => svgCalls.push(s) };
  const anim = () => ({ paused: false, currentTime: null, pause() { this.paused = true; } });
  const sandbox = loadScripts(['capture.js'], { document, location: { search } });
  return { sandbox, animations, classes, svg, svgCalls, anim };
}

test('isCapture reflects the ?capture query flag', () => {
  assert.equal(fakePage('?capture=1').sandbox.Stillmotion.isCapture, true);
  assert.equal(fakePage('').sandbox.Stillmotion.isCapture, false);
});

test('renderAt seeks each animation relative to when it first appeared', () => {
  const page = fakePage('?capture=1');
  const updates = [];
  page.sandbox.Stillmotion.installCapture({ duration: 3000, update: (t) => updates.push(t), svg: page.svg });
  const early = page.anim();
  page.animations.push(early);
  page.sandbox.capture.renderAt(0);
  const late = page.anim();
  page.animations.push(late);
  page.sandbox.capture.renderAt(500);
  page.sandbox.capture.renderAt(1000);

  assert.deepEqual(updates, [0, 500, 1000]);
  assert.equal(early.currentTime, 1000);
  assert.equal(late.currentTime, 500);
  assert.ok(early.paused && late.paused);
  assert.deepEqual(page.svgCalls.slice(-2), ['pause', 1]);
  assert.equal(page.sandbox.capture.duration, 3000);
  assert.ok(page.classes.has('capture'));
});
