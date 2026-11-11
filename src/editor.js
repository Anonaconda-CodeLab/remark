/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- Remark: the editor ----------
   One picture on a canvas with its marks drawn on top (marks.js). Tools: Text (the default), Callout, Arrow, Line,
   Circle, Box, Number, Highlighter, Pen, Cover, Crop. Tap a mark to select it: drag to move it, drag its handles to
   change it, tap a selected text to edit it. Pinch or scroll to zoom, two fingers (or one finger on empty space with
   the Text, Callout or Number tool) to move. Every change can be undone.
   The view (fit, zoom, keep in sight, pinch) and undo are adapted from Redact's src/editor.js (1.0.0, f84acd6). */
window.RemarkEditor = (() => {
  'use strict';
  const A = RemarkApp, $ = A.$, M = globalThis.RemarkMarks, Paint = globalThis.RedactPaint;
  const canvas = $('stage'), ctx = canvas.getContext('2d');
  const ed = { pic: null, disp: null, ds: 1, bmp: null, v: { s: 1, x: 0, y: 0 }, fit: 1, tool: 'text', sel: null, drag: null, temp: null, token: 0, editing: null };
  // the look of the next mark (and of the selected one when changed)
  const look = { colour: A.settings.colour, hcolour: 'yellow', size: 'm', tstyle: A.settings.tstyle, fill: 'black' };
  const U = () => M.unit(ed.pic.w, ed.pic.h);
  const mctx = document.createElement('canvas').getContext('2d');
  const measure = (t, px) => { mctx.font = M.font(px); return mctx.measureText(t).width; };

  // ---------- opening a picture ----------
  async function open(pic) {
    const token = ++ed.token;
    endText(); ed.pic = pic; ed.sel = null; ed.disp = null; ed.temp = null;
    if (ed.bmp) { ed.bmp.close(); ed.bmp = null; }
    A.show('scrEdit');
    $('stageBusy').hidden = false;
    head(); opts(); draw();
    try {
      await fontsReady;
      const bm = await createImageBitmap(new Blob([pic.bytes], { type: A.MIME[pic.type] }), { imageOrientation: 'from-image' });
      // the display copy: at most 2048 pixels on its longer side (covers take their colour from it on screen)
      const s = Math.min(1, 2048 / Math.max(bm.width, bm.height)), w = Math.max(1, Math.round(bm.width * s)), h = Math.max(1, Math.round(bm.height * s));
      const c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(bm, 0, 0, w, h); bm.close();
      if (token !== ed.token) return;
      ed.disp = g.getImageData(0, 0, w, h); ed.ds = w / pic.w;
      ed.bmp = await createImageBitmap(c);
      fitView(); draw();
      hint();
    } catch (e) { A.toast('Could not show this picture: ' + (e && e.message || e)); }
    finally { if (token === ed.token) $('stageBusy').hidden = true; }
  }
  // the bundled typefaces must be ready before text is measured or drawn
  const fontsReady = (async () => { try { await Promise.all([document.fonts.load(M.font(40), 'Aa'), document.fonts.load(M.font(40), 'ก')]); } catch (e) { /* the phone's own fonts */ } })();
  function head() {
    const pics = A.state.pics.filter(p => p.ready), i = pics.indexOf(ed.pic);
    $('editN').textContent = `Picture ${ed.pic.n}` + (pics.length > 1 ? ` (${i + 1} of ${pics.length})` : '');
    $('btnPrev').disabled = i <= 0; $('btnNext').disabled = i < 0 || i >= pics.length - 1;
    $('btnUndo').disabled = !ed.pic.hist.length; $('btnRedo').disabled = !ed.pic.fut.length;
  }
  const step = d => { const pics = A.state.pics.filter(p => p.ready), i = pics.indexOf(ed.pic); if (pics[i + d]) open(pics[i + d]); };
  $('btnPrev').onclick = () => step(-1);
  $('btnNext').onclick = () => step(1);
  $('btnEditBack').onclick = () => { endText(); A.show('scrHome'); };

  // ---------- undo: the marks and the crop together ----------
  const snap = p => JSON.stringify({ marks: p.marks, crop: p.crop });
  const restore = (p, s) => { const o = JSON.parse(s); p.marks = o.marks; p.crop = o.crop; };
  function remember() { const p = ed.pic; p.hist.push(snap(p)); if (p.hist.length > 100) p.hist.shift(); p.fut = []; }
  $('btnUndo').onclick = () => { endText(); const p = ed.pic; if (!p.hist.length) return; p.fut.push(snap(p)); restore(p, p.hist.pop()); ed.sel = null; changed(); };
  $('btnRedo').onclick = () => { endText(); const p = ed.pic; if (!p.fut.length) return; p.hist.push(snap(p)); restore(p, p.fut.pop()); ed.sel = null; changed(); };
  function changed() {
    if (!ed.pic) return;
    if (A.current === 'scrEdit') { head(); opts(); draw(); }
    A.describe(ed.pic);
  }

  // ---------- the view ----------
  const dpr = () => window.devicePixelRatio || 1;
  function fitView() {
    const r = canvas.getBoundingClientRect(), p = ed.pic;
    ed.fit = Math.min(r.width / p.w, r.height / p.h);
    ed.v = { s: ed.fit, x: (r.width - p.w * ed.fit) / 2, y: (r.height - p.h * ed.fit) / 2 };
  }
  const toScreen = (x, y) => [x * ed.v.s + ed.v.x, y * ed.v.s + ed.v.y];
  const toPic = (x, y) => [(x - ed.v.x) / ed.v.s, (y - ed.v.y) / ed.v.s];
  const selMark = () => ed.pic && ed.pic.marks.find(m => m.id === ed.sel);
  // a cover's colour on screen, from the display copy (the saved picture takes it from the full-size one)
  function coverRgb(m) {
    if (m.fill === 'white') return [255, 255, 255];
    if (m.fill !== 'around' || !ed.disp) return [0, 0, 0];
    const s = ed.ds;
    return Paint.around({ w: ed.disp.width, h: ed.disp.height, data: ed.disp.data }, { x: m.x * s, y: m.y * s, w: m.w * s, h: m.h * s });
  }
  function draw() {
    const r = canvas.getBoundingClientRect(), k = dpr();
    if (canvas.width !== Math.round(r.width * k) || canvas.height !== Math.round(r.height * k)) { canvas.width = Math.round(r.width * k); canvas.height = Math.round(r.height * k); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#121214'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!ed.pic || !ed.bmp) return;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(ed.bmp, ed.v.x, ed.v.y, ed.pic.w * ed.v.s, ed.pic.h * ed.v.s);
    // the marks, in picture pixels; covers last, as they will be saved
    const u = U(), nums = M.numbers(ed.pic.marks), all = ed.pic.marks.concat(ed.temp ? [ed.temp] : []);
    ctx.save();
    ctx.setTransform(k * ed.v.s, 0, 0, k * ed.v.s, k * ed.v.x, k * ed.v.y);
    for (const m of all) if (m.kind !== 'cover') M.drawMark(ctx, m, u, measure, nums.get(m.id) || (m === ed.temp ? nums.size + 1 : 0));
    for (const m of all) if (m.kind === 'cover') M.drawMark(ctx, m, u, measure, 0, coverRgb(m));
    ctx.restore();
    // the crop: outside it dimmed
    const crop = ed.tool === 'crop' && ed.temp && ed.temp.kind === 'crop' ? ed.temp : ed.pic.crop;
    if (crop) {
      const [x0, y0] = toScreen(crop.x, crop.y), [x1, y1] = toScreen(crop.x + crop.w, crop.y + crop.h), [px0, py0] = toScreen(0, 0), [px1, py1] = toScreen(ed.pic.w, ed.pic.h);
      ctx.fillStyle = ed.tool === 'crop' ? 'rgba(0,0,0,.55)' : 'rgba(18,18,20,.82)';
      ctx.beginPath(); ctx.rect(px0, py0, px1 - px0, py1 - py0); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.fill('evenodd');
      if (ed.tool === 'crop') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); for (const [hx, hy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) handle(hx, hy); }
    }
    // the selected mark: a dashed outline and its handles
    const m = selMark();
    if (m && ed.tool !== 'crop') {
      const b = M.bounds(m, u, measure), [x, y] = toScreen(b.x, b.y), pad = 6;
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffffff'; ctx.strokeRect(x - pad, y - pad, b.w * ed.v.s + 2 * pad, b.h * ed.v.s + 2 * pad);
      ctx.lineDashOffset = 4.5; ctx.strokeStyle = '#000000'; ctx.strokeRect(x - pad, y - pad, b.w * ed.v.s + 2 * pad, b.h * ed.v.s + 2 * pad);
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      for (const [hx, hy] of M.handles(m, u, measure)) handle(...toScreen(hx, hy));
    }
  }
  function handle(x, y) { ctx.beginPath(); ctx.arc(x, y, 7, 0, 2 * Math.PI); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#1e6fe0'; ctx.stroke(); }
  new ResizeObserver(() => { if (ed.pic && ed.bmp && A.current === 'scrEdit') { const was = ed.v.s / ed.fit; fitView(); if (was > 1.01) zoomAt(was, ...center()); draw(); } }).observe(canvas);
  const center = () => { const r = canvas.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
  function zoomAt(f, sx, sy) {
    const s = Math.max(ed.fit, Math.min(ed.fit * 12, ed.v.s * f));
    const [px, py] = toPic(sx, sy);
    ed.v.s = s; ed.v.x = sx - px * s; ed.v.y = sy - py * s;
    keepIn();
  }
  // the picture can't be moved out of sight
  function keepIn() {
    const r = canvas.getBoundingClientRect(), w = ed.pic.w * ed.v.s, h = ed.pic.h * ed.v.s;
    ed.v.x = w <= r.width ? (r.width - w) / 2 : Math.min(0, Math.max(r.width - w, ed.v.x));
    ed.v.y = h <= r.height ? (r.height - h) / 2 : Math.min(0, Math.max(r.height - h, ed.v.y));
  }
  canvas.addEventListener('wheel', e => { if (!ed.pic || !ed.bmp) return; e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY / 400), e.clientX - r.left, e.clientY - r.top); draw(); }, { passive: false });

  // ---------- tools and options ----------
  const HINTS = {
    text: 'Tap where the words go, then type.',
    callout: 'Tap where the words go and type, then drag the round handle to what it\'s about.',
    arrow: 'Drag from where the arrow starts to what it points at.',
    line: 'Drag to draw a straight line.',
    ellipse: 'Drag across what you want to circle.',
    rect: 'Drag across what you want to box.',
    number: 'Tap to place 1, 2, 3…',
    highlight: 'Drag over text to highlight it. It stays readable underneath.',
    pen: 'Draw freehand.',
    cover: 'Drag across anything to hide it. The cover becomes part of the picture.',
    crop: 'Drag the corners to keep only part of the picture.'
  };
  const TEXTY = new Set(['text', 'callout']);
  function hint() {
    const m = selMark();
    $('toolHint').textContent = m && ed.tool !== 'crop'
      ? (m.kind === 'callout' ? 'Drag the round handle to what it\'s about. Drag the label to move it.' : 'Drag to move. Tap empty space to deselect.')
      : HINTS[ed.tool];
  }
  function setTool(t) {
    endText();
    ed.tool = t; ed.sel = null;
    for (const b of $('toolRow').querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
    hint(); opts(); draw();
  }
  for (const b of $('toolRow').querySelectorAll('[data-tool]')) b.onclick = () => setTool(b.dataset.tool);
  // the option rows follow the tool, or the selected mark
  function opts() {
    const m = selMark(), kind = m ? m.kind : ed.tool;
    const colourFor = m ? m.colour : kind === 'highlight' ? look.hcolour : look.colour;
    $('optColours').hidden = kind === 'cover' || kind === 'crop';
    $('optSize').hidden = kind === 'cover' || kind === 'crop';
    $('optStyle').hidden = !TEXTY.has(kind);
    $('optFill').hidden = kind !== 'cover';
    $('optCrop').hidden = kind !== 'crop';
    $('optSel').hidden = !m;
    $('btnEditText').hidden = !m || !TEXTY.has(m.kind);
    for (const b of $('optColours').querySelectorAll('[data-colour]')) b.setAttribute('aria-pressed', String(b.dataset.colour === colourFor));
    for (const b of $('optSize').querySelectorAll('[data-size]')) b.setAttribute('aria-pressed', String(b.dataset.size === (m ? m.size : look.size)));
    for (const b of $('optStyle').querySelectorAll('[data-tstyle]')) b.setAttribute('aria-pressed', String(b.dataset.tstyle === (m ? m.style : look.tstyle)));
    for (const b of $('optFill').querySelectorAll('[data-fill]')) b.setAttribute('aria-pressed', String(b.dataset.fill === (m ? m.fill : look.fill)));
    $('btnCropReset').disabled = !ed.pic || !ed.pic.crop;
  }
  // a change applies to the selected mark (if any) and to the next marks
  function setLook(key, val) {
    const m = selMark();
    if (key === 'colour') { if ((m ? m.kind : ed.tool) === 'highlight') look.hcolour = val; else { look.colour = val; A.settings.colour = val; } }
    else if (key === 'style') { look.tstyle = val; A.settings.tstyle = val; }
    else look[key] = val;
    if (m) { remember(); m[key] = val; }
    A.saveSettings(); changed();
  }
  for (const b of $('optColours').querySelectorAll('[data-colour]')) b.onclick = () => setLook('colour', b.dataset.colour);
  for (const b of $('optSize').querySelectorAll('[data-size]')) b.onclick = () => setLook('size', b.dataset.size);
  for (const b of $('optStyle').querySelectorAll('[data-tstyle]')) b.onclick = () => setLook('style', b.dataset.tstyle);
  for (const b of $('optFill').querySelectorAll('[data-fill]')) b.onclick = () => setLook('fill', b.dataset.fill);
  $('btnDelete').onclick = () => {
    const m = selMark(); if (!m) return;
    if (ed.editing && ed.editing.m === m) { $('textIn').value = ''; typed(); endText(); return; }   // an empty text goes
    endText(); remember(); ed.pic.marks = ed.pic.marks.filter(x => x !== m); ed.sel = null; changed(); hint();
  };
  $('btnEditText').onclick = () => { const m = selMark(); if (m) startText(m, false); };
  $('btnCropReset').onclick = () => { if (!ed.pic.crop) return; remember(); ed.pic.crop = null; changed(); };
  $('btnCropDone').onclick = () => setTool('text');

  // ---------- typing: the text box under the picture, the words appear on the picture as they are typed ----------
  function startText(m, isNew) {
    if (!isNew) remember();   // a new text was remembered when it was placed
    ed.editing = { m, isNew, before: m.text };
    ed.sel = m.id;
    $('textBar').hidden = false;
    $('textIn').value = m.text || '';
    recents();
    opts(); draw();
    $('textIn').focus({ preventScroll: true });
    // keep the picture and the text box in view above the phone's keyboard
    setTimeout(() => $('textBar').scrollIntoView({ block: 'nearest' }), 250);
  }
  function recents() {
    $('recentRow').replaceChildren(...A.state.texts.map(t => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip-btn'; b.textContent = t.length > 32 ? t.slice(0, 31) + '…' : t; b.title = t;
      b.onclick = () => { $('textIn').value = t; typed(); endText(); };
      return b;
    }));
    $('recentRow').hidden = !A.state.texts.length;
  }
  const clean = t => String(t).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').slice(0, 500);
  function typed() { const e = ed.editing; if (!e) return; e.m.text = clean($('textIn').value); draw(); }
  // finish typing: an emptied text is removed (a new one leaves no undo step behind)
  function endText() {
    const e = ed.editing; if (!e) return;
    ed.editing = null;
    $('textBar').hidden = true; $('textIn').blur();
    const t = (e.m.text || '').trim();
    if (!t) {
      ed.pic.marks = ed.pic.marks.filter(x => x !== e.m);
      if (e.isNew) ed.pic.hist.pop();
      ed.sel = null;
    } else {
      e.m.text = e.m.text.replace(/\s+$/, '');
      if (!e.isNew && e.m.text === e.before) ed.pic.hist.pop();
      A.rememberText(e.m.text);
      // the next tap writes the next text (tap the text to move or change it); a callout stays selected, so its
      // round handle shows and can be dragged to what it is about
      ed.sel = e.m.kind === 'callout' ? e.m.id : null;
    }
    changed(); hint();
  }
  $('textIn').addEventListener('input', typed);
  $('textIn').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); endText(); }
    else if (e.key === 'Escape') { e.preventDefault(); endText(); }
  });
  $('btnTextDone').onclick = () => endText();

  // ---------- new marks ----------
  let idSeq = 0; const nextId = () => Date.now() * 1000 + (++idSeq % 1000);
  function newMark(kind, x, y) {
    const u = U(), colour = kind === 'highlight' ? look.hcolour : look.colour, base = { id: nextId(), kind, colour, size: look.size };
    switch (kind) {
      case 'text': return Object.assign(base, { x, y, text: '', style: look.tstyle });
      case 'callout': {
        // the tail starts pointing down and to the left; whichever side has room
        const tx = x - 6 * u >= 0 ? x - 6 * u : x + 6 * u, ty = y + 9 * u <= ed.pic.h ? y + 9 * u : y - 9 * u;
        return Object.assign(base, { x, y, text: '', style: look.tstyle, tx, ty });
      }
      case 'number': return Object.assign(base, { x, y });
      case 'arrow': case 'line': return Object.assign(base, { x1: x, y1: y, x2: x, y2: y });
      case 'ellipse': case 'rect': return Object.assign(base, { x, y, w: 0, h: 0 });
      case 'cover': return Object.assign(base, { x, y, w: 0, h: 0, fill: look.fill });
      case 'highlight': case 'pen': return Object.assign(base, { pts: [[x, y]] });
    }
  }
  const clampPic = (x, y) => [Math.max(0, Math.min(ed.pic.w, x)), Math.max(0, Math.min(ed.pic.h, y))];

  // the topmost mark under a point (covers are drawn last, so they come first)
  function hitAt(px, py) {
    const u = U(), slack = 12 / ed.v.s, ms = ed.pic.marks;
    const order = ms.filter(m => m.kind === 'cover').reverse().concat(ms.filter(m => m.kind !== 'cover').reverse());
    return order.find(m => M.hit(m, px, py, u, slack, measure)) || null;
  }
  function handleAt(sx, sy) {
    const m = selMark(); if (!m) return -1;
    return M.handles(m, U(), measure).findIndex(([hx, hy]) => { const [x, y] = toScreen(hx, hy); return Math.hypot(x - sx, y - sy) <= 20; });
  }

  // ---------- crop ----------
  function cropHandleAt(sx, sy) {
    const c = ed.pic.crop; if (!c) return -1;
    const pts = [[c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.h], [c.x + c.w, c.y + c.h]];
    return pts.findIndex(([hx, hy]) => { const [x, y] = toScreen(hx, hy); return Math.hypot(x - sx, y - sy) <= 24; });
  }

  // ---------- pointer handling: one finger uses the tool, two move and zoom ----------
  const pointers = new Map();
  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => {
    if (!ed.pic || !ed.bmp) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pos(e));
    if (pointers.size === 2) {   // a second finger: whatever the first one started becomes a pinch
      if (ed.drag && ed.drag.moved && ed.drag.undo) { ed.pic.hist.length && restore(ed.pic, ed.pic.hist.pop()); }
      ed.temp = null;
      const [a, b] = [...pointers.values()];
      ed.drag = { mode: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v0: Object.assign({}, ed.v) };
      draw(); return;
    }
    if (pointers.size > 2) return;
    if (ed.editing) endText();
    const [sx, sy] = pos(e), [px, py] = toPic(sx, sy);
    const start = [sx, sy], v0 = Object.assign({}, ed.v);
    if (ed.tool === 'crop') {
      const i = cropHandleAt(sx, sy), c = ed.pic.crop;
      if (i >= 0) ed.drag = { mode: 'cropHandle', i, start, box: Object.assign({}, c), undo: true };
      else if (c && px > c.x && px < c.x + c.w && py > c.y && py < c.y + c.h) ed.drag = { mode: 'cropMove', start, box: Object.assign({}, c), undo: true };
      else ed.drag = { mode: 'cropNew', start, p0: clampPic(px, py), undo: true };
      return;
    }
    // a handle of the selected mark, then any mark, then the tool on empty space
    const hi = handleAt(sx, sy);
    if (hi >= 0) { ed.drag = { mode: 'handle', i: hi, start, m: selMark(), undo: true }; return; }
    const m = hitAt(px, py);
    if (m) { ed.drag = { mode: 'move', start, m, last: [px, py], wasSel: ed.sel === m.id, undo: true }; return; }
    if (['arrow', 'line', 'ellipse', 'rect', 'cover', 'highlight', 'pen'].includes(ed.tool)) {
      const [cx, cy] = clampPic(px, py);
      ed.sel = null;
      ed.temp = newMark(ed.tool, cx, cy); ed.drag = { mode: 'draw', start, p0: [cx, cy] };
      opts(); draw(); return;
    }
    ed.drag = { mode: 'tap', start, v0 };   // Text, Callout, Number: a tap places one, a drag moves the view
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId) || !ed.drag) return;
    pointers.set(e.pointerId, pos(e));
    const d = ed.drag, [sx, sy] = pos(e), [px, py] = toPic(sx, sy);
    const far = Math.hypot(sx - d.start[0], sy - d.start[1]) > 6;
    if (d.mode === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      ed.v = Object.assign({}, d.v0);
      ed.v.x += mid[0] - d.m0[0]; ed.v.y += mid[1] - d.m0[1];
      zoomAt(dist / d.d0, mid[0], mid[1]);
    } else if (d.mode === 'tap' || d.mode === 'pan') {
      if (d.mode === 'tap' && far) d.mode = 'pan';
      if (d.mode === 'pan') { ed.v.x = d.v0.x + sx - d.start[0]; ed.v.y = d.v0.y + sy - d.start[1]; keepIn(); }
    } else if (d.mode === 'move') {
      if (!d.moved && !far) return;
      if (!d.moved) { remember(); d.moved = true; ed.sel = d.m.id; opts(); hint(); }
      M.move(d.m, px - d.last[0], py - d.last[1]); d.last = [px, py];
    } else if (d.mode === 'handle') {
      if (!d.moved) { remember(); d.moved = true; }
      M.dragHandle(d.m, d.i, ...clampPic(px, py));
    } else if (d.mode === 'draw') {
      const t = ed.temp, [cx, cy] = clampPic(px, py);
      if (t.pts) { const [lx, ly] = t.pts[t.pts.length - 1]; if (Math.hypot(cx - lx, cy - ly) * ed.v.s > 2) t.pts.push([cx, cy]); }
      else if (t.x1 !== undefined) { t.x2 = cx; t.y2 = cy; }
      else { const [ax, ay] = d.p0; t.x = Math.min(ax, cx); t.y = Math.min(ay, cy); t.w = Math.abs(cx - ax); t.h = Math.abs(cy - ay); }
    } else if (d.mode === 'cropNew') {
      if (!far) return;
      const [cx, cy] = clampPic(px, py), [ax, ay] = d.p0;
      ed.temp = { kind: 'crop', x: Math.min(ax, cx), y: Math.min(ay, cy), w: Math.abs(cx - ax), h: Math.abs(cy - ay) };
    } else if (d.mode === 'cropHandle' || d.mode === 'cropMove') {
      const b = d.box, dx = (sx - d.start[0]) / ed.v.s, dy = (sy - d.start[1]) / ed.v.s;
      let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
      if (d.mode === 'cropMove') { const mx = Math.max(-x0, Math.min(ed.pic.w - x1, dx)), my = Math.max(-y0, Math.min(ed.pic.h - y1, dy)); x0 += mx; x1 += mx; y0 += my; y1 += my; }
      else { if (d.i % 2 === 0) x0 += dx; else x1 += dx; if (d.i < 2) y0 += dy; else y1 += dy; }
      [x0, y0] = clampPic(x0, y0); [x1, y1] = clampPic(x1, y1);
      ed.temp = { kind: 'crop', x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    }
    draw();
  });
  const up = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const d = ed.drag; if (!d) return;
    if (d.mode === 'pinch') { if (!pointers.size) ed.drag = null; return; }   // the other finger lifting ends nothing
    ed.drag = null;
    if (e.type === 'pointercancel') { if (d.moved && d.undo && ed.pic.hist.length) restore(ed.pic, ed.pic.hist.pop()); ed.temp = null; changed(); return; }
    const [px, py] = toPic(...d.start);
    if (d.mode === 'tap') {
      // a tap on empty space: deselect, or place a new text, callout or number
      if (ed.sel) { ed.sel = null; opts(); hint(); draw(); return; }
      const [cx, cy] = clampPic(px, py);
      remember();
      const m = newMark(ed.tool, cx, cy);
      ed.pic.marks.push(m);
      if (TEXTY.has(m.kind)) startText(m, true); else changed();
    } else if (d.mode === 'move') {
      if (d.moved) { changed(); return; }
      // a tap on a mark selects it; a tap on a selected text edits it
      if (d.wasSel && TEXTY.has(d.m.kind)) { startText(d.m, false); return; }
      ed.sel = d.m.id; opts(); hint(); draw();
    } else if (d.mode === 'handle') { if (d.moved) { M.normalise(d.m); changed(); } }
    else if (d.mode === 'draw') {
      const t = ed.temp; ed.temp = null;
      const big = t.pts ? true : t.x1 !== undefined ? Math.hypot(t.x2 - t.x1, t.y2 - t.y1) * ed.v.s >= 8 : t.w * ed.v.s >= 6 && t.h * ed.v.s >= 6;
      if (big) { remember(); ed.pic.marks.push(t); changed(); } else draw();
    } else if (d.mode === 'cropNew' || d.mode === 'cropHandle' || d.mode === 'cropMove') {
      const t = ed.temp; ed.temp = null;
      if (t && t.w * ed.v.s >= 16 && t.h * ed.v.s >= 16) { remember(); ed.pic.crop = { x: Math.round(t.x), y: Math.round(t.y), w: Math.round(t.w), h: Math.round(t.h) }; }
      changed();
    } else draw();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  // keyboard on a computer: Delete removes the selected mark, Ctrl+Z / Ctrl+Y undo and redo
  document.addEventListener('keydown', e => {
    if (A.current !== 'scrEdit' || ed.editing || /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && ed.sel) { e.preventDefault(); $('btnDelete').click(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $(e.shiftKey ? 'btnRedo' : 'btnUndo').click(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); $('btnRedo').click(); }
    else if (e.key === 'Escape' && ed.sel) { ed.sel = null; opts(); hint(); draw(); }
  });

  $('btnDone').onclick = () => { endText(); if (ed.pic) RemarkSave.check(ed.pic); };
  setTool('text');

  return {
    open,
    changed() { if (ed.pic) changed(); },
    // Android Back while typing or with a mark selected: finish that first
    back() { if (ed.editing) { endText(); return true; } if (ed.sel) { ed.sel = null; opts(); hint(); draw(); return true; } return false; },
    get pic() { return ed.pic; },
    get selected() { return selMark() || null; }
  };
})();
