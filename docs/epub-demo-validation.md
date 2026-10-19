# EPUB web demo validation

Validated 2026-10-19 against the production Vite build and the Cloudflare demo.
The bundled book is the complete Project Gutenberg *Pride and Prejudice*.

## Reproduce

```sh
npm ci
npx playwright install chromium webkit
npm run test:epub-demo -- --project=chromium --project=webkit
```

For the live deployment:

```sh
EPUB_DEMO_URL=https://react-pdf-highlighter-plus-demo.business-e3d.workers.dev \
  npm run test:epub-demo -- --project=chromium --project=webkit
```

The local command builds the app and starts an isolated preview on port 4175.
Each test creates a fresh browser context. No retries are configured. Browser
page errors fail tests; failure traces and screenshots are retained. Tests use
text selections with real text endpoints for complete-passage checks and real
mouse selection for the visible-word capture check. Sketches use real mouse
pointer gestures; synthetic events exercise pointer cancellation and an
unrelated second pointer.

## Coverage

20 scenarios run in each engine:

- Clicking the active layout keeps navigation and annotation tools enabled.
- Changing between Pages and Scroll preserves the current chapter.
- Full selected text, plain-text escaping, note editing, cancellation, deletion,
  and rejecting an empty note.
- Rectangle, circle, arrow, area highlight, freehand, and signature gestures;
  reverse-direction shapes, captions, preview rendering, and reopening edits.
- Mixed shapes, ink color and width, undo, clear, and cancelling unsaved edits.
- Valid image decoding, saved images, image undo, corrupt bytes, invalid MIME,
  and files over 5 MiB.
- Pointer cancellation discards unfinished strokes; another pointer cannot
  modify the active stroke.
- Highlight, underline, passage mark, compact notes, Escape, and clearing notes.
- Passage links after font, family, theme, layout, and chapter changes.
- Invalid EPUB error, retry, recovery using a valid uploaded EPUB, replacing a
  book without retaining the prior book's notes, and restoring the sample.
- Full-novel search and result navigation, including no-result feedback.
- Drawing and editing at viewport widths of 320, 390, and 768 pixels.
- Real mouse text selection followed by explicit capture.

## Bugs reproduced and fixed

1. Clicking the selected layout disabled navigation forever: the demo cleared
   readiness even though React did not change the flow. Same-layout clicks are
   now ignored; layout buttons are disabled during loading.
2. Switching flow reopened the cover. The current CFI is now restored after the
   new rendition opens.
3. MIME validation accepted corrupt image bytes. The editor now decodes the
   image before inserting it, reports a read error, and prevents saving while
   an image is being read. Stale reads cannot modify a newer upload or an
   unmounted editor.
4. Unrelated pointer events could change an active stroke. Move, end, cancel,
   and lost-capture handling now check the owning pointer ID.
5. WebKit suppresses EPUB.js selection listeners inside sandboxed frames. The
   demo now exposes **Annotate selection**, using the same explicit capture
   method as the native integration. EPUB scripts stay disabled. Automatic
   capture remains available in Chromium.

## Results and limits

- Local production build: 40/40 browser scenarios passed in Chromium 149 and
  WebKit 26.5.
- Public Cloudflare deployment: the same 40/40 scenarios passed, without retries
  (deployment version `d6ceed2f-f64b-4648-8664-930a1d0d8286`).
- Shared reader/controller/bridge Node tests: 12/12 passed.
- Library, web example, browser tests, and Playwright config type checks passed.
- Firefox 151 was installed, but could not launch on this macOS environment:
  `sandbox_extension_issue_file_to_process ... Operation not permitted` and
  `RenderCompositorSWGL failed mapping default framebuffer`. Its project remains
  configured for execution in an environment where Firefox can start; Firefox
  is **not verified** by this run.
- These are browser engine and viewport tests. They are not physical-device or
  native React Native tests. Automatic WebKit selection is not promised; use
  the explicit capture button.
- Notes and attachments are session-only and are cleared on reload or book
  replacement. Sketches are passage attachments, not overlays on reflowing text.
