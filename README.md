# stillmotion

[![CI](https://github.com/majiayu000/stillmotion/actions/workflows/ci.yml/badge.svg)](https://github.com/majiayu000/stillmotion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Turn browser animations into frame-exact MP4 videos with synthesized sound.**

Every frame is still; strung together, they move. stillmotion records a web page one frame at a time in headless Chrome: it freezes every CSS animation, CSS transition, SVG/SMIL animation and your own render loop at an exact timestamp, takes a screenshot, renders the soundtrack offline from the same timeline, and muxes both with ffmpeg.

Because time is virtual, a frame that takes two seconds to render still lands at exactly `n / fps` in the video. No dropped frames, no audio drift, regardless of how heavy the page is (WebGL scenes included).

## Features

- **Frame-exact capture** of CSS animations/transitions (via the Web Animations API), SVG/SMIL, and anything your code draws for a given time `t`, including Three.js / WebGL.
- **Synthesized sound, zero assets.** Describe sound as a list of timed cues; play it live in the browser or render it offline into the video's audio track. One timeline, so picture and sound always line up.
- **14 built-in voices**: chord pads, whooshes, chimes, plucks, an electric-motor whine, door thuds and more, all generated with oscillators and filtered noise.
- **Tiny and dependency-free in the browser**: three plain scripts, no build step. The recorder CLI depends only on `puppeteer-core` and uses your installed Chrome.

## Requirements

- Node.js 20+
- Google Chrome (or pass any Chromium build with `--chrome`)
- `ffmpeg` on your `PATH`

## Install

```bash
npm install --save-dev github:majiayu000/stillmotion
```

## Quick start

Record the bundled example (a bouncing dot with a pluck on every bounce):

```bash
git clone https://github.com/majiayu000/stillmotion.git
cd stillmotion && npm install
npx stillmotion --page examples/basic/index.html --root . --out bounce.mp4
```

Open `examples/basic/index.html` through any local web server to watch it live; click to turn the sound on.

## Page contract

Load the scripts you need (classic `<script>` tags; they attach to `window.Stillmotion`):

```html
<script src="stillmotion/audio.js"></script>    <!-- cue scheduling, live player, offline WAV render -->
<script src="stillmotion/capture.js"></script>  <!-- frame-exact capture hook -->
<script src="stillmotion/voices.js"></script>   <!-- optional: built-in voices -->
```

When the recorder opens your page it adds `?capture=1`. In that mode, drive the page from virtual time instead of `requestAnimationFrame`, and register a capture hook:

```js
const { isCapture, installCapture, audio, voices } = Stillmotion;

function update(ms) {
  // Put the page into the state it should have at `ms`.
  // For WebGL, render synchronously here (e.g. renderer.render(scene, camera)).
}

if (isCapture) {
  installCapture({
    duration: 12000,                 // total length in ms
    update,                          // called once per frame with the virtual time
    svg: document.querySelector('svg'), // optional: root <svg> whose SMIL animations should be seeked
    audio: () => audio.renderWavBase64(12, [{ base: 0, cues }], voices), // optional soundtrack
  });
} else {
  const start = performance.now();
  const loop = () => { update(performance.now() - start); requestAnimationFrame(loop); };
  loop();
}
```

CSS animations and transitions need nothing extra: each one is paused and seeked to "virtual time minus the moment it first appeared", so animations that start when you toggle a class mid-timeline behave exactly as they do live. While capturing, `<html>` gets a `capture` class you can use to hide interactive controls.

## Sound

A cue is `{ t, kind, dur?, ...params }`: `t` is seconds from the start of a track, `kind` names a voice, and `dur` marks a sustained sound. A voice is a function `(ctx, out, at, cue)` that schedules Web Audio nodes starting at absolute context time `at`, so you can mix the built-ins with your own:

```js
const myVoices = {
  ...Stillmotion.voices,
  beep(ctx, out, at, cue) {
    const g = ctx.createGain();
    g.connect(out);
    Stillmotion.audio.env(g, at, 0.005, cue.g ?? 0.2, 0.3);
    Stillmotion.audio.osc(ctx, g, 'square', cue.f ?? 880, at, at + 0.35);
  },
};

const cues = [
  { t: 0, kind: 'pad', dur: 8, f: [220, 277.2, 329.6], g: 0.04 },
  { t: 1.5, kind: 'beep', f: 660 },
  { t: 4, kind: 'chime', f: 880, g: 0.1 },
];

// Live: browsers only start audio after a user gesture
const player = new Stillmotion.audio.LivePlayer(myVoices);
button.onclick = () => player.toggle(cues, currentSeconds);
```

| Voice | Params | Sound |
|---|---|---|
| `pad` | `dur`, `f` (array of Hz), `g` | soft chord bed |
| `whoosh` | `dur`, `g` | band-passed noise sweeping upward |
| `chime` | `f`, `g` | bell-like sine pair |
| `pluck` | `f`, `g` | short plucked tone |
| `thump` | | low pitched hit |
| `motor` | `dur` | electric whine rising over `dur` |
| `wind` | `dur` | rising wind noise |
| `road` | `dur` | low road rumble |
| `door` | | car-door shut |
| `whir` | `dur` | small motor |
| `thud` | | object landing |
| `click` | | latch click |
| `hum` | `dur` | electrical hum |
| `boom` | | deep closing hit |

Other helpers on `Stillmotion.audio`: `schedule(out, base, cues, voices, from)`, `env`, `osc`, `noise`, `makeMaster`, `encodeWav`, `renderWavBase64(totalSec, tracks, voices, sampleRate)`.

## CLI

```
stillmotion --page <file.html> [options]

  --page <file>     HTML page to record (required)
  --root <dir>      directory served over http (default: parent of the page's directory)
  --out <file>      output MP4 (default: out.mp4)
  --fps <n>         frames per second (default: 30)
  --width <px>      video width (default: 1920)
  --height <px>     video height (default: width × 9/16)
  --seconds <n>     record only the first n seconds
  --chrome <path>   Chrome/Chromium executable (default: installed Google Chrome)
```

Pages are served from a throwaway local HTTP server on a random port (ES modules cannot load from `file://`). Make sure `--root` contains every file the page references.

## How it works

1. Serve `--root` over http and open the page in headless Chrome with `?capture=1`.
2. Ask the page for its soundtrack and render it with `OfflineAudioContext` into a WAV.
3. For each frame `n`: call `capture.renderAt(n * 1000 / fps)`, which runs your `update`, pauses and seeks every animation from `document.getAnimations()`, and seeks SMIL; then screenshot.
4. Pipe the PNG frames into ffmpeg and mux them with the WAV (H.264 + AAC, `+faststart`).

## Limitations

- Anything time-based that you drive yourself (`requestAnimationFrame` loops, `<video>`, canvas animations) must read time from `update(ms)` in capture mode.
- Output is H.264 MP4 with yuv420p; transparency is not preserved.
- Recording speed depends on page complexity. GPU rendering is enabled by default (Metal on macOS).

## License

[MIT](LICENSE)
