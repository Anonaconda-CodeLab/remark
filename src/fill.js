/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- solid cover fill ----------
   The lines between the markers are copied unchanged from Redact's src/detect.js (1.0.0, f84acd6), where they were
   reviewed; a change is made there first (tests/origins.test.mjs checks the copy). Redact's paint.js (also an unchanged
   copy) calls it as RedactDetect.fill, so it is published under that name; Remark has no detection.
   API: RedactDetect.fill(rgba, W, H, box, rgb) paints a solid cover into RGBA pixels. */
(function (root) {
  'use strict';
  // ---- from Redact src/detect.js ----
  const clip = (b, W, H) => ({ x0: Math.max(0, Math.floor(b.x)), y0: Math.max(0, Math.floor(b.y)), x1: Math.min(W, Math.ceil(b.x + b.w)), y1: Math.min(H, Math.ceil(b.y + b.h)) });

  function fill(rgba, W, H, b, rgb) {
    const { x0, y0, x1, y1 } = clip(b, W, H);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const o = (y * W + x) * 4; rgba[o] = rgb[0]; rgba[o + 1] = rgb[1]; rgba[o + 2] = rgb[2]; rgba[o + 3] = 255;
    }
  }
  // ---- end of copy ----
  root.RedactDetect = { fill };
})(typeof globalThis !== 'undefined' ? globalThis : this);
