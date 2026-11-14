// Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
// Fixes from CodeRabbit's full review (PR #1, 14 Nov 2026): pinch zoom, box corners, late results that arrive after
// the person has moved on, one hand-over at a time, a share folder per share, a safe output folder, the release
// workflow's pre-release clean-up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync, rmSync, symlinkSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../src/marks.js';
const M = globalThis.RemarkMarks;
const root = new URL('..', import.meta.url).pathname;
const r = f => readFileSync(join(root, f), 'utf8');

test('box corners: the opposite corner stays put through a whole drag, even across the other side', () => {
  for (const kind of ['rect', 'ellipse', 'cover']) {
    const b = { kind, x: 10, y: 10, w: 100, h: 50 };
    const fixed = M.anchor(b, 3);   // dragging the bottom-right corner: the top-left one stays
    assert.deepEqual(fixed, [10, 10]);
    for (const [x, y] of [[0, 0], [-5, -5], [-20, 30], [60, 70]]) {
      M.dragHandle(b, 3, x, y, fixed);
      assert.deepEqual([Math.min(b.x, b.x + b.w), Math.min(b.y, b.y + b.h), Math.abs(b.w), Math.abs(b.h)],
        [Math.min(10, x), Math.min(10, y), Math.abs(10 - x), Math.abs(10 - y)], `${kind} to ${x},${y}`);
    }
  }
  assert.equal(M.anchor({ kind: 'text', x: 0, y: 0, w: 5, h: 5 }, 0), null);
});

test('editor: a pinch never reads a starting point it doesn\'t have; a late display picture is dropped', () => {
  const e = r('src/editor.js');
  assert.match(e, /const far = !!d\.start && /);
  assert.ok(e.indexOf("const far") < e.indexOf("if (d.mode === 'pinch')"));
  assert.match(e, /bmp = await createImageBitmap\(c\);\s*if \(token !== ed\.token\) \{ bmp\.close\(\); return; \}/);
  assert.match(e, /anchor: M\.anchor\(m, hi\)/);
  assert.match(e, /M\.dragHandle\(d\.m, d\.i, \.\.\.clampPic\(px, py\), d\.anchor\)/);
});

