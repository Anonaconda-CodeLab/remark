// Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
// Every third-party file is byte for byte the release named in tests/origins.json (and in NOTICE.md), and the code
// copied from the studio's other apps (Flatbed's picture-size check, Unmarked's cleaner, Redact's cover painting, check
// and fill) is unchanged: a change is made in that app first, then copied here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const file = f => readFileSync(new URL('../' + f, import.meta.url));
const sha = b => createHash('sha256').update(b).digest('hex');
const O = JSON.parse(file('tests/origins.json'));

test('third-party files match their releases', () => {
  for (const [f, o] of Object.entries(O.files)) assert.equal(sha(file(f)), o.sha256, f);
});

test("the picture-size check is Flatbed's, unchanged", () => {
  const s = file('src/picture.js').toString('utf8'), a = s.indexOf('  // A small file can declare'), b = s.indexOf('\n  const api');
  assert.equal(sha(s.slice(a, b).trimEnd()), O['picture.js'].sha256);
});

test("the cover fill is Redact's, unchanged", () => {
  const s = file('src/fill.js').toString('utf8'), start = '// ---- from Redact src/detect.js ----\n';
  const a = s.indexOf(start) + start.length, b = s.indexOf('  // ---- end of copy ----');
  assert.ok(a > start.length && b > a);
  assert.equal(sha(s.slice(a, b).trimEnd()), O['fill.js'].sha256);
});

test("Unmarked's cleaner and Redact's paint.js are unchanged copies (changes are made there first)", () => {
  for (const [f, o] of Object.entries(O.copies)) assert.equal(sha(file(f)), o.sha256, f);
});

test('NOTICE.md names every third-party file and its checksum', () => {
  const n = file('NOTICE.md').toString('utf8');
  for (const [f, o] of Object.entries(O.files)) { assert.ok(n.includes(f.split('/').pop()), f); assert.ok(n.includes(o.sha256), f + ' checksum'); }
});
