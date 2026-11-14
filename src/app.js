/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- Remark: the app ----------
   Opens pictures, lets the person write and draw on them (editor.js, marks.js), then redraws a full-size copy, saves
   it as a new file and checks it (save.js, with Unmarked's cleaner). Adapted from Redact's src/app.js (1.0.0, f84acd6)
   without detection. Nothing leaves the device: the page's policy blocks every connection. */
const RemarkApp = (() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const APP = { name: '{{APP_NAME}}', version: '{{VERSION}}' };
  const P = globalThis.RedactPicture;
  const MAX_BYTES = 60 * 1024 * 1024;   // larger files are refused before they are read in full
  const MAX_PICS = 20;                  // pictures open at once (each keeps its file in memory)
  const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const size = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;

  // ---------- settings: kept only when the person asks ----------
  const SET_KEY = 'remark.settings', TEXTS_KEY = 'remark.texts', TEXT_MAX = 200;   // recent texts: at most 200 characters each
  const COLOURS = Object.keys(globalThis.RemarkMarks.COLOURS);
  const settings = { format: 'auto', names: 'plain', colour: 'red', tstyle: 'label', remember: false, rememberTexts: false };
  try {
    const s = JSON.parse(localStorage.getItem(SET_KEY) || 'null');
    if (s && typeof s === 'object') {
      if (['auto', 'png', 'jpeg'].includes(s.format)) settings.format = s.format;
      if (['plain', 'original'].includes(s.names)) settings.names = s.names;
      if (COLOURS.includes(s.colour)) settings.colour = s.colour;
      if (['label', 'outline', 'plain'].includes(s.tstyle)) settings.tstyle = s.tstyle;
      settings.rememberTexts = s.rememberTexts === true;
      settings.remember = true;
    }
  } catch (e) { /* storage off: defaults */ }
  function saveSettings() {
    try {
      if (settings.remember) localStorage.setItem(SET_KEY, JSON.stringify({ format: settings.format, names: settings.names, colour: settings.colour, tstyle: settings.tstyle, rememberTexts: settings.rememberTexts }));
      else localStorage.removeItem(SET_KEY);
      if (!settings.remember || !settings.rememberTexts) localStorage.removeItem(TEXTS_KEY);
      else localStorage.setItem(TEXTS_KEY, JSON.stringify(state.texts));
    } catch (e) { /* storage off */ }
  }

  // ---------- screens ----------
  const screens = ['scrHome', 'scrEdit', 'scrCheck', 'scrSettings', 'scrAbout', 'scrHelp', 'scrLicences'];
  let current = 'scrHome';
  const listeners = [];
  function show(id) {
    for (const s of screens) $(s).hidden = s !== id;
    const was = current; current = id;
    window.scrollTo(0, 0);
    for (const fn of listeners) fn(id, was);
  }
  let toastTimer = 0;
  // act: an optional { label, fn } button in the message (such as Undo)
  function toast(msg, act) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    if (act) { const b = document.createElement('button'); b.className = 'toast-act'; b.textContent = act.label; b.onclick = () => { t.hidden = true; act.fn(); }; t.append(b); }
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }

  // ---------- recent texts: the last few things typed, for one tap next time ----------
  const state = { pics: [], texts: [], queue: Promise.resolve(), queued: 0, nativeIds: new Set(), next: 1, openFirst: false };
  try { if (settings.remember && settings.rememberTexts) { const t = JSON.parse(localStorage.getItem(TEXTS_KEY) || '[]'); if (Array.isArray(t)) state.texts = t.filter(x => typeof x === 'string' && x.length <= TEXT_MAX).slice(0, 8); } } catch (e) { /* storage off */ }
  function rememberText(t) {
    t = String(t || '').trim(); if (!t || t.length > TEXT_MAX) return;   // long texts aren't kept as one-tap chips
    state.texts = [t].concat(state.texts.filter(x => x !== t)).slice(0, 8);
    saveSettings();
  }

  // ---------- pictures ----------
  function describe(pic) {
    const el = pic.el; if (!el) return;
    el.querySelector('.pic-n').textContent = `Picture ${pic.n}`;
    const st = el.querySelector('.pic-state');
    if (pic.error) { el.classList.add('failed'); st.textContent = pic.error; return; }
    if (!pic.ready) { st.textContent = pic.status || 'Waiting…'; return; }
    const n = pic.marks.length;
    st.textContent = (n ? plural(n, 'mark') : 'No marks yet') + (pic.crop ? ' · cropped' : '');
    el.querySelector('.busy-veil').hidden = true;
  }
  function renderList() {
    $('picsWrap').hidden = !state.pics.length;
    $('pics').replaceChildren(...state.pics.map(p => p.el));
    $('addRow').classList.toggle('compact', state.pics.length > 0);
  }
  // marks or a crop that haven't been saved (a picture with neither is the original, which stays as it was)
  const unsaved = p => !p.done && (p.marks.length > 0 || !!p.crop);
  function removePic(pic) {
    state.pics = state.pics.filter(p => p !== pic);
    pic.removed = true; pic.bytes = null;
    if (pic.thumb) URL.revokeObjectURL(pic.thumb);
    renderList();
  }

  // a picked, dropped or pasted File, or a file the Android app holds ({ native: true, id, name, size, mime, uri })
  function addFiles(list) {
    let skipped = 0;
    // one picture opened with nothing else open goes straight to the editor: the quickest way to a note on a receipt
    state.openFirst = list.length === 1 && !state.pics.length;
    for (const f of list) {
      if (state.pics.length >= MAX_PICS) { skipped++; continue; }
      const pic = { n: state.next++, name: String(f.name || 'picture'), file: f, marks: [], crop: null, hist: [], fut: [], status: 'Waiting…' };
      const el = pic.el = $('tplPic').content.firstElementChild.cloneNode(true);
      const open = () => { if (pic.ready) RemarkEditor.open(pic); else if (!pic.error) toast('Still opening this picture…'); };
      el.querySelector('.pic-thumb').onclick = open;
      el.querySelector('.pic-info').onclick = open;
      el.querySelector('[data-a="remove"]').onclick = () => {
        if (unsaved(pic) && !confirm('Close this picture? Its changes haven\'t been saved.')) return;
        removePic(pic);
      };
      state.pics.push(pic); describe(pic);
      state.queued++;
      state.queue = state.queue.then(() => load(pic)).catch(() => {}).finally(() => { if (--state.queued === 0 && NATIVE) { RemarkNative.release(); state.nativeIds.clear(); } });
    }
    renderList();
    if (skipped) toast(`${plural(skipped, 'picture')} not opened: ${MAX_PICS} at once is the limit. Close some to open more.`);
  }

  async function load(pic) {
    const el = pic.el, f = pic.file; pic.file = null;
    const fail = msg => { pic.error = msg; el.querySelector('.busy-veil').hidden = true; describe(pic); };
    if (pic.removed) return;
    let bitmap = null;
    try {
      pic.status = 'Opening…'; describe(pic);
      // Not f.bytes on a File: browsers give every File a bytes() method
      let bytes;
      if (f instanceof Blob) { if (f.size > MAX_BYTES) return fail(`Too large (over ${size(MAX_BYTES)}).`); bytes = new Uint8Array(await f.arrayBuffer()); }
      else { bytes = await RemarkNative.readOne(f); if (!bytes) return fail(`Too large (over ${size(MAX_BYTES)}).`); pic.uri = f.uri || ''; }
      const big = P.tooLarge(bytes);
      if (big) return fail(big.bad ? 'This picture looks damaged: its size could not be read.' : `Too large to open safely (${Math.round(big.w * big.h / 1e6)} megapixels; the limit is ${P.MAX_PIXELS / 1e6}).`);
      const kind = P.pictureSize(bytes);
      if (!kind || !MIME[kind.type]) return fail(kind ? `${kind.type.toUpperCase()} pictures can't be opened yet: use JPEG, PNG or WebP.` : 'Not a picture Remark can open (JPEG, PNG or WebP).');
      pic.bytes = bytes; pic.type = kind.type;
      bitmap = await createImageBitmap(new Blob([bytes], { type: MIME[kind.type] }), { imageOrientation: 'from-image' });
      pic.w = bitmap.width; pic.h = bitmap.height;
      // the thumbnail, made here and kept small
      const s = 160 / Math.max(pic.w, pic.h), tc = new OffscreenCanvas(Math.max(1, Math.round(pic.w * s)), Math.max(1, Math.round(pic.h * s)));
      tc.getContext('2d').drawImage(bitmap, 0, 0, tc.width, tc.height);
      const thumb = await tc.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
      if (pic.removed) return;   // closed while it was opening: no thumbnail address to let go of later
      pic.thumb = URL.createObjectURL(thumb);
      el.querySelector('img').src = pic.thumb;
      pic.ready = true;
      describe(pic);
      if (state.openFirst && state.pics[0] === pic && current === 'scrHome') { state.openFirst = false; RemarkEditor.open(pic); }
    } catch (e) {
      fail('Could not open this picture: ' + (e && e.message || e));
    } finally { if (bitmap) bitmap.close(); }
  }

  // ---------- settings screen ----------
  let settingsFrom = 'scrHome';
  const pressAll = (box, attr, val) => { for (const b of $(box).querySelectorAll(`[data-${attr}]`)) b.setAttribute('aria-pressed', String(b.dataset[attr] === val)); };
  $('btnSettings').onclick = () => {
    if (current === 'scrSettings') return;
    settingsFrom = ['scrEdit', 'scrHome'].includes(current) ? current : 'scrHome';
    pressAll('formatChips', 'format', settings.format);
    pressAll('nameChips', 'names', settings.names);
    $('setRemember').checked = settings.remember;
    $('setTexts').checked = settings.rememberTexts; $('setTexts').disabled = !settings.remember;
    show('scrSettings');
  };
  for (const b of $('formatChips').querySelectorAll('[data-format]')) b.onclick = () => { settings.format = b.dataset.format; pressAll('formatChips', 'format', settings.format); saveSettings(); };
  for (const b of $('nameChips').querySelectorAll('[data-names]')) b.onclick = () => { settings.names = b.dataset.names; pressAll('nameChips', 'names', settings.names); saveSettings(); };
  $('setRemember').onchange = e => { settings.remember = e.target.checked; $('setTexts').disabled = !settings.remember; if (!settings.remember) { settings.rememberTexts = false; $('setTexts').checked = false; } saveSettings(); };
  $('setTexts').onchange = e => { settings.rememberTexts = e.target.checked; saveSettings(); };
  $('btnForgetTexts').onclick = () => { state.texts = []; saveSettings(); toast('Recent texts forgotten.'); };
  $('btnSettingsBack').onclick = () => { show(settingsFrom); if (settingsFrom === 'scrEdit') RemarkEditor.changed(); };

  // ---------- opening pictures ----------
  $('photoInput').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('fileInput').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  const home = $('scrHome');
  home.addEventListener('dragover', e => { e.preventDefault(); home.classList.add('drop'); });
  home.addEventListener('dragleave', e => { if (e.target === home) home.classList.remove('drop'); });
  home.addEventListener('drop', e => { e.preventDefault(); home.classList.remove('drop'); if (e.dataTransfer && e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });
  // a screenshot pasted with Ctrl+V (on the start screen; in the editor the text box gets the paste)
  document.addEventListener('paste', e => {
    if (current !== 'scrHome' || !e.clipboardData) return;
    const files = [...e.clipboardData.files].filter(f => /^image\//.test(f.type));
    if (!files.length) return;
    e.preventDefault();
    addFiles(files.map((f, i) => new File([f], `pasted-${state.next + i}.${f.type === 'image/png' ? 'png' : 'jpg'}`, { type: f.type })));
  });
  $('btnClearAll').onclick = () => {
    if (state.pics.some(unsaved) && !confirm('Close all pictures? Changes you haven\'t saved are lost.')) return;
    for (const p of state.pics.slice()) removePic(p);
  };
  // Android: its own picker (photos, or any file), and pictures shared to Remark
  const nativeAdd = list => addFiles(list.filter(d => !state.nativeIds.has(d.id)).map(d => { state.nativeIds.add(d.id); return Object.assign({ native: true }, d); }));
  if (NATIVE) {
    $('photosLbl').hidden = $('filesLbl').hidden = true;
    $('btnPhotosN').hidden = $('btnFilesN').hidden = false;
    $('btnPhotosN').onclick = () => RemarkNative.pickFiles('images').then(nativeAdd).catch(e => toast('Could not open the pictures: ' + (e && e.message || e)));
    $('btnFilesN').onclick = () => RemarkNative.pickFiles('any').then(nativeAdd).catch(e => toast('Could not open the files: ' + (e && e.message || e)));
    const take = () => RemarkNative.takeShared().then(l => { if (l.length) { show('scrHome'); nativeAdd(l); } }).catch(() => {});
    RemarkNative.onShared(take);
    take();
  }
  // pictures exist only in memory: leaving the page (a link opens in the same tab) would lose them, so ask first
  window.addEventListener('beforeunload', e => { if (!NATIVE && state.pics.some(unsaved)) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- about, manual, Back ----------
  let aboutFrom = 'scrHome';
  $('btnHome').onclick = () => show('scrHome');
  $('btnAbout').onclick = () => { if (!['scrAbout', 'scrHelp', 'scrLicences'].includes(current)) aboutFrom = current; show('scrAbout'); };
  $('btnAboutBack').onclick = () => show(aboutFrom);
  $('btnHelp').onclick = $('btnHelp2').onclick = () => show('scrHelp');
  $('btnHelpBack').onclick = () => show('scrAbout');
  $('btnLicences').onclick = () => show('scrLicences');
  $('btnLicencesBack').onclick = () => show('scrAbout');
  // Android's Back button: back inside the app first (MainActivity asks this)
  window.remarkBack = () => {
    if (current === 'scrEdit' && RemarkEditor.back()) return true;
    const to = { scrHelp: 'scrAbout', scrLicences: 'scrAbout', scrAbout: aboutFrom, scrSettings: settingsFrom, scrCheck: 'scrEdit', scrEdit: 'scrHome' }[current];
    if (!to) return false;
    if (current === 'scrCheck') RemarkSave.back(); else show(to);
    return true;
  };

  return { $, APP, settings, saveSettings, state, show, toast, onShow: fn => listeners.push(fn), describe, rememberText, MIME, size, plural, get current() { return current; } };
})();
