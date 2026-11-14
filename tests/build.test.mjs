// Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
// Checks the built page (run after `node build.mjs`): no network, everything inlined, settings filled in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dist = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const file = f => readFileSync(new URL('../' + f, import.meta.url));
const pkg = JSON.parse(file('package.json'));
const html = dist('index.html');

const directives = csp => {
  const dirs = new Map();
  for (const part of csp.split(';').map(x => x.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/);
    assert.ok(!dirs.has(name), `${name} appears once`);
    dirs.set(name, values.join(' '));
  }
  return dirs;
};

test('page blocks all network access, workers and WebAssembly', () => {
  const dirs = directives(/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1]);
  // the blocking ones are exactly 'none' (nothing added after it)
  for (const d of ['default-src', 'connect-src', 'form-action', 'frame-src', 'media-src', 'object-src', 'base-uri', 'worker-src']) assert.equal(dirs.get(d), "'none'", d);
  assert.equal(dirs.get('script-src'), "'unsafe-inline'", 'no eval, no WebAssembly, no script from anywhere');
  assert.equal(dirs.get('font-src'), 'data:');
  assert.ok(!/<script[^>]+src=/i.test(html), 'no external scripts');
  assert.ok(!/sourceMappingURL/.test(html), 'no source map reference');
  assert.ok(!/target="_blank"/.test(html), 'links open in the same tab');
});

test('headers: a second block on connections, no framing, no camera, *.pages.dev kept out of search engines', () => {
  const h = dist('_headers');
  const dirs = directives(/Content-Security-Policy: (.*)/.exec(h)[1]);
  assert.equal(dirs.get('connect-src'), "'none'"); assert.equal(dirs.get('frame-ancestors'), "'none'");
  assert.match(h, /Permissions-Policy: camera=\(\), microphone=\(\)/);
  assert.match(h, /https:\/\/:project\.pages\.dev\/\*\n  X-Robots-Tag: noindex/);
  for (const k of ['Referrer-Policy: no-referrer', 'X-Content-Type-Options: nosniff', 'Cross-Origin-Opener-Policy: same-origin', 'Strict-Transport-Security']) assert.ok(h.includes(k), k);
});

test('everything is inlined: typefaces (with Thai), app; small page', () => {
  for (const g of ['RedactPicture', 'RedactDetect', 'RedactPaint', 'UnmarkedClean', 'RemarkMarks', 'RemarkApp', 'RemarkEditor', 'RemarkSave']) assert.ok(html.includes(g), g);
  for (const f of ['"Instrument Sans"', '"IBM Plex Sans Thai"']) assert.match(html, new RegExp(`@font-face\\{font-family:${f}[^}]*src:url\\(data:font/woff2;base64,`), f);
  assert.ok(html.includes(`Version ${pkg.version}`));
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(html), 'unfilled placeholder');
  assert.ok(html.length < 1048576, 'page under 1 MB');
  for (const l of ['Instrument Sans typeface', 'IBM Plex Sans Thai typeface']) assert.ok(dist('licences.txt').includes(l), l);
});

test('the screens, the tools, the ways in, the donation card', () => {
  for (const id of ['scrHome', 'scrEdit', 'scrCheck', 'scrSettings', 'scrAbout', 'scrHelp', 'photoInput', 'fileInput', 'stage', 'textIn', 'btnDone', 'btnSave', 'btnShare', 'btnCopy', 'donateCard', 'nameChips', 'optFill'])
    assert.ok(html.includes(`id="${id}"`), id);
  for (const t of ['text', 'callout', 'arrow', 'line', 'ellipse', 'rect', 'number', 'highlight', 'pen', 'cover', 'crop']) assert.ok(html.includes(`data-tool="${t}"`), t);
  assert.match(html, /data-tool="text" aria-pressed="true"/, 'Text is the tool to start with');
  assert.match(html, /data-tstyle="label" aria-pressed="true"/, 'Label is the text style to start with');
  for (const f of ['black', 'white', 'around']) assert.ok(html.includes(`data-fill="${f}"`), f);
  assert.ok(!/mosaic/i.test(dist('index.html').replace(/<script>[\s\S]*<\/script>/, '')), 'covers are solid only');
  assert.match(html, /<input type="file" id="photoInput" multiple accept="image\/jpeg,image\/png,image\/webp/, 'Open photos: pictures only (the photo picker)');
  assert.match(html, /<input type="file" id="fileInput" multiple>/, 'Browse files: any file, any folder');
  assert.match(html, /data-names="plain" aria-pressed="true"/, 'plain names are the default');
  assert.match(html, /settings = \{[^}]*names: 'plain'/, 'and in the settings');
});

test('launched: the Android download page is built and linked from the web app (web only)', () => {
  const page = dist('android.html');
  assert.match(page, new RegExp(`Latest version: ${pkg.version.replace(/\./g, '\\.')}`));
  assert.match(page, /your pictures never leave your phone/);
  assert.match(page, /4D:6C:EA:58:94:C0:D7:D8/, 'the studio certificate fingerprint');
  assert.match(html, /<p class="web-only app-link"><a href="\/android.html">Also available as an Android app →<\/a><\/p>/);
  assert.match(html, /<a class="btn web-only" href="\/android.html">Android app<\/a>/);
  assert.match(html, /<a class="btn native-only" href="https:\/\/remark\.anonacondacodelab\.com\/android\.html\?v=/, 'Check for updates in the app');
  assert.match(dist('sitemap.xml'), /android\.html/);
});

test('pictures, typed text and results are kept from browser translators', () => {
  for (const id of ['pics', 'stage', 'textIn', 'recentRow', 'checkImg', 'checkSub', 'editN']) assert.match(html, new RegExp(`id="${id}"[^>]*translate="no"|translate="no"[^>]*id="${id}"`), id);
});

test('nothing from a file or the keyboard is put into the page as HTML', () => {
  for (const f of ['src/app.js', 'src/editor.js', 'src/save.js', 'src/marks.js']) assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(file(f).toString()), f);
});