test('saved, then changed again: closing asks first again', () => {
  const e = r('src/editor.js'), s = r('src/save.js');
  const ch = e.split('function changed()')[1].split('\n  }')[0];
  assert.match(ch, /p\.done && p\.savedAs !== snap\(p\)/);
  assert.match(ch, /p\.done = false/);
  // the save side records the same snapshot the editor compares with
  assert.match(e, /const snap = p => JSON\.stringify\(\{ marks: p\.marks, crop: p\.crop \}\)/);
  // the snapshot is of what the file was made from, taken when it was made, not when the hand-over finished
  assert.match(s, /const made = JSON\.stringify\(\{ marks: pic\.marks, crop: pic\.crop \}\);[^\n]*\n\s*const r = await render\(pic\)/);
  assert.match(s, /r\.pic\.savedAs = r\.made;/);
  assert.match(s, /if \(JSON\.stringify\(\{ marks: r\.pic\.marks, crop: r\.pic\.crop \}\) === r\.made\) \{ r\.pic\.done = true;/);
  // every close guard asks about a crop too, not only marks
  const a = r('src/app.js');
  assert.match(a, /const unsaved = p => !p\.done && \(p\.marks\.length > 0 \|\| !!p\.crop\);/);
  assert.equal((a.match(/unsaved\(pic\)|some\(unsaved\)/g) || []).length, 3);
  assert.ok(!/marks\.length && !p(ic)?\.done/.test(a));
});

test('check screen: a late check never touches the preview; the old preview is let go; results are kept apart', () => {
  const s = r('src/save.js');
  const chk = s.split('async function check(pic)')[1].split('\n  }\n')[0];
  assert.ok(chk.indexOf('if (token !== cur) { back.close(); return; }') > 0 && chk.indexOf('if (token !== cur) { back.close(); return; }') < chk.indexOf("$('checkImg').src = url"), 'checked before the preview changes');
  assert.ok(chk.indexOf('clearPreview()') > 0 && chk.indexOf('clearPreview()') < chk.indexOf('createObjectURL'));
  assert.match(s, /function saved\(r\) \{/);
  assert.ok(!/saved\(\);/.test(s), 'every hand-over marks its own result');
  assert.match(s, /if \(cur !== r\) return;/);
  assert.match(s, /countUse\(cur === r\);/, 'the donation card only on the current result\'s screen');
  for (const b of ['btnSave', 'btnShare', 'btnCopy']) assert.match(s, new RegExp(`\\$\\('${b}'\\)\\.onclick = once\\(`), b + ' waits for the one before');
  assert.match(s, /if \(busy \|\| !r \|\| !r\.bytes\) return;/);
  assert.match(s, /finally \{ busy = false;/);
});

test('recent texts: one limit for keeping and for restoring; a picture closed while opening keeps no thumbnail', () => {
  const a = r('src/app.js');
  assert.match(a, /TEXT_MAX = 200/);
  assert.match(a, /x\.length <= TEXT_MAX/);
  assert.match(a, /if \(!t \|\| t\.length > TEXT_MAX\) return;/);
  const load = a.split('const thumb = await tc.convertToBlob')[1];
  assert.ok(load.indexOf('if (pic.removed) return;') < load.indexOf('URL.createObjectURL'));
});

test('Android share: a folder of its own for each share, never reused', () => {
  const j = r('mobile/android/app/src/main/java/com/anonacondacodelab/remark/RemarkPlugin.java');
  assert.match(j, /shareCur = new File\(d, java\.util\.UUID\.randomUUID\(\)\.toString\(\)\)/);
  assert.match(j, /new File\(shareCur, String\.valueOf\(index\)\)/);
  assert.match(j, /new File\(shareCur, String\.valueOf\(i\)\)\.listFiles\(\)/);
  assert.ok(!/new File\(shareDir\(\), String\.valueOf/.test(j));
});

test('build: refuses to empty the project itself or one of its folders; a folder elsewhere is fine', () => {
  // on a scratch copy of the project, so a broken check could never delete the real one
  const tmp = mkdtempSync(join(tmpdir(), 'remark-guard-')), proj = join(tmp, 'remark');
  cpSync(root, proj, { recursive: true, filter: f => !/[\\/](\.git|dist|node_modules)$/.test(f) });
  symlinkSync(proj, join(tmp, 'checkout'));
  // a project whose own folder is a link (src -> elsewhere) is protected through the link too
  const linked = join(tmp, 'linked'); cpSync(proj, linked, { recursive: true });
  rmSync(join(linked, 'src'), { recursive: true }); symlinkSync(join(proj, 'src'), join(linked, 'src'));
  const build = (cwd, out) => spawnSync(process.execPath, ['build.mjs'], { cwd, env: { ...process.env, REMARK_DIST: out }, encoding: 'utf8' });
  for (const bad of ['.', '..', 'src', 'src/out', 'src/..keep', 'tests', join(tmp, 'checkout'), join(tmp, 'checkout', 'src')]) {
    const p = build(proj, bad); assert.notEqual(p.status, 0, bad); assert.match(p.stderr, /refusing to empty/, bad);
  }
  for (const bad of [join(proj, 'src'), join(proj, 'src', 'out')]) {   // the target of linked/src
    const p = build(linked, bad); assert.notEqual(p.status, 0, bad); assert.match(p.stderr, /refusing to empty/, bad);
  }
  assert.ok(existsSync(join(proj, 'src', 'app.js')) && existsSync(join(proj, 'tests', 'review.test.mjs')), 'nothing was deleted');
  const ok = build(proj, join(tmp, 'out'));
  assert.equal(ok.status, 0, ok.stderr); assert.ok(existsSync(join(tmp, 'out', 'index.html')));
  rmSync(tmp, { recursive: true, force: true });
});

test('release workflow: one publication per destination at a time; an old pre-release tag is removed, not ignored', () => {
  const w = r('.github/workflows/android.yml');
  const pub = w.split('\n  publish:')[1];
  assert.match(pub, /concurrency:\s*\n\s*group: android-publish-\$\{\{ inputs\.release && 'release' \|\| \(github\.ref == 'refs\/heads\/main' && 'android-test' \|\| 'android-preview'\) \}\}\s*\n\s*cancel-in-progress: false/);
  assert.ok(!/--cleanup-tag \|\| true/.test(w), 'no failure hidden');
  for (const n of ['android-test', 'android-preview']) assert.match(w, new RegExp(`clear_prerelease ${n}\\n\\s*gh release create ${n}`));
  assert.match(w, /elif ! grep -q 'HTTP 404'/);
  assert.equal((w.match(/elif ! grep -qi 'release not found\\\|HTTP 404'/g) || []).length, 2, 'a release lookup that fails for another reason stops');
  assert.ok(!/gh release view "\$1" >\/dev\/null 2>&1; then/.test(w));
});

test('zooming is mentioned where people look: the tool hint (until the first zoom) and the manual\'s first steps', () => {
  const e = r('src/editor.js'), m = r('docs/MANUAL.md');
  assert.match(e, /'\(pointer: coarse\)'\)\.matches \? ' Pinch to zoom in\.' : ' Scroll to zoom in\.'/);
  assert.match(e, /HINTS\[ed\.tool\] \+ zoomTip\(\)/);
  assert.match(e, /if \(!ed\.zoomed && s > ed\.fit \* 1\.05\) \{ ed\.zoomed = true; hint\(\); \}/);
  const steps = m.split('## Marking up a picture')[1].split('\n## ')[0];
  assert.match(steps, /\*\*pinch to zoom in\*\* \(scroll on a computer\)/);
});

test('the tool hint sits in the tool row, after Crop, so it shows beside it on a phone instead of below the screen', () => {
  const b = r('src/body.html');
  const row = b.split('id="toolRow"')[1].split('</div>')[0];
  assert.match(row, /data-tool="crop"[\s\S]*<p class="hint" id="toolHint" aria-live="polite"><\/p>\s*$/);
  assert.equal((b.match(/id="toolHint"/g) || []).length, 1);
  assert.match(r('src/style.css'), /\.tool-row \.hint\{flex:100 1 170px;/);
});
