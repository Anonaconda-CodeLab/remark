# Changelog

## 1.0.0
First release: the web app at remark.anonacondacodelab.com and the Android app.
- Write on photos and screenshots with text, callouts, arrows, lines, circles, boxes, numbered markers, a highlighter and
  a pen, cover a stray detail with a solid cover, and crop; then save or share a brand-new picture, checked pixel by
  pixel and cleaned of hidden data (where a photo was taken, which phone took it) with Unmarked's cleaner.
- Text reads well on any background (a label in your colour), in English or Thai. Up to 20 pictures at once.
- The Android download page is on, with the studio's signing certificate; "Also available as an Android app" on the
  web, and "Check for updates" in the app.
- The private-phase test app is retired: its workflow and public test key are removed (uninstall "Remark (test)"). Test
  builds now come from the Android workflow run by hand on a branch, signed through the protected `signing` environment.
- Before release: a private security review (fixes in 0.1.2) and CodeRabbit's full review (fixes in 0.1.4–0.1.6).

## 0.1.7
- The hint for the tool in use now sits beside **Crop**, in the tool row's empty space, so it shows on a phone without
  scrolling (it was below the tools, just off the screen).
- Zooming is easier to find: that hint ends with "Pinch to zoom in." ("Scroll to zoom in." on a computer) until you
  first zoom, and the manual's first steps mention it.

## 0.1.6
- The donation card appears only on the screen of the picture that was just saved, never on another picture's.
- Build: the output-folder check also follows links for the project's own folders; its test runs on a scratch copy.

## 0.1.5
CodeRabbit's follow-ups on PR #1:
- Closing a picture asks first when only its crop has changed, not just its marks.
- A picture counts as saved only if the saved file was made from it as it is now: changed again while it was being
  saved, it still asks before closing.
- Build: the output-folder check follows links and compares whole folder names.
- Release workflow: a pre-release that can't be looked up for any reason other than "not there" stops the run.

## 0.1.4
Fixes from CodeRabbit's full review (PR #1, 14 Nov 2026):
- **Pinch to zoom works on phones.** Two fingers on the picture threw an error on every move, so nothing zoomed.
- Dragging a corner of a box, circle or cover past the opposite side keeps that opposite corner in place.
- A picture saved and then changed again (an edit, Undo, Redo, a crop) asks before it is closed, as before saving.
- Save, Share and Copy picture: a second tap waits until the first has finished, so two saves can't mix their files.
- Android: each share gets a private folder of its own, never reused, so an app that received an earlier picture can't
  read a later one.
- Switching pictures while one is still opening or being checked no longer lets the late result show up for the other
  picture; the check screen lets go of the previous preview, and a picture closed while opening keeps no thumbnail.
- Recent texts: one limit (200 characters) for keeping and restoring them.
- Build: refuses to empty the project itself or one of its folders as the output folder.
- Release workflow: one publication per pre-release at a time, and an old pre-release tag is removed rather than
  ignored, so a new test build can't end up on an old commit.
- The bundled Instrument Sans and IBM Plex Mono fonts are recorded with their npm releases and checksums (NOTICE.md,
  tested).

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
