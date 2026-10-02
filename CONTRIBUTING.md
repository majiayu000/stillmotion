# Contributing to stillmotion

Thanks for your interest! Bug reports, ideas and pull requests are welcome.

## Development setup

```bash
git clone https://github.com/majiayu000/stillmotion.git
cd stillmotion
npm install
npm run check   # syntax-check every source file
npm test        # unit tests (node:test, no browser needed)
```

To try the full pipeline you also need Google Chrome and `ffmpeg`:

```bash
npx stillmotion --page examples/basic/index.html --root . --seconds 2 --out /tmp/test.mp4
```

## Guidelines

- Keep the browser scripts (`audio.js`, `capture.js`, `voices.js`) dependency-free classic scripts.
- Every bug fix comes with a test that fails without the fix.
- New voices need an entry in `test/voices.test.mjs` and in the README table.
- Keep pull requests focused; describe what changed and how you verified it.
