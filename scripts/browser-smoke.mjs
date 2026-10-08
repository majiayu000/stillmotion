// Opt-in integration check: real Chrome frames, ffmpeg encoding and ffprobe streams.
// Kept outside test/ so the ordinary unit suite needs no browser or encoder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = await mkdtemp(path.join(tmpdir(), 'stillmotion-browser-smoke-'));
const chromeArgs = process.env.CHROME_PATH ? ['--chrome', process.env.CHROME_PATH] : [];

function record(page, servedRoot, output, audioExpected) {
  execFileSync(process.execPath, [
    path.join(root, 'record.mjs'), '--page', page, '--root', servedRoot,
    '--out', output, '--seconds', '1', '--fps', '10', '--width', '320', '--height', '180',
    ...chromeArgs,
  ], { cwd: root, stdio: 'inherit', timeout: 60_000 });
  const { streams } = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error', '-count_frames', '-show_streams', '-of', 'json', output,
  ], { encoding: 'utf8', timeout: 15_000 }));
  const video = streams.filter(stream => stream.codec_type === 'video');
  const audio = streams.filter(stream => stream.codec_type === 'audio');
  assert.equal(video.length, 1);
  assert.equal(video[0].codec_name, 'h264');
  assert.equal(video[0].width, 320);
  assert.equal(video[0].height, 180);
  assert.equal(Number(video[0].nb_read_frames), 10);
  assert.ok(Math.abs(Number(video[0].duration) - 1) < 0.05);
  assert.equal(audio.length, audioExpected ? 1 : 0);
  if (audioExpected) assert.equal(audio[0].codec_name, 'aac');
}

try {
  record(path.join(root, 'examples/basic/index.html'), root, path.join(scratch, 'basic.mp4'), true);
  await copyFile(path.join(root, 'capture.js'), path.join(scratch, 'capture.js'));
  const silent = path.join(scratch, 'silent.html');
  await writeFile(silent, `<!doctype html>
<html><body><output id="clock"></output><script src="capture.js"></script><script>
Stillmotion.installCapture({ duration: 1000, update(t) {
  document.getElementById('clock').textContent = String(t);
} });
</script></body></html>`);
  record(silent, scratch, path.join(scratch, 'silent.mp4'), false);
  console.log('Browser smoke passed: basic example has AAC audio; silent capture has no audio stream; both have 10 H.264 frames.');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
