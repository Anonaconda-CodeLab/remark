# Changelog

## 0.1.3
- Opened inside LINE's built-in browser (from a link in a chat), Remark shows a small banner at the top: LINE's
  browser can't save or share pictures, with **Open in your browser**, which opens the same address in the phone's
  own browser (LINE's `openExternalBrowser=1`). Web only; never in the Android app.

## 0.1.2
Fixes from the private security review (13 Nov 2026):
- Copy picture: a JPEG copied as PNG now goes through Unmarked's cleaner and inspector too, like every saved file;
  if anything were left, it isn't copied.
- The manual says that a copied picture goes wherever your system syncs the clipboard (Windows clipboard sync,
  Apple's Universal Clipboard); use Save if that matters.
- SECURITY.md no longer describes two Redact features Remark doesn't have (mosaic covers, finding things again in
  the saved picture); covers are solid only, and Redact is the tool for faces and automatic finding.
- Android: the file picker offers only pictures and Browse files (the unused text-file option is gone); a comment
  named Redact.

## 0.1.1
- Callout: after typing, the callout stays selected, so its round handle shows and can be dragged straight to
  what it's about (it used to be deselected, hiding the handle). The hint says so.

## 0.1.0
First test build (not released), built on Redact's editor:
- Tools: Text (the default: tap, type, Done), Callout (a label with a pointer), Arrow, Line, Circle, Box, Number
  (1, 2, 3…, renumbered when one is deleted), Highlight (see-through), Pen, Cover (black, white or colour from around)
  and Crop.
- Text in three styles: Label (the default, letters in black or white on a box in your colour), Outline and Plain;
  sized for the picture, S / M / L; English and Thai typefaces built in; recent texts offered with one tap (kept for
  the session, or on the device if asked).
- Six colours; a faint black or white edge keeps lines and shapes visible on any background.
- Select a mark to move it, drag its handles, change its colour, size or style, edit or delete it; undo and redo;
  zoom and move with two fingers or the mouse wheel.
- Several pictures at once (up to 20); one picture opens straight into the editor. Paste a screenshot with Ctrl+V or
  drop pictures on a computer.
- Done makes a clean copy: drawn into a new picture at full size, covers painted last and checked pixel by pixel,
  cleaned with Unmarked's cleaner (no location, phone or date). Save, Share, or Copy picture on a computer.
