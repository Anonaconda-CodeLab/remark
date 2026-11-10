/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- Remark: the marks ----------
   Every mark is a plain object in picture pixels, so it can be moved, changed, undone and drawn again at any size.
   The same drawing code paints the screen (a smaller copy) and the full-size picture that is saved. No DOM, no
   network: runs in the page and in Node (the tests give it a stand-in for the canvas).

   A mark: { id, kind, colour, size, ... }
     text      { x, y, text, style }            x = left edge, y = middle of the first line; style 'label'|'outline'|'plain'
     callout   { x, y, text, style, tx, ty }    a text label with a pointer tail ending at (tx, ty)
     arrow     { x1, y1, x2, y2 }               the head is at (x2, y2)
     line      { x1, y1, x2, y2 }
     ellipse   { x, y, w, h }
     rect      { x, y, w, h }
     number    { x, y }                         a filled circle centred on (x, y); its number comes from numbers()
     highlight { pts: [[x, y], ...] }           see-through marker (darkens; text underneath stays readable)
     pen       { pts: [[x, y], ...] }
     cover     { x, y, w, h, fill }             fill 'black'|'white'|'around'; painted into the pixels when saving
   colour: a key of COLOURS; size: 's'|'m'|'l'.

   API (on the global RemarkMarks):
     COLOURS, SIZES, KINDS, unit(W, H), ink(colour), numbers(marks), bounds(m, U, measure), hit(m, x, y, U, slack, measure),
     handles(m, U, measure), dragHandle(m, i, x, y), move(m, dx, dy), normalise(m), drawMark(ctx, m, U, n, coverRgb),
     textBox(m, U, measure)
   U is the picture's unit (unit(W, H)): sizes scale with the picture, so the first tap gives readable text on a
   12-megapixel photo and on a phone screenshot alike. measure(text, fontPx) gives a text width in pixels. */
