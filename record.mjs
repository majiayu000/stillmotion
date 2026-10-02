#!/usr/bin/env node
// Export a web animation to MP4: screenshot every frame in headless Chrome, render the audio track
// inside the page with OfflineAudioContext, then mux both with ffmpeg.
// The page must load capture.js and call Stillmotion.installCapture (see README).
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';
import { startStaticServer } from './server.mjs';

const USAGE = `Usage: stillmotion --page <file.html> [options]

  --page <file>     HTML page to record (required)
  --root <dir>      directory served over http (default: parent of the page's directory)
  --out <file>      output MP4 (default: out.mp4)
  --fps <n>         frames per second (default: 30)
  --width <px>      video width (default: 1920)
  --height <px>     video height (default: width × 9/16)
  --seconds <n>     record only the first n seconds
  --chrome <path>   Chrome/Chromium executable (default: installed Google Chrome)
  -h, --help        show this help`;

const { values: opt } = parseArgs({
  options: {
    page: { type: 'string' },
    root: { type: 'string' },
    out: { type: 'string', default: 'out.mp4' },
    fps: { type: 'string', default: '30' },
    width: { type: 'string', default: '1920' },
    height: { type: 'string' },
    seconds: { type: 'string' },
    chrome: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});
if (opt.help || !opt.page) {
  console.log(USAGE);
  process.exit(opt.help ? 0 : 1);
}

const fps = Number(opt.fps);
const width = Number(opt.width);
const height = opt.height ? Number(opt.height) : Math.round((width * 9) / 16);
const pagePath = path.resolve(opt.page);
const root = path.resolve(opt.root ?? path.dirname(path.dirname(pagePath)));
const out = path.resolve(opt.out);
const relPage = path.relative(root, pagePath);
if (relPage.startsWith('..')) throw new Error(`--page must be inside --root (${root})`);

// GPU rendering makes WebGL pages much faster; Metal is the reliable ANGLE backend on macOS
const gpuArgs = process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist'];
const { server, origin } = await startStaticServer(root);
const browser = await puppeteer.launch({
  headless: true,
  args: gpuArgs,
  ...(opt.chrome ? { executablePath: opt.chrome } : { channel: 'chrome' }),
});
const tmp = await mkdtemp(path.join(tmpdir(), 'stillmotion-'));
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`${origin}/${relPage.split(path.sep).join('/')}?capture=1`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (pageErrors.length) throw pageErrors[0];
  if (!(await page.evaluate(() => typeof window.capture?.renderAt === 'function'))) {
    throw new Error('Page did not call Stillmotion.installCapture() — see README "Page contract"');
  }

  const totalMs = await page.evaluate(() => capture.duration);
  const durationMs = opt.seconds ? Math.min(Number(opt.seconds) * 1000, totalMs) : totalMs;

  const wav = path.join(tmp, 'audio.wav');
  await writeFile(wav, Buffer.from(await page.evaluate(() => capture.audioWav()), 'base64'));

  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-i', wav,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-t', String(durationMs / 1000), '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const finished = new Promise((resolve, reject) => {
    ff.on('error', (e) => reject(new Error(`Could not start ffmpeg: ${e.message}`)));
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
  });

  const frames = Math.round((durationMs / 1000) * fps);
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => capture.renderAt(t), (f * 1000) / fps);
    const png = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % fps === 0) process.stdout.write(`\r${f}/${frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`);
  }
  ff.stdin.end();
  await finished;
  if (pageErrors.length) throw pageErrors[0];
  console.log(`\nWrote ${out}`);
} finally {
  await browser.close();
  server.close();
  await rm(tmp, { recursive: true, force: true });
}
