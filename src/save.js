/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- Remark: check and save ----------
   1. The original is decoded again at full size and turned upright; only the cropped part is kept.
   2. The marks are drawn into it (marks.js), then the covers are painted into the pixels (Redact's paint.js and fill),
      always last, so a cover hides everything under it, marks included.
   3. A new file is encoded from those pixels alone: nothing from the original file can reach it. It goes through
      Unmarked's cleaner (browsers add blocks of their own, such as a colour profile).
   4. The new file is decoded again: every pixel under a cover is the cover's colour (Redact's check), and Unmarked's
      inspector confirms it carries no hidden data.
   Saving, sharing, names and the donation card are adapted from Redact's src/save.js (1.0.0, f84acd6). */
window.RemarkSave = (() => {
  'use strict';
  const A = RemarkApp, $ = A.$, M = globalThis.RemarkMarks, Paint = globalThis.RedactPaint, Fill = globalThis.RedactDetect, Clean = globalThis.UnmarkedClean;
  let cur = null;   // { pic, bytes, mime, name, saved }
  const PICTURE_FINDINGS = new Set(['gps', 'location']);
  const mctx = new OffscreenCanvas(1, 1).getContext('2d');
  const measure = (t, px) => { mctx.font = M.font(px); return mctx.measureText(t).width; };

  function item(cls, text, note) {
    const li = document.createElement('li'), sp = document.createElement('span'); if (cls) li.className = cls;
    sp.append(text);
    if (note) { const s = document.createElement('small'); s.textContent = note; sp.append(s); }
    li.append(sp);
    $('checkList').append(li);
  }
  // A plain name by default (remark-3.jpg): an original name can say when the photo was taken (IMG_20261024_143512)
  // or what it shows (passport-jane-doe), and it travels with the picture. Settings can keep the original name.
  function outName(pic, ext) {
    if (A.settings.names !== 'original') return `remark-${pic.n}.${ext}`;
    const base = pic.name.replace(/\.[^.]{1,5}$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80) || 'picture';
    return `${base}-remark.${ext}`;
  }

  // the finished picture's pixels: { W, H, data (with marks and covers), orig (before covers), painted }
  async function render(pic) {
    const bm = await createImageBitmap(new Blob([pic.bytes], { type: A.MIME[pic.type] }), { imageOrientation: 'from-image' });
    const c = pic.crop ? { x: Math.max(0, Math.round(pic.crop.x)), y: Math.max(0, Math.round(pic.crop.y)), w: Math.round(pic.crop.w), h: Math.round(pic.crop.h) } : { x: 0, y: 0, w: bm.width, h: bm.height };
    c.w = Math.max(1, Math.min(c.w, bm.width - c.x)); c.h = Math.max(1, Math.min(c.h, bm.height - c.y));
    const W = c.w, H = c.h, cv = new OffscreenCanvas(W, H), g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(bm, -c.x, -c.y); bm.close();
    const plain = g.getImageData(0, 0, W, H);   // the picture as it was: covers take "colour from around" from it
    const U = M.unit(pic.w, pic.h), nums = M.numbers(pic.marks);
    g.save(); g.translate(-c.x, -c.y);
    for (const m of pic.marks) if (m.kind !== 'cover') M.drawMark(g, m, U, measure, nums.get(m.id) || 0);
    g.restore();
    const img = g.getImageData(0, 0, W, H);
    // covers in the cropped picture's pixels; colours from around are all taken first, so covers side by side don't
    // take each other's colour (as in Redact)
    const covers = pic.marks.filter(m => m.kind === 'cover').map(m => ({ cover: { id: m.id, on: true, x: m.x - c.x, y: m.y - c.y, w: m.w, h: m.h }, fill: m.fill }))
      .filter(({ cover: b }) => b.x < W && b.y < H && b.x + b.w > 0 && b.y + b.h > 0);
    const painted = covers.map(({ cover, fill }) => ({ cover, rgb: fill === 'white' ? [255, 255, 255] : fill === 'around' ? Paint.around({ w: W, h: H, data: plain.data }, cover) : [0, 0, 0] }));
    for (const { cover, rgb } of painted) Fill.fill(img.data, W, H, cover, rgb);
    g.putImageData(img, 0, 0);
    return { cv, W, H, orig: plain, painted };
  }

  async function check(pic) {
    const token = cur = { pic };
    A.show('scrCheck');
    $('checkTitle').textContent = 'Making a clean copy…'; $('checkSub').textContent = `Picture ${pic.n}`;
    $('checkProgress').hidden = false; $('checkImg').hidden = true; $('saveRow').hidden = true; $('btnCheckNext').hidden = true;
    $('origNote').hidden = true; $('saveHint').textContent = ''; $('checkList').replaceChildren();
    if ($('donateCard')) $('donateCard').hidden = true;
    let url = '';
    try {
      await document.fonts.ready;
      const mime = A.settings.format === 'png' ? 'image/png' : A.settings.format === 'jpeg' ? 'image/jpeg' : pic.type === 'png' ? 'image/png' : 'image/jpeg';
      const r = await render(pic), { W, H } = r;
      const blob = await r.cv.convertToBlob({ type: mime, quality: 0.92 });
      r.cv.width = r.cv.height = 1;
      if (blob.type !== mime) throw new Error('this browser could not write a ' + (mime === 'image/png' ? 'PNG' : 'JPEG'));
      const out = (await Clean.clean(new Uint8Array(await blob.arrayBuffer()))).bytes;
      if (token !== cur) return;
      // decoded again, pixel by pixel
      const back = await createImageBitmap(new Blob([out], { type: mime }));
      const c2 = new OffscreenCanvas(W, H), g2 = c2.getContext('2d', { willReadFrequently: true });
      g2.drawImage(back, 0, 0); back.close();
      const saved = g2.getImageData(0, 0, W, H).data;
      c2.width = c2.height = 1;
      const chk = Paint.check({ w: W, h: H, data: saved }, { w: W, h: H, data: r.orig.data }, r.painted, mime === 'image/png' ? 0 : 24);
      url = URL.createObjectURL(new Blob([out], { type: mime }));
      $('checkImg').src = url; $('checkImg').hidden = false;
      if (!chk.ok) {
        $('checkTitle').textContent = 'This picture can\'t be saved';
        item('bad', 'A cover didn\'t come out as it should.', 'Please report this (About → Questions or problems), with the kind of picture and covers. ' + chk.problems.map(p => p.why).join('; '));
        return;
      }
      const nMarks = pic.marks.filter(m => m.kind !== 'cover').length, nCovers = r.painted.length;
      item('', nMarks ? `${A.plural(nMarks, 'mark')} drawn into the picture.` : 'No marks: the picture is saved as it is.', 'A new picture: the marks are part of it, not a layer on top.');
      if (nCovers) item('', `${A.plural(nCovers, 'cover')} painted in and checked.`, 'Checked pixel by pixel in the new file: what was under them is gone, not hidden.');
      if (pic.crop) item('', 'Cropped.', 'The parts outside the crop are not in the new file.');
      // hidden data
      let had = [];
      try { had = ((await Clean.inspect(pic.bytes)).findings || []).filter(x => x.keep !== 'always'); } catch (e) { /* unreadable metadata: nothing to list */ }
      const left = ((await Clean.inspect(out)).findings || []).filter(x => x.keep !== 'always');
      if (token !== cur) return;
      if (left.length) { $('checkTitle').textContent = 'This picture can\'t be saved'; item('bad', 'The new file still carries hidden data.', left.map(x => x.label).join(', ') + '. Please report this (About → Questions or problems).'); return; }
      const where = had.some(x => PICTURE_FINDINGS.has(x.id) || /gps|location/i.test(x.id + x.label));
      item('', had.length ? `Hidden data removed: ${[...new Set(had.map(x => x.label))].slice(0, 6).join(', ')}${had.length > 6 ? '…' : ''}.` : 'No hidden data: the original had none, and the new file has none either.', had.length && where ? 'Including where the photo was taken.' : 'The new file holds the picture and nothing else.');
      const name = outName(pic, mime === 'image/png' ? 'png' : 'jpg');
      item('', `${mime === 'image/png' ? 'PNG' : 'JPEG'}, ${W} × ${H}, ${A.size(out.length)}.`, name);
      cur = { pic, bytes: out, mime, name, saved: false };
      $('checkTitle').textContent = 'Ready to save';
      $('checkSub').textContent = `Picture ${pic.n}`;
      $('saveRow').hidden = false;
      $('btnSave').textContent = 'Save';
      $('btnShare').hidden = !canShare(mime);
      $('btnCopy').hidden = !canCopy();
      $('origNote').hidden = false;
    } catch (e) {
      if (token !== cur) return;
      $('checkTitle').textContent = 'This picture couldn\'t be saved';
      item('bad', (e && e.message) || String(e), /memory|allocat|size|canvas/i.test(String(e && e.message)) ? 'It may be too large for this device. Try on a computer.' : '');
    } finally {
      if (token === cur || (cur && cur.pic === pic)) $('checkProgress').hidden = true;
      if (url && $('checkImg').src !== url) URL.revokeObjectURL(url);
    }
  }

  // ---------- saving, sharing, copying ----------
  function download(name, bytes, mime) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  // The Android app uses Android's "save as" screen, opening in the original's folder. Browsers that let a page open a
  // "save as" dialog (Chrome and Edge on a computer) use it. Others save to their download folder.
  const TYPES = { 'image/png': { description: 'PNG picture', accept: { 'image/png': ['.png'] } }, 'image/jpeg': { description: 'JPEG picture', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } } };
  async function saveAs(name, bytes, mime, startIn) {
    try {
      if (NATIVE) { const r = await RemarkNative.saveFile(name, bytes, mime, startIn); if (!r.saved) return false; A.toast('Saved.'); return 'saved'; }
      if (typeof window.showSaveFilePicker === 'function') {
        let handle;
        try { handle = await window.showSaveFilePicker({ suggestedName: name, id: 'remark-save', startIn: 'pictures', types: TYPES[mime] ? [TYPES[mime]] : undefined }); }
        catch (e) { if (e && e.name === 'AbortError') return false; handle = null; }
        if (handle) { const w = await handle.createWritable(); await w.write(new Blob([bytes], { type: mime })); await w.close(); A.toast(`Saved as ${handle.name}.`); return 'saved'; }
      }
      // a plain download: the browser may still ask where to save it, and the page never learns whether the person
      // went ahead or cancelled, so it is not called saved
      download(name, bytes, mime);
      return 'download';
    } catch (e) { if (!e || e.name !== 'AbortError') A.toast('Could not save: ' + (e && e.message || e)); return false; }
  }
  const canShare = mime => NATIVE || (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], 'x', { type: mime })] })); } catch (e) { return false; } })();
  // Copy picture (computers): pasted straight into a chat or an email. Browsers copy pictures as PNG only.
  const canCopy = () => !NATIVE && !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) && !matchMedia('(pointer: coarse)').matches;
  function saved() {
    const r = cur; r.saved = true; r.pic.done = true; r.pic.el.classList.add('done');
    $('btnSave').textContent = 'Save a copy';
    const next = A.state.pics.find(p => p.ready && !p.done && p !== r.pic);
    $('btnCheckNext').hidden = !next;
    countUse();
  }
  $('btnSave').onclick = async () => {
    const r = cur; if (!r || !r.bytes) return;
    const how = await saveAs(r.name, r.bytes, r.mime, r.pic.uri);
    if (how === 'saved') { $('saveHint').textContent = ''; saved(); }
    else if (how === 'download') {
      $('saveHint').textContent = 'Handed to your browser to download. If it asked and you cancelled, tap Save again.';
      const next = A.state.pics.find(p => p.ready && !p.done && p !== r.pic);
      $('btnCheckNext').hidden = !next;
    }
  };
  $('btnShare').onclick = async () => {
    const r = cur; if (!r || !r.bytes) return;
    try {
      if (NATIVE) await RemarkNative.share([{ name: r.name, bytes: r.bytes, mime: r.mime }]);
      else await navigator.share({ files: [new File([r.bytes], r.name, { type: r.mime })] });
      saved();
    } catch (e) { if (!e || e.name !== 'AbortError') A.toast('Could not share: ' + (e && e.message || e)); }
  };
  $('btnCopy').onclick = async () => {
    const r = cur; if (!r || !r.bytes) return;
    try {
      let png = new Blob([r.bytes], { type: r.mime });
      if (r.mime !== 'image/png') {   // made from the clean file's pixels, so nothing else comes along
        const bm = await createImageBitmap(png), c = new OffscreenCanvas(bm.width, bm.height);
        c.getContext('2d').drawImage(bm, 0, 0); bm.close();
        png = await c.convertToBlob({ type: 'image/png' });
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      A.toast('Copied. Paste it into a chat or an email.');
      saved();
    } catch (e) { A.toast('Could not copy: ' + (e && e.message || e)); }
  };
  function back() {
    if (cur && cur.bytes && !cur.saved && !confirm('Go back without saving? You can save again afterwards.')) return;
    const pic = cur && cur.pic; cur = null;
    if ($('checkImg').src.startsWith('blob:')) URL.revokeObjectURL($('checkImg').src);
    $('checkImg').removeAttribute('src');
    if (pic && !pic.removed) RemarkEditor.open(pic); else A.show('scrHome');
  }
  $('btnCheckBack').onclick = back;
  $('btnCheckNext').onclick = () => {
    const r = cur, next = A.state.pics.find(p => p.ready && !p.done && p !== (r && r.pic));
    cur = null; if ($('checkImg').src.startsWith('blob:')) URL.revokeObjectURL($('checkImg').src);
    if (next) RemarkEditor.open(next); else A.show('scrHome');
  };

  // ---------- gentle donation request (same as the studio's other apps) ----------
  // Each picture saved, shared or copied counts as one use. At 20, 50 and 100 uses a card appears under the save
  // buttons; "Not now" hides it until the next milestone, and after Ko-fi is tapped it never appears again.
  const SUP_KEY = 'remark.support', DONATE_AT = [20, 50, 100];
  const getSup = () => { try { return JSON.parse(localStorage.getItem(SUP_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const putSup = p => { try { localStorage.setItem(SUP_KEY, JSON.stringify(Object.assign(getSup(), p))); } catch (e) {} };
  function countUse() {
    const c = $('donateCard'); if (!c) return;
    const s = getSup(), n = (+s.uses || 0) + 1, m = DONATE_AT.filter(x => n >= x).pop() || 0;
    putSup({ uses: n });
    c.hidden = !!s.donateDone || !m || (+s.donateSeen || 0) >= m;
    if (!c.hidden) { $('donateN').textContent = n; c.dataset.m = m; }
  }
  if ($('donateCard')) {
    $('btnDonate').addEventListener('click', () => { putSup({ donateDone: true }); $('donateCard').hidden = true; });
    $('btnDonateLater').onclick = () => { putSup({ donateSeen: +$('donateCard').dataset.m }); $('donateCard').hidden = true; };
  }

  return { check, back, saveAs, render };
})();
