/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- Android app (Capacitor) ----------
   In the Android app the page runs inside Android's WebView, which can't save files or share them. This file supplies
   native stand-ins: Android's file picker, saving (Android's "save as" screen), sharing (the share sheet), and
   receiving pictures shared to Remark from the gallery. In a browser NATIVE is false and nothing here is used.
   Adapted from Redact's src/native.js (1.0.0, f84acd6), itself from Flatbed's.
   Everything stays on the phone: the app has no internet permission. */
const NATIVE = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
const nativeCall = (plugin, method, opts) => window.Capacitor.nativePromise(plugin, method, opts || {});
const nativeOn = (plugin, event, cb) => window.Capacitor.addListener(plugin, event, cb);
const CHUNK = 384 * 1024;   // bytes per bridge call (sent as base64)
const NATIVE_MAX = 60 * 1024 * 1024;   // same limit as the page (MAX_BYTES in app.js): larger files are never read
const toB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = s => { const b = atob(s || ''), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const RemarkNative = NATIVE ? {
  // Android's "save as" screen: the place the person chooses ('' when cancelled). Name only: Android limits what a
  // pending call may carry. writeTo then writes there (once).
  async pickSave(name, mime, startIn) {
    const r = await nativeCall('Remark', 'pickSaveLocation', { name, mime: mime || 'application/octet-stream', startIn: startIn || '' });
    return r && r.uri || '';
  },
  async writeTo(uri, bytes) {
    for (let i = 0; i === 0 || i < bytes.length; i += CHUNK)
      await nativeCall('Remark', 'writeChunk', { uri, data: toB64(bytes.subarray(i, i + CHUNK)), first: i === 0, last: i + CHUNK >= bytes.length });
  },
  // startIn: where the original came from, so the save screen opens in the same folder (a hint only)
  async saveFile(name, bytes, mime, startIn) {
    const uri = await this.pickSave(name, mime, startIn);
    if (!uri) return { saved: false };
    await this.writeTo(uri, bytes);
    return { saved: true };
  },
  // copy the files into the app's private share folder, then open Android's share sheet
  async share(files) {
    await nativeCall('Remark', 'shareBegin');
    for (const [k, f] of files.entries())
      for (let i = 0; i === 0 || i < f.bytes.length; i += CHUNK)
        await nativeCall('Remark', 'shareChunk', { index: k, name: f.name, data: toB64(f.bytes.subarray(i, i + CHUNK)), first: i === 0, last: i + CHUNK >= f.bytes.length });
    await nativeCall('Remark', 'shareSend', { count: files.length, mimes: files.map(f => f.mime || 'application/octet-stream') });
  },
  // Files the native side holds (picked or shared) are described first ({ id, name, size, mime, uri }) and read one at
  // a time when their turn comes (readOne), so a large batch is never all in memory at once. A file over the limit is
  // not read (it could run the app out of memory): readOne gives null and the page says "too large". The size Android
  // reports is checked first; reading also stops at the limit, in case it was wrong. release() lets go of them all.
  async readOne(it) {
    if (+it.size > NATIVE_MAX) return null;
    const parts = []; let offset = 0;
    for (;;) {
      const c = await nativeCall('Remark', 'readShared', { id: it.id, offset, length: CHUNK });
      const u = fromB64(c && c.data); parts.push(u); offset += u.length;
      if (!c || c.eof || !u.length || offset > NATIVE_MAX) break;
    }
    if (offset > NATIVE_MAX) return null;
    const bytes = new Uint8Array(offset); let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; }
    return bytes;
  },
  release: () => nativeCall('Remark', 'clearShared').catch(() => {}),
  // pictures shared to Remark from another app ("Share → Remark")
  async takeShared() { const r = await nativeCall('Remark', 'getShared'); return (r && r.files) || []; },
  // Android's own file picker: kind 'images', 'any' (Browse files) or 'text' (a Find words list)
  async pickFiles(kind) { const r = await nativeCall('Remark', 'pickFiles', { kind: kind || 'images' }); return (r && r.files) || []; },
  onShared: cb => nativeOn('Remark', 'shared', cb),
  openUrl: url => nativeCall('Remark', 'openUrl', { url })
} : null;

if (NATIVE) (() => {
  document.documentElement.classList.add('native');   // shows Android-only buttons (Check for updates)
  // links to websites and email open in the phone's browser or mail app, never inside the app
  document.addEventListener('click', e => {
    const a = e.target && e.target.closest && e.target.closest('a[href]'); if (!a) return;
    const href = a.getAttribute('href') || '';
    if (/^(https:|mailto:)/i.test(href)) { e.preventDefault(); RemarkNative.openUrl(href).catch(() => {}); }
  }, true);
})();
