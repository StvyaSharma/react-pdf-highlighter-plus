# EPUB reader

For the shared controller, customizable error presentation, and React Native
WebView integration, see [shared EPUB logic and React Native](react-native.md).

`EpubHighlighter` renders EPUB documents with EPUB.js. Run `npm ci` and
`npm run dev`, then open <http://localhost:3000/?format=epub> for the EPUB demo.
The demo includes the complete 61-chapter *Pride and Prejudice* by Jane Austen,
from [Project Gutenberg](https://www.gutenberg.org/ebooks/1342), bundled locally
with its original license and notices. It accepts local `.epub` files, too.
A URL can be supplied with `?format=epub&epub=<encoded-url>`.
The original three-chapter fixture is retained for automated regression checks.

### Annotation tools in the web demo

Open the floating **+** button at the lower right of the book and choose a tool,
then select a passage. Highlight, underline, and mark apply immediately. Notes
open a text editor. Draw, rectangle, circle, arrow, area highlight, image, and
signature open a sketch editor attached to that passage. The editor supports
ink color and width, multiple shapes, image upload, undo, and clearing the canvas.

These sketches are attachments, rather than overlays on EPUB pages. Their
passage links use EPUB CFIs, so font changes and page/scroll layout changes keep
them anchored to the same text. Open **Notes** to view, edit, remove, or return to
an annotation's passage. Compact notes hides sketch previews and shortens text.
Annotations and image data remain in memory for the current session.
The demo stores sketch and comment data in `DocumentHighlight.content`; this
adds no fixed-page drawing API to the EPUB renderer or native example.

## Sources and readiness

`source` accepts a URL, an `ArrayBuffer`, or `{ url, ...options }`. Object
options are passed to EPUB.js, including `requestHeaders`,
`requestCredentials`, and `openAs`. Keep the source object's identity stable
between renders unless you intend to reload the document.

`onReady(adapter)` runs after rendering, controlled annotations, styles, and
the imperative ref have been initialized. Load/render failures invoke
`onError(error)` and show an accessible error message. A new valid source
clears the error and loads normally.

## Navigation and search

The ref exposes `next()`, `prev()`, `display(target)`, `search(query)`, and
`getOutline()`. `display` accepts a chapter href, EPUB CFI, or **zero-based
spine index**. Search is case-insensitive and returns excerpts and CFIs across
the book. Pass a result's CFI to `display` to navigate to it.

`flow="paginated"` is the default; `flow="scrolled-doc"` enables scrolling.
Changing `source`, `flow`, `width`, or `height` rebuilds the rendition and
reapplies controlled annotations.

## Annotations

`onSelection` receives an EPUB CFI, selected text, and `hide()` to clear the
native selection. Store selections in the controlled `highlights` array with
an ID, `position`, and optional `content`. Supported types are `text` /
`highlight`, `underline`, `mark`, and `note`. Notes currently render as
highlights; applications provide their own note editor or popup.

Changing a highlight's position or type updates its annotation, including
when its ID stays the same. EPUB.js stores one annotation per CFI and native
annotation type; duplicate entries share a visual annotation, with the last
entry taking precedence. Notes and highlights share the same native type.

The ref also exposes `annotate(type, cfi, data, styles)` and
`removeAnnotation(cfi, type)` for imperative annotations. Marks are visible,
keyboard-focusable dots. A string `data.note` supplies their accessible label.
Keep controlled and imperative ownership of a given CFI/type separate.

Annotation storage is owned by the consuming application. This component
does not save annotations back into an EPUB file.

## Styling and feature switches

`styles` supports `fontSize`, `fontFamily`, `lineHeight`, `color`, and
`background`. Numeric font sizes use pixels. Values apply to current and future
chapters. Updating the object replaces reader overrides; removing a property
restores the book's styling for it.

`customCss` replaces the previous injected CSS. Pass an empty string or remove
the prop to clear it. The ref's `setStyles` and `injectCss` methods provide the
same behavior imperatively.

All `features` default to true:

- `highlight`: controlled annotations, forwarded selections, and ref `annotate`.
- `search`: ref `search`.
- `navigation`: ref `next` / `prev` / `display` and context `scrollToHighlight`.
- `outline`: ref `getOutline`.

Disabled methods return empty results or do nothing. Feature switches do not
restrict direct access to the raw `adapter` or EPUB-internal links.

## Browser regression validation

With `npm run dev` running, open
<http://localhost:3000/epub-validation.html> and click **Run validation**.
The suite in `tests/epub.browser.tsx` uses real EPUB.js rendering and React
StrictMode, without a mocked renderer or remote book dependency. It reports
33 cases covering loading, error recovery, navigation, full-book and concurrent
searches, native text selection, annotation rendering and reconciliation,
styles, CSS replacement, feature switches, context/ref methods, source changes,
and cleanup while requests and rendering are in flight.

Browser automation can invoke `await window.runEpubValidation()` on that page;
the returned report contains `passed`, `failed`, per-case results, and
unexpected browser errors. The latest result is also available as
`window.epubValidationReport`.

Validated in Chromium with the local sample and, separately, the EPUB.js
sample edition of _Alice's Adventures in Wonderland_: file upload, its outline,
39 search results for “rabbit”, and next/previous pagination within a chapter.
Other browser engines and DRM-protected books were not tested.
