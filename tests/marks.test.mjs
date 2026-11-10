// Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
// The marks: sizes that follow the picture, readable letters on every colour, hit-testing, handles, numbering, and
// drawing that never throws (a stand-in canvas records what would be drawn).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src/marks.js';
const M = globalThis.RemarkMarks;
const measure = (t, px) => t.length * px * 0.55;

// a 2D context stand-in: every call and property set is recorded
function fakeCtx() {
  const calls = [], state = {};
  return new Proxy(state, {
    get(t, k) { if (k === 'calls') return calls; if (k in t) return t[k]; return (...a) => { calls.push([k, ...a]); }; },
    set(t, k, v) { t[k] = v; calls.push(['set ' + String(k), v]); return true; }
  });
}

test('sizes follow the picture: a phone screenshot and a 12-megapixel photo both get readable text', () => {
  assert.equal(M.unit(1080, 2400), 10.8);
  assert.equal(M.unit(4000, 3000), 30);
  assert.equal(M.unit(100, 80), 3, 'never below 3 pixels');
  const t = { kind: 'text', x: 0, y: 0, text: 'Hi', style: 'label', size: 'm' };
  // about 3.4 % of the shorter side for M; S smaller, L larger
  assert.equal(M.fontPx(t, M.unit(1080, 2400)), 3.4 * 10.8);
  assert.ok(M.fontPx({ ...t, size: 's' }, 10) < M.fontPx(t, 10) && M.fontPx(t, 10) < M.fontPx({ ...t, size: 'l' }, 10));
});

test('label letters: white on red, green, blue and black; black on yellow and white (contrast at least 3.5)', () => {
  const want = { red: '#ffffff', green: '#ffffff', blue: '#ffffff', black: '#ffffff', yellow: '#000000', white: '#000000' };
  for (const [c, ink] of Object.entries(want)) assert.equal(M.ink(c), ink, c);
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  for (const c of Object.keys(M.COLOURS)) assert.ok(contrast(M.lum(c), M.ink(c) === '#ffffff' ? 1 : 0) >= 3.5, c);
});

test('text box: wider for longer text, one line per line, a label has room around the letters', () => {
  const t = { kind: 'text', x: 100, y: 200, text: 'Paid by Sam', style: 'label', size: 'm' };
  const b = M.textBox(t, 10, measure), b2 = M.textBox({ ...t, text: 'Paid by Sam and Alex' }, 10, measure);
  assert.ok(b2.w > b.w);
  assert.equal(b.x, 100);
  assert.ok(b.y < 200 && b.y + b.h > 200, 'the tap point is inside the first line');
  const two = M.textBox({ ...t, text: 'Line one\nLine two' }, 10, measure);
  assert.equal(two.lines.length, 2); assert.ok(two.h > b.h);
  assert.ok(M.textBox({ ...t, style: 'plain' }, 10, measure).pad < b.pad);
  assert.ok(M.textBox({ ...t, text: '' }, 10, measure).w > 0, 'an empty text still has a size');
});

test('hit-testing: labels, numbers and covers anywhere inside; boxes, circles and lines only near their line', () => {
  const U = 10, s = 2;
  const rect = { kind: 'rect', x: 100, y: 100, w: 200, h: 100, size: 'm' };
  assert.ok(M.hit(rect, 100, 150, U, s, measure), 'on the edge');
  assert.ok(!M.hit(rect, 200, 150, U, s, measure), 'not in the middle: a box can be drawn inside another');
  const cover = { kind: 'cover', x: 100, y: 100, w: 200, h: 100 };
  assert.ok(M.hit(cover, 200, 150, U, s, measure));
  const el = { kind: 'ellipse', x: 0, y: 0, w: 200, h: 100, size: 'm' };
  assert.ok(M.hit(el, 100, 0, U, s, measure) && M.hit(el, 0, 50, U, s, measure) && !M.hit(el, 100, 50, U, s, measure));
  const arrow = { kind: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, size: 'm' };
  assert.ok(M.hit(arrow, 50, 3, U, s, measure) && !M.hit(arrow, 50, 30, U, s, measure));
  const pen = { kind: 'pen', pts: [[0, 0], [50, 50]], size: 'm' };
  assert.ok(M.hit(pen, 25, 25, U, s, measure) && !M.hit(pen, 50, 0, U, s, measure));
  const num = { kind: 'number', x: 50, y: 50, size: 'm' };
  assert.ok(M.hit(num, 55, 55, U, s, measure) && !M.hit(num, 90, 90, U, s, measure));
  const text = { kind: 'text', x: 10, y: 10, text: 'Hello', style: 'label', size: 'm' };
  assert.ok(M.hit(text, 20, 10, U, s, measure) && !M.hit(text, 300, 10, U, s, measure));
  const callout = { kind: 'callout', x: 100, y: 100, text: 'Here', style: 'label', size: 'm', tx: 40, ty: 220 };
  assert.ok(M.hit(callout, 110, 100, U, s, measure), 'the label');
  assert.ok(M.hit(callout, 60, 190, U, s, measure), 'the pointer');
});

