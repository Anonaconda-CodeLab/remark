# Notices

## Third-party components
The licence texts of everything built into the app ship with it: the **Licences** screen (About → Licences) and
`licences.txt` next to the page (also inside the APK), both made by `build.mjs` from the files linked below.

The built app embeds these, unmodified (the WebAssembly files are stored gzipped; `tests/origins.test.mjs` checks every
file against the SHA-256 of the release named here, listed in `tests/origins.json`):

| Component | File | Version | Licence | SHA-256 (as released) |
|---|---|---|---|---|
| Instrument Sans typeface | `src/fonts/InstrumentSans-latin-variable.woff2` | as in Redact 1.0.0 | SIL Open Font License 1.1 ([src/fonts/OFL-InstrumentSans.txt](src/fonts/OFL-InstrumentSans.txt)) | |
| IBM Plex Mono typeface | `src/fonts/IBMPlexMono-latin-*.woff2` | as in Redact 1.0.0 | SIL Open Font License 1.1 ([src/fonts/OFL-IBMPlexMono.txt](src/fonts/OFL-IBMPlexMono.txt)) | |
| [IBM Plex Sans Thai](https://github.com/IBM/plex) typeface, Thai letters, weight 600 (npm `@fontsource/ibm-plex-sans-thai` 5.3.0, `files/ibm-plex-sans-thai-thai-600-normal.woff2`) | `IBMPlexSansThai-thai-600.woff2` | 5.3.0 | SIL Open Font License 1.1 ([src/fonts/OFL-IBMPlexSansThai.txt](src/fonts/OFL-IBMPlexSansThai.txt)) | `ea935955dc3bccb684f8fb772dbd429250dd0d3dfee9483995a3ee3456471df8` |

From the studio's other apps (Anonaconda Code Lab, GPL-3.0-or-later), checked by tests to be unchanged copies:
`src/clean.js`, [Unmarked](https://github.com/Anonaconda-CodeLab/unmarked)'s cleaner (0.1.4, commit `695a6c5`, as in
Flatbed 1.0.2 and Redact 1.0.0); `src/paint.js` and the fill in `src/fill.js`, from
[Redact](https://github.com/Anonaconda-CodeLab/redact) 1.0.0 (commit `f84acd6`); the picture-size check in
`src/picture.js`, from [Flatbed](https://github.com/Anonaconda-CodeLab/flatbed) 1.0.2. `src/native.js`, the Android
plugin, the editor's view and undo and the saving code are adapted from Redact's. Everything is under the GPL v3 or
compatible with it.

The **Android app** (built from `mobile/`) also includes:

| Component | Version | Licence |
|---|---|---|
| [Capacitor](https://capacitorjs.com) (`@capacitor/android`, `@capacitor/core`) | 8.5.3 | MIT |
| AndroidX libraries (AppCompat, Core, CoordinatorLayout, Core SplashScreen, Activity, WebKit) | see `mobile/android/variables.gradle` | Apache-2.0 |

`tests/fixtures/page.jpg` is a synthetic test picture, copied from Redact's tests (made with Pillow and the DejaVu fonts,
which are not part of the app).