(function (root) {
  'use strict';
  const COLOURS = { red: '#e53935', yellow: '#fdd835', green: '#23843d', blue: '#1e6fe0', black: '#141414', white: '#ffffff' };
  const SIZES = { s: 0.7, m: 1, l: 1.45 };
  const KINDS = ['text', 'callout', 'arrow', 'line', 'ellipse', 'rect', 'number', 'highlight', 'pen', 'cover'];
  const FONT = '"Instrument Sans", "IBM Plex Sans Thai", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const font = px => `600 ${px}px ${FONT}`;

  // one hundredth of the picture's shorter side, at least 3 pixels
  const unit = (W, H) => Math.max(3, Math.min(W, H) / 100);
  const hex = c => COLOURS[c] || c || COLOURS.red;
  const rgbOf = h => { const n = parseInt(hex(h).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  // relative luminance (WCAG); black or white, whichever reads better on the colour
  function lum(c) { return rgbOf(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); }
  // white letters whenever they read well enough (white on red is the usual look), otherwise black
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const ink = c => contrast(lum(c), 1) >= 3.5 ? '#ffffff' : '#000000';
  const k = m => SIZES[m.size] || 1;

  // sizes in picture pixels
  const fontPx = (m, U) => 3.4 * U * k(m);
  const lineW = (m, U) => (m.kind === 'highlight' ? 3.2 : 0.55) * U * k(m);
  const numR = (m, U) => 1.8 * U * k(m);

  // the label: lines of text in a box, x = left edge of the box, y = middle of the first line
  function textBox(m, U, measure) {
    const fs = fontPx(m, U), lines = String(m.text || '').split('\n'), lh = fs * 1.22;
    const pad = m.style === 'label' ? fs * 0.38 : fs * 0.12;
    const w = Math.max(fs * 0.5, ...lines.map(l => measure(l, fs))) + 2 * pad;
    const h = lh * lines.length + 2 * pad - (lh - fs);
    return { fs, lh, pad, lines, x: m.x, y: m.y - fs / 2 - pad, w, h };
  }

  function bounds(m, U, measure) {
    switch (m.kind) {
      case 'text': return textBox(m, U, measure);
      case 'callout': { const b = textBox(m, U, measure), x0 = Math.min(b.x, m.tx), y0 = Math.min(b.y, m.ty); return { x: x0, y: y0, w: Math.max(b.x + b.w, m.tx) - x0, h: Math.max(b.y + b.h, m.ty) - y0 }; }
      case 'arrow': case 'line': { const x0 = Math.min(m.x1, m.x2), y0 = Math.min(m.y1, m.y2); return { x: x0, y: y0, w: Math.abs(m.x2 - m.x1), h: Math.abs(m.y2 - m.y1) }; }
      case 'number': { const r = numR(m, U); return { x: m.x - r, y: m.y - r, w: 2 * r, h: 2 * r }; }
      case 'highlight': case 'pen': {
        const xs = m.pts.map(p => p[0]), ys = m.pts.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), r = lineW(m, U) / 2;
        return { x: x0 - r, y: y0 - r, w: Math.max(...xs) - x0 + 2 * r, h: Math.max(...ys) - y0 + 2 * r };
      }
      default: return { x: m.x, y: m.y, w: m.w, h: m.h };
    }
  }

  // distance from (px, py) to the segment a-b
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    return Math.hypot(ax + t * dx - px, ay + t * dy - py);
  }
  const inBox = (b, x, y, s) => x >= b.x - s && x <= b.x + b.w + s && y >= b.y - s && y <= b.y + b.h + s;
  // Is (x, y) on the mark? Filled things (labels, numbers, covers) anywhere inside; outlines and strokes only near the
  // line, so a box can be drawn inside another box.
  function hit(m, x, y, U, slack, measure) {
    const lw = lineW(m, U) / 2 + slack;
    switch (m.kind) {
      case 'text': return inBox(textBox(m, U, measure), x, y, slack);
      case 'callout': return inBox(textBox(m, U, measure), x, y, slack) || segDist(x, y, ...tailBase(m, U, measure).c, m.tx, m.ty) <= lw + fontPx(m, U) * 0.15;
      case 'arrow': case 'line': return segDist(x, y, m.x1, m.y1, m.x2, m.y2) <= lw;
      case 'number': return Math.hypot(x - m.x, y - m.y) <= numR(m, U) + slack;
      case 'cover': return inBox(m, x, y, slack);
      case 'rect': return inBox(m, x, y, lw) && !(x > m.x + lw && x < m.x + m.w - lw && y > m.y + lw && y < m.y + m.h - lw);
      case 'ellipse': {
        const rx = m.w / 2, ry = m.h / 2, cx = m.x + rx, cy = m.y + ry;
        if (rx < 1 || ry < 1) return inBox(m, x, y, lw);
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry), r = Math.min(rx, ry);
        return Math.abs(d - 1) * r <= lw;
      }
      case 'highlight': case 'pen': {
        if (m.pts.length === 1) return Math.hypot(x - m.pts[0][0], y - m.pts[0][1]) <= lw;
        for (let i = 1; i < m.pts.length; i++) if (segDist(x, y, ...m.pts[i - 1], ...m.pts[i]) <= lw) return true;
        return false;
      }
    }
    return false;
  }

  // drag handles, in picture pixels: ends of lines and arrows, the tip of a callout, the corners of boxes
  function handles(m, U, measure) {
    switch (m.kind) {
      case 'arrow': case 'line': return [[m.x1, m.y1], [m.x2, m.y2]];
      case 'callout': return [[m.tx, m.ty]];
      case 'rect': case 'ellipse': case 'cover': return [[m.x, m.y], [m.x + m.w, m.y], [m.x, m.y + m.h], [m.x + m.w, m.y + m.h]];
    }
    return [];
  }
  function dragHandle(m, i, x, y) {
    if (m.kind === 'arrow' || m.kind === 'line') { if (i === 0) { m.x1 = x; m.y1 = y; } else { m.x2 = x; m.y2 = y; } }
    else if (m.kind === 'callout') { m.tx = x; m.ty = y; }
    else if (m.w !== undefined) {
      // the opposite corner stays put; normalise() afterwards makes w and h positive again
      const ox = i % 2 === 0 ? m.x + m.w : m.x, oy = i < 2 ? m.y + m.h : m.y;
      m.x = Math.min(x, ox); m.y = Math.min(y, oy); m.w = Math.abs(ox - x); m.h = Math.abs(oy - y);
    }
  }
  function move(m, dx, dy) {
    if (m.pts) { for (const p of m.pts) { p[0] += dx; p[1] += dy; } return; }
    if (m.x1 !== undefined) { m.x1 += dx; m.y1 += dy; m.x2 += dx; m.y2 += dy; return; }
    m.x += dx; m.y += dy;
    if (m.kind === 'callout') { m.tx += dx; m.ty += dy; }
  }
  function normalise(m) {
    if (m.w !== undefined && m.kind !== 'text' && m.kind !== 'callout') {
      if (m.w < 0) { m.x += m.w; m.w = -m.w; }
      if (m.h < 0) { m.y += m.h; m.h = -m.h; }
    }
    return m;
  }

  // numbered markers count up in the order they were placed; deleting one renumbers the rest
  function numbers(marks) { const n = new Map(); let i = 0; for (const m of marks) if (m.kind === 'number') n.set(m.id, ++i); return n; }

  // the two corners of a callout's tail where it leaves the label (the label is drawn over them)
  function tailBase(m, U, measure) {
    const b = textBox(m, U, measure), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const dx = m.tx - cx, dy = m.ty - cy, L = Math.hypot(dx, dy) || 1, half = Math.min(b.fs * 0.55, b.h * 0.42, b.w * 0.3);
    const nx = -dy / L * half, ny = dx / L * half;
    return { c: [cx, cy], a: [cx + nx, cy + ny], b: [cx - nx, cy - ny], box: b };
  }

  // ---------- drawing ----------
  // A faint edge in the contrasting colour keeps strokes visible on any background (red on red, white on paper).
  function strokePath(ctx, m, U, path) {
    const lw = lineW(m, U), c = hex(m.colour);
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.35; ctx.strokeStyle = ink(m.colour); ctx.lineWidth = lw + Math.max(1, lw * 0.5);
    ctx.beginPath(); path(); ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = c; ctx.lineWidth = lw;
    ctx.beginPath(); path(); ctx.stroke();
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawLabel(ctx, m, U, b) {
    const c = hex(m.colour), fg = ink(m.colour);
    ctx.font = font(b.fs); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    if (m.style === 'label') {
      ctx.beginPath(); roundRect(ctx, b.x, b.y, b.w, b.h, b.fs * 0.3);
      ctx.fillStyle = c; ctx.fill();
      ctx.globalAlpha = 0.3; ctx.strokeStyle = fg; ctx.lineWidth = Math.max(1, b.fs * 0.05); ctx.stroke(); ctx.globalAlpha = 1;
    }
    b.lines.forEach((l, i) => {
      const x = b.x + b.pad, y = m.y + i * b.lh;
      if (m.style === 'outline') { ctx.lineJoin = 'round'; ctx.strokeStyle = fg; ctx.lineWidth = b.fs * 0.22; ctx.strokeText(l, x, y); }
      ctx.fillStyle = m.style === 'label' ? fg : c;
      ctx.fillText(l, x, y);
    });
  }
  function arrowHead(m, U) {
    const lw = lineW(m, U), len = Math.max(lw * 4, 2.2 * U * k(m)), a = Math.atan2(m.y2 - m.y1, m.x2 - m.x1), sp = 0.48;
    const L = Math.hypot(m.x2 - m.x1, m.y2 - m.y1), hl = Math.min(len, L * 0.6);
    return { hl, l: [m.x2 - hl * Math.cos(a - sp), m.y2 - hl * Math.sin(a - sp)], r: [m.x2 - hl * Math.cos(a + sp), m.y2 - hl * Math.sin(a + sp)], base: [m.x2 - hl * 0.8 * Math.cos(a), m.y2 - hl * 0.8 * Math.sin(a)] };
  }

  // ctx is set up in picture pixels; n: this number marker's number; coverRgb: the cover's colour as [r, g, b]
  function drawMark(ctx, m, U, measure, n, coverRgb) {
    ctx.save();
    const c = hex(m.colour);
    switch (m.kind) {
      case 'text': drawLabel(ctx, m, U, textBox(m, U, measure)); break;
      case 'callout': {
        const t = tailBase(m, U, measure);
        ctx.beginPath(); ctx.moveTo(...t.a); ctx.lineTo(m.tx, m.ty); ctx.lineTo(...t.b); ctx.closePath();
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.35; ctx.strokeStyle = ink(m.colour); ctx.lineWidth = Math.max(1, t.box.fs * 0.08); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = c; ctx.fill();
        drawLabel(ctx, m, U, t.box);
        break;
      }
      case 'line': strokePath(ctx, m, U, () => { ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2, m.y2); }); break;
      case 'arrow': {
        const h = arrowHead(m, U);
        const head = () => { ctx.moveTo(m.x2, m.y2); ctx.lineTo(...h.l); ctx.lineTo(...h.r); ctx.closePath(); };
        const lw = lineW(m, U);
        // the edge first (shaft and head), then the colour
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.35; ctx.strokeStyle = ctx.fillStyle = ink(m.colour); ctx.lineWidth = lw + Math.max(1, lw * 0.5);
        ctx.beginPath(); ctx.moveTo(m.x1, m.y1); ctx.lineTo(...h.base); ctx.stroke();
        ctx.lineWidth = Math.max(1, lw * 0.5); ctx.beginPath(); head(); ctx.stroke();
        ctx.globalAlpha = 1; ctx.strokeStyle = ctx.fillStyle = c; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(m.x1, m.y1); ctx.lineTo(...h.base); ctx.stroke();
        ctx.beginPath(); head(); ctx.fill();
        break;
      }
      case 'rect': strokePath(ctx, m, U, () => { const r = lineW(m, U) * 0.6; roundRect(ctx, m.x, m.y, m.w, m.h, r); }); break;
      case 'ellipse': strokePath(ctx, m, U, () => { ctx.ellipse(m.x + m.w / 2, m.y + m.h / 2, Math.max(0.5, m.w / 2), Math.max(0.5, m.h / 2), 0, 0, 2 * Math.PI); }); break;
      case 'pen': strokePath(ctx, m, U, () => { ctx.moveTo(...m.pts[0]); if (m.pts.length === 1) ctx.lineTo(m.pts[0][0] + 0.01, m.pts[0][1]); for (const p of m.pts.slice(1)) ctx.lineTo(...p); }); break;
      case 'highlight': {
        // multiply: the colour tints what's underneath without hiding it (dark text stays dark)
        ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.55;
        ctx.strokeStyle = c; ctx.lineWidth = lineW(m, U); ctx.lineCap = ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(...m.pts[0]); if (m.pts.length === 1) ctx.lineTo(m.pts[0][0] + 0.01, m.pts[0][1]); for (const p of m.pts.slice(1)) ctx.lineTo(...p); ctx.stroke();
        break;
      }
      case 'number': {
        const r = numR(m, U);
        ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = c; ctx.fill();
        ctx.globalAlpha = 0.4; ctx.strokeStyle = ink(m.colour); ctx.lineWidth = Math.max(1, r * 0.1); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = ink(m.colour); ctx.font = font(r * (String(n).length > 1 ? 1.0 : 1.2)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(n || ''), m.x, m.y + r * 0.04);
        break;
      }
      case 'cover': {
        const rgb = coverRgb || (m.fill === 'white' ? [255, 255, 255] : [0, 0, 0]);
        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; ctx.fillRect(m.x, m.y, m.w, m.h);
        break;
      }
    }
    ctx.restore();
  }

  root.RemarkMarks = { COLOURS, SIZES, KINDS, FONT, font, unit, ink, lum, numbers, bounds, hit, handles, dragHandle, move, normalise, drawMark, textBox, fontPx, lineW, numR, segDist, arrowHead };
})(typeof globalThis !== 'undefined' ? globalThis : this);