test('handles: ends of arrows and lines, a callout\'s tip, corners of boxes; dragging a corner past the opposite one keeps the size positive', () => {
  const a = { kind: 'arrow', x1: 0, y1: 0, x2: 10, y2: 10 };
  assert.deepEqual(M.handles(a), [[0, 0], [10, 10]]);
  M.dragHandle(a, 1, 50, 60); assert.deepEqual([a.x2, a.y2], [50, 60]);
  const c = { kind: 'callout', x: 0, y: 0, tx: 5, ty: 5, text: 'x' };
  assert.deepEqual(M.handles(c), [[5, 5]]);
  M.dragHandle(c, 0, 30, 40); assert.deepEqual([c.tx, c.ty], [30, 40]);
  const r = { kind: 'rect', x: 10, y: 10, w: 100, h: 50 };
  M.dragHandle(r, 3, 0, 0);   // bottom-right corner dragged above and left of the top-left one
  assert.deepEqual([r.x, r.y, r.w, r.h], [0, 0, 10, 10]);
  assert.deepEqual(M.handles({ kind: 'text', x: 0, y: 0, text: 'a' }), []);
});

test('moving: every point moves, a callout\'s tip with it', () => {
  const c = { kind: 'callout', x: 10, y: 10, tx: 0, ty: 50, text: 'x' };
  M.move(c, 5, -5); assert.deepEqual([c.x, c.y, c.tx, c.ty], [15, 5, 5, 45]);
  const p = { kind: 'pen', pts: [[0, 0], [1, 1]] };
  M.move(p, 2, 3); assert.deepEqual(p.pts, [[2, 3], [3, 4]]);
  const l = { kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1 };
  M.move(l, 1, 1); assert.deepEqual([l.x1, l.y1, l.x2, l.y2], [1, 1, 2, 2]);
});

test('numbers count in the order placed, and again from 1 when one is deleted', () => {
  const ms = [{ id: 1, kind: 'number' }, { id: 2, kind: 'text' }, { id: 3, kind: 'number' }, { id: 4, kind: 'number' }];
  assert.deepEqual([...M.numbers(ms)], [[1, 1], [3, 2], [4, 3]]);
  assert.deepEqual([...M.numbers(ms.filter(m => m.id !== 1))], [[3, 1], [4, 2]]);
});

test('drawing every kind, including empty and zero-length marks, never throws and always restores the canvas', () => {
  const marks = [
    { kind: 'text', x: 0, y: 0, text: 'Hi', style: 'label', colour: 'red', size: 'm' },
    { kind: 'text', x: 0, y: 0, text: '', style: 'outline', colour: 'white', size: 's' },
    { kind: 'text', x: 0, y: 0, text: 'จ่ายแล้ว\nline 2', style: 'plain', colour: 'blue', size: 'l' },
    { kind: 'callout', x: 50, y: 50, text: 'Look', style: 'label', colour: 'yellow', size: 'm', tx: 50, ty: 50 },
    { kind: 'arrow', x1: 5, y1: 5, x2: 5, y2: 5, colour: 'green', size: 'm' },
    { kind: 'line', x1: 0, y1: 0, x2: 9, y2: 9, colour: 'black', size: 'm' },
    { kind: 'ellipse', x: 0, y: 0, w: 0, h: 0, colour: 'red', size: 'm' },
    { kind: 'rect', x: 0, y: 0, w: 10, h: 10, colour: 'red', size: 'm' },
    { kind: 'number', x: 10, y: 10, colour: 'red', size: 'm' },
    { kind: 'highlight', pts: [[1, 1]], colour: 'yellow', size: 'm' },
    { kind: 'pen', pts: [[1, 1]], colour: 'red', size: 'm' },
    { kind: 'cover', x: 0, y: 0, w: 10, h: 10, fill: 'around' }
  ];
  for (const m of marks) {
    const ctx = fakeCtx();
    M.drawMark(ctx, m, 10, measure, 3, [1, 2, 3]);
    const names = ctx.calls.map(c => c[0]);
    assert.equal(names[0], 'save', m.kind); assert.equal(names[names.length - 1], 'restore', m.kind);
  }
});

test('the highlighter tints (multiply) instead of covering; a cover is filled with its colour', () => {
  const h = fakeCtx(); M.drawMark(h, { kind: 'highlight', pts: [[0, 0], [9, 0]], colour: 'yellow', size: 'm' }, 10, measure);
  assert.ok(h.calls.some(c => c[0] === 'set globalCompositeOperation' && c[1] === 'multiply'));
  const c = fakeCtx(); M.drawMark(c, { kind: 'cover', x: 1, y: 2, w: 3, h: 4, fill: 'around' }, 10, measure, 0, [10, 20, 30]);
  assert.ok(c.calls.some(x => x[0] === 'set fillStyle' && x[1] === 'rgb(10,20,30)'));
  assert.ok(c.calls.some(x => x[0] === 'fillRect' && x.slice(1).join() === '1,2,3,4'));
});

test('saving: covers are painted into the pixels after every other mark, and checked in the new file', () => {
  const s = readFileSync(new URL('../src/save.js', import.meta.url), 'utf8');
  const marks = s.indexOf("if (m.kind !== 'cover') M.drawMark"), fill = s.indexOf('Fill.fill(img.data'), put = s.indexOf('g.putImageData(img');
  assert.ok(marks > 0 && fill > marks && put > fill, 'marks drawn, then covers filled, then written back');
  assert.match(s, /Paint\.check\(\{ w: W, h: H, data: saved \}/, 'the saved file is decoded and checked');
  assert.match(s, /Clean\.clean\(/); assert.match(s, /left\.length\) \{[^}]*can\\'t be saved/, 'leftover hidden data blocks saving');
});
