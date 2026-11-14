# Remark

**Write on your photos and screenshots, then share a clean copy, on your own device.**
Text, callouts, arrows, lines, circles, boxes, numbered markers, a highlighter, a pen and covers. Text sits on a label
that reads well on any background, in English or Thai. Remark draws the marks into a brand-new picture, so they can't be
peeled off and no hidden details (where a photo was taken, which phone took it) come along. No account, no server, no
upload.

**Web app: [remark.anonacondacodelab.com](https://remark.anonacondacodelab.com)** · **Android app:
[download and how to check it](https://remark.anonacondacodelab.com/android.html)** (or the [latest release](https://github.com/Anonaconda-CodeLab/remark/releases/latest)). See `docs/MANUAL.md` for how it works.

## How it works
The whole web app is one file, `dist/index.html`, built by `node build.mjs` from `src/` (about 0.35 MB). Its Content
Security Policy blocks every connection (`connect-src 'none'`), workers and WebAssembly; the typefaces are embedded.

- `src/marks.js`: the marks (plain objects in picture pixels), their geometry, hit-testing and drawing. The same code
  draws the screen and the full-size picture that is saved. Runs in Node for the tests.
- `src/editor.js`: the editor (tools, selection, typing, crop, zoom, undo). The view and undo are adapted from Redact's.
- `src/save.js`: the clean copy: the original decoded again at full size, cropped, marks drawn, covers painted last,
  a new file encoded, cleaned, decoded again and checked (adapted from Redact's).
- `src/paint.js` (cover colour from around, pixel check) and `src/fill.js` (solid fill): Redact's, unchanged.
  `src/clean.js`: Unmarked's cleaner, unchanged. `src/picture.js`: Flatbed's picture-size check, unchanged.
  `tests/origins.test.mjs` checks all four against `tests/origins.json`; changes are made in those apps first.
- `src/app.js`, `src/body.html`, `src/style.css`: the page, opening pictures, settings. `src/native.js`: the Android
  app's file picker, saving, sharing and Share → Remark (Redact's).
- `mobile/`: the Android app ([Capacitor](https://capacitorjs.com)), no internet permission. See `mobile/README.md`.

## Develop
```
node build.mjs     # -> dist/
npm test           # builds, then runs the tests (Node 20.12 or later; no packages to install)
```

## Hosting
Cloudflare Pages, from this repository: build command `node build.mjs`, output `dist`, variable `NODE_VERSION=22`.
`dist/_headers` adds the HTTP headers (a second block on connections, no framing, `*.pages.dev` kept out of search
engines).

## Licence
GPL-3.0-or-later. © 2026 Anonaconda Code Lab. The code is written with Claude (every commit says so); the owner
designs and tests the app.
