#!/usr/bin/env node
// Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
// Builds dist/index.html: a single self-contained page (fonts, styles and scripts all inlined) with a strict Content
// Security Policy that blocks every network request.
//   node build.mjs              -> dist/index.html (+ icons, web manifest, _headers, robots.txt, sitemap.xml)
// dist/ is not committed: Cloudflare Pages runs this build and publishes dist/ (with dist/_headers), and the Android
// workflow does the same. Adapted from Redact's build.mjs (1.0.0, f84acd6), without the detection engines.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
// ---- project settings (edit these) ----
const PROJECT = {
  name: 'Remark',
  appUrl: 'https://remark.anonacondacodelab.com', // the public address of the app
  repoUrl: 'https://github.com/Anonaconda-CodeLab/remark', // shown in About and on the Android page
  contact: 'hello@anonacondacodelab.com', // support address shown in About and the manual; leave empty to hide
  // SHA-256 of the Android signing certificate (the studio's shared key), published so people can check an APK is official
  certSha256: '4D:6C:EA:58:94:C0:D7:D8:E9:AB:74:BC:3A:1E:9C:A5:47:BD:40:A2:02:B6:70:99:AF:66:5B:29:7F:7A:8F:47',
  kofi: 'anonacondacodelab', // Ko-fi username; leave empty to hide the support link
  // Android app announced on the website: the install page (dist/android.html) and the manual's [[android]] parts.
  // Off until the launch; the APK itself is built either way.
  androidPage: true
};
// for the tests: build with or without the Android parts (REMARK_ANDROID_PAGE=1 or 0), into another folder (REMARK_DIST)
if (process.env.REMARK_ANDROID_PAGE) PROJECT.androidPage = process.env.REMARK_ANDROID_PAGE === '1';
const DIST = process.env.REMARK_DIST ? resolve(process.env.REMARK_DIST) : join(root, 'dist');
const APP = { APP_NAME: PROJECT.name, VERSION: pkg.version };
const appUrl = /^https:\/\/[\w.-]+\/?$/.test(PROJECT.appUrl) ? PROJECT.appUrl.replace(/\/$/, '') : '';
APP.APP_URL = appUrl || 'its https web address';
APP.APP_HOST = appUrl ? appUrl.replace('https://', '') : 'the https address';
const safeUrl = u => /^https:\/\/[\w.-]+(\/[\w./%-]*)?$/.test(u) ? u : '';
const contact = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(PROJECT.contact) ? PROJECT.contact : '';
// the commit an APK was built from: the Android workflows set APP_BUILD_ID
const BUILD = /^[0-9a-f]{40}$/.test(process.env.APP_BUILD_ID || '') ? process.env.APP_BUILD_ID.slice(0, 7) : '';
const repo = safeUrl(PROJECT.repoUrl), kofi = /^[A-Za-z0-9_]{1,60}$/.test(PROJECT.kofi) ? 'https://ko-fi.com/' + PROJECT.kofi : '';
const about = `<div class="card" id="aboutCard">
      <div><div class="dev-name">About ${APP.APP_NAME}</div><div class="dev-meta">Version ${APP.VERSION}${BUILD ? ` · build ${BUILD}` : ''} · free and open source (GNU GPL v3) · runs entirely on this device</div></div>
      <p class="dev-meta" style="margin:0">© 2026 Anonaconda Code Lab. You may use, share and modify this app under the GNU General Public License v3 or later; it comes with no warranty. Typefaces: Instrument Sans, IBM Plex Mono and IBM Plex Sans Thai (SIL Open Font License 1.1).</p>
      ${contact ? `<p class="dev-meta" style="margin:0">Questions or problems: <a href="mailto:${contact}">${contact}</a>. A description or a screenshot of the app is usually enough; please don't send the pictures you were marking up.</p>` : ''}
      <div class="acts-row"><button id="btnHelp2" class="btn">User manual</button>${appUrl && PROJECT.androidPage ? `<a class="btn native-only" href="${appUrl}/android.html?v=${APP.VERSION}" rel="noopener noreferrer">Check for updates</a>` : ''}${PROJECT.androidPage ? '<a class="btn web-only" href="/android.html">Android app</a>' : ''}${repo ? `<a class="btn" href="${repo}" rel="noopener noreferrer">Source code</a>` : ''}${kofi ? `<a class="btn coffee" href="${kofi}" rel="noopener noreferrer">☕ Support on Ko-fi</a>` : ''}</div>
    </div>`;

// on the web only (hidden in the Android app): where to get the Android app, under the start screen's privacy line
const androidLink = PROJECT.androidPage ? '<p class="web-only app-link"><a href="/android.html">Also available as an Android app →</a></p>' : '';
// gentle donation card after a picture is saved, shown at a few usage milestones only (see save.js); same as the studio's other apps
const donate = kofi ? `<div id="donateCard" class="card donate" hidden>
      <p><b>Enjoying ${APP.APP_NAME}?</b><br><span class="dev-meta">You've saved <span id="donateN">20</span> pictures. No ads, no tracking. If you find this app useful, please consider making a small donation to help fund development. Thank you!</span></p>
      <div class="acts"><a id="btnDonate" class="btn coffee" href="${kofi}" rel="noopener noreferrer">☕ Support on Ko-fi</a><button id="btnDonateLater" class="btn">Not now</button></div>
    </div>` : '';
const thanks = kofi ? `<p class="thanks">No ads, no tracking. If you find this app useful, please consider <a href="${kofi}" rel="noopener noreferrer">making a small donation</a> to help fund development. Thank you!</p>` : '';

const src = f => readFileSync(join(root, 'src', f), 'utf8');
// the studio mark for the header (src/icons/icon.svg, with the theme's accent so it follows dark mode)
const icon = readFileSync(join(root, 'src', 'icons', 'icon.svg'), 'utf8').trim().replace('<svg xmlns="http://www.w3.org/2000/svg"', '<svg aria-hidden="true"').replace('fill="#2343a3"', 'fill="var(--accent)"');
const bin = f => readFileSync(join(root, 'src', f));

// minimal Markdown renderer for docs/MANUAL.md (headings, paragraphs, lists, '> ' callouts, bold, italics, code, https links)
function md(text) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/(?<!["\/])\bhttps:\/\/[\w.\/-]+[\w\/]/g, u => `<a href="${u}" rel="noopener noreferrer">${u.replace('https://', '')}</a>`);
  const out = []; let para = [], list = null, quote = null;
  const flushP = () => { if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`); para = []; };
  const flushL = () => { if (list) out.push(`<${list.t}>${list.items.map(i => `<li>${inline(i.text)}${i.sub.length ? `<ul>${i.sub.map(x => `<li>${inline(x)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</${list.t}>`); list = null; };
  const flushQ = () => { if (quote) out.push(`<div class="callout">${md(quote.join('\n'))}</div>`); quote = null; };
  for (const line of text.split('\n')) {
    if (/^>( |$)/.test(line)) { flushP(); flushL(); (quote = quote || []).push(line.replace(/^> ?/, '')); continue; }
    flushQ();
    const h = line.match(/^(#{1,3}) (.*)/), li = line.match(/^(-|\d+\.) (.*)/), sub = line.match(/^ {2,3}- (.*)/), cont = /^ {2,}\S/.test(line);
    if (/^-{3,}$/.test(line)) { flushP(); flushL(); out.push('<hr>'); }
    else if (h) { flushP(); flushL(); const n = h[1].length; if (n > 1) out.push(`<h${n}>${inline(h[2])}</h${n}>`); }
    else if (li) { flushP(); const t = li[1] === '-' ? 'ul' : 'ol'; if (!list || list.t !== t) { flushL(); list = { t, items: [] }; } list.items.push({ text: li[2], sub: [] }); }
    else if (sub && list) list.items[list.items.length - 1].sub.push(sub[1]);
    else if (cont && list) { const it = list.items[list.items.length - 1]; if (it.sub.length && /^ {4,}\S/.test(line)) it.sub[it.sub.length - 1] += ' ' + line.trim(); else it.text += ' ' + line.trim(); }
    else if (!line.trim()) { flushP(); flushL(); }
    else { flushL(); para.push(line.trim()); }
  }
  flushP(); flushL(); flushQ(); return out.join('\n');
}
// [[android]] ... [[/android]] in the manual: kept (markers removed) when the Android app is announced, else left out
// (a marker's own indentation is removed first, and the line breaks around a part stay, so taking it out never joins
// the next line to a list item)
const manualText = readFileSync(join(root, 'docs', 'MANUAL.md'), 'utf8')
  .replace(/^[ \t]+(?=\[\[\/?android\]\])/gm, '')
  .replace(/\[\[android\]\]([\s\S]*?)\[\[\/android\]\]/g, (_, body) => PROJECT.androidPage ? body : '');
if (/\[\[\/?android\]\]/.test(manualText)) throw new Error('Unbalanced [[android]] marker in docs/MANUAL.md');
const manual = md(manualText);
const b64 = f => bin(f).toString('base64');
// The licence texts of everything built in (some licences, such as Leptonica's, ask that their notice goes with every
// copy): shown on the Licences screen and written to licences.txt next to the page, which also goes into the APK.
// Identical texts (the Apache licence) are given once, with every component under them.
const LICENCES = [
  ['Instrument Sans typeface', 'fonts/OFL-InstrumentSans.txt'], ['IBM Plex Mono typeface', 'fonts/OFL-IBMPlexMono.txt'], ['IBM Plex Sans Thai typeface', 'fonts/OFL-IBMPlexSansThai.txt']
];
const licenceGroups = [];
for (const [name, f] of LICENCES) {
  const text = src(f).replace(/\r\n/g, '\n').trim();
  const g = licenceGroups.find(x => x.text === text);
  if (g) g.names.push(name); else licenceGroups.push({ names: [name], text });
}
const licencesTxt = `${APP.APP_NAME} ${APP.VERSION}: licences of the components built into the app.\n${APP.APP_NAME} itself: GNU General Public License v3 or later (the LICENSE file in the source code).\n\n` +
  licenceGroups.map(g => `${'='.repeat(78)}\n${g.names.join('\n')}\n${'='.repeat(78)}\n\n${g.text}\n`).join('\n');
const escHtml = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fill = s => s.replace(/\{\{(APP_NAME|VERSION|APP_URL|APP_HOST)\}\}/g, (_, k) => APP[k]).replace('{{ABOUT}}', about)
  .replace('{{THANKS}}', thanks).replace('{{DONATE}}', donate).replace('{{ICON}}', icon).replace('{{LICENCES}}', () => escHtml(licencesTxt)).replace('{{MANUAL}}', () => manual).replace('{{ANDROID_LINK}}', androidLink);

const fonts = `@font-face{font-family:"Instrument Sans";font-style:normal;font-display:swap;font-weight:400 700;font-stretch:75% 100%;src:url(data:font/woff2;base64,${b64('fonts/InstrumentSans-latin-variable.woff2')}) format("woff2-variations")}
@font-face{font-family:"IBM Plex Mono";font-style:normal;font-display:swap;font-weight:400;src:url(data:font/woff2;base64,${b64('fonts/IBMPlexMono-latin-400.woff2')}) format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-style:normal;font-display:swap;font-weight:500;src:url(data:font/woff2;base64,${b64('fonts/IBMPlexMono-latin-500.woff2')}) format("woff2")}
@font-face{font-family:"IBM Plex Sans Thai";font-style:normal;font-display:swap;font-weight:600;unicode-range:U+0E01-0E5B,U+200C-200D,U+25CC;src:url(data:font/woff2;base64,${b64('fonts/IBMPlexSansThai-thai-600.woff2')}) format("woff2")}`;
const css = `<style>${fonts}\n${src('style.css')}</style>`;

const noClose = (name, s) => { if (/<\/script/i.test(s)) throw new Error(name + ' contains a closing script tag'); return s; };
const appJs = noClose('app', [src('picture.js'), src('fill.js'), src('paint.js'), src('marks.js'), src('clean.js'), fill(src('native.js')), fill(src('app.js')), src('editor.js'), src('save.js'), src('line.js')].join('\n'));
const js = `<script>\n${appJs}\n</script>`;
const body = fill(src('body.html'));
const title = `<title>${APP.APP_NAME}</title>`;
const DESC = 'Write notes, callouts, arrows and highlights on photos and screenshots, then save or share a clean copy. Free, open source, and nothing leaves your device.';
// the studio site's social picture for Remark doesn't exist yet: no og:image until it does
const seo = appUrl ? `<link rel="canonical" href="${appUrl}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Anonaconda Code Lab">
<meta property="og:title" content="${APP.APP_NAME}">
<meta property="og:description" content="${DESC}">
<meta property="og:url" content="${appUrl}/">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${APP.APP_NAME}">
<meta name="twitter:description" content="${DESC}">` : '';

// No connections of any kind (connect-src 'none'), no workers, no WebAssembly: Remark needs none of them.
const CSP = ["default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", 'font-src data:', "img-src 'self' data: blob:",
  "connect-src 'none'", "media-src 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "manifest-src 'self'",
  "base-uri 'none'", "form-action 'none'"].join('; ');

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<script>try{if(window.Capacitor&&Capacitor.isNativePlatform())document.documentElement.classList.add('native')}catch(e){}</script>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#2343a3">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="description" content="${DESC}">
${title}
${seo}
<style>html{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}html.native .web-only{display:none!important}</style>
${css}
</head><body>
${body}
${js}
</body></html>
`;

// the output folder is emptied first, so it must never be the checkout, a folder above it, or one of the source folders
{
  // real paths (links followed, as far as the folders exist), compared folder by folder
  const real = p => { let tail = []; for (;;) { try { return join(realpathSync(p), ...tail); } catch (e) { const up = dirname(p); if (up === p) return join(p, ...tail); tail.unshift(basename(p)); p = up; } } };
  const within = (a, b) => { const r = relative(b, a); return r === '' || (r !== '..' && !r.startsWith('..' + sep) && !isAbsolute(r)); };
  const dist = real(DIST), base = real(root), own = ['src', 'docs', 'tests', 'mobile', '.github', '.git'].map(d => real(join(root, d)));
  if (within(base, dist) || own.some(d => within(dist, d) || within(d, dist))) {
    console.error(`build: refusing to empty ${DIST} (it holds or is inside this project's own files)`); process.exit(1);
  }
}
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
const file = join(DIST, 'index.html');
writeFileSync(file, page);

writeFileSync(join(DIST, 'licences.txt'), licencesTxt);
// home-screen install: a web manifest and local icons (no service worker; the page itself never touches the network)
for (const f of readdirSync(join(root, 'src', 'icons'))) copyFileSync(join(root, 'src', 'icons', f), join(DIST, f));
writeFileSync(join(DIST, 'manifest.webmanifest'), JSON.stringify({
  name: APP.APP_NAME, short_name: APP.APP_NAME, id: '/', start_url: '/', scope: '/', display: 'standalone',
  background_color: '#f3f4f7', theme_color: '#2343a3',
  description: 'Write notes, arrows and highlights on photos and screenshots, then share a clean copy, entirely on your device.',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
  ]
}, null, 2) + '\n');
// the Android download page (also the target of the app's Check for updates button: android.html?v=<installed version>)
if (PROJECT.androidPage) writeFileSync(join(DIST, 'android.html'), src('android.html').replace(/\{\{(VERSION|REPO|CERT|CONTACT_LINE|APP_NAME|APP_URL)\}\}/g, (_, k) =>
  ({ VERSION: APP.VERSION, REPO: repo, CERT: PROJECT.certSha256, APP_NAME: APP.APP_NAME, APP_URL: appUrl || '',
     CONTACT_LINE: contact ? ` · Questions or problems: <a href="mailto:${contact}">${contact}</a>` : '' })[k]));
// HTTP headers for Cloudflare Pages. The page's own Content Security Policy (in index.html) does the real work; these
// add what a <meta> tag can't (no framing by other sites) and a second, header-level block on all connections. A
// browser applies both policies, so a page is only ever allowed what both permit.
writeFileSync(join(DIST, '_headers'), `/*
  Content-Security-Policy: connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000

# the project's own *.pages.dev address is a duplicate of the real one: keep it out of search engines
https://:project.pages.dev/*
  X-Robots-Tag: noindex
`);
if (appUrl) {
  writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${appUrl}/sitemap.xml\n`);
  writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${appUrl}/</loc></url>
${PROJECT.androidPage ? `  <url><loc>${appUrl}/android.html</loc></url>\n` : ''}</urlset>
`);
}

// sanity checks: the scripts parse, no remote resources
new Function(appJs);
const stripped = page.replace(/<code>[^<]*<\/code>/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
// anything the page would load by itself (scripts, styles, images, frames) must be local; plain <a href> links are allowed
const remote = stripped.match(/\bsrc\s*=\s*["']https?:|<link\b(?![^>]*rel="canonical")[^>]*href\s*=\s*["']https?:|url\(\s*["']?https?:/gi);
if (remote) { console.error('Remote resource reference found:', remote); process.exit(1); }
if (/target="_blank"/.test(page)) { console.error('Links open in the same tab: target="_blank" found'); process.exit(1); }
console.log(`${APP.APP_NAME} ${APP.VERSION} -> ${file} (${(page.length / 1048576).toFixed(1)} MB)`);
