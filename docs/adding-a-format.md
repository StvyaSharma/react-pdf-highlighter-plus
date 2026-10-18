# Adding a new document format

The library is split into a format-agnostic core and format-specific adapters.

## Core contracts (`src/core/types.ts`)

- `DocumentFormat` — string union of supported formats.
- `DocumentPosition` — format-agnostic location (PDF page coords, EPUB CFI, ...).
- `DocumentHighlight` — format-agnostic highlight.
- `DocumentAdapter` — the interface every format must implement:
  `load`, `render`, `destroy`, `next`, `prev`, `display`,
  `currentLocation`, `onSelection`, `addHighlight`, `removeHighlight`,
  optional `getOutline`.

## Pattern (see `src/adapters/EpubAdapter.ts` + `src/components/EpubHighlighter.tsx`)

1. Implement `DocumentAdapter` for your format.
2. Create a `<FormatHighlighter>` component that:
   - instantiates the adapter,
   - loads + renders into a container ref,
   - syncs the `highlights` prop to `adapter.addHighlight/removeHighlight`,
   - forwards `adapter.onSelection` to `onSelection`,
   - provides `DocumentHighlighterContext` (adapter, highlights, scrollToHighlight).
3. Export both from `src/index.ts`.

## PDF

PDF is the original implementation (`src/components/PdfHighlighter.tsx`) and predates this
interface. It remains the reference for paged, canvas-based formats. To migrate it, wrap
its PDF.js viewer behind a `PdfAdapter implements DocumentAdapter` and have
`PdfHighlighter` consume it — the highlight rendering components (`TextHighlight`, etc.)
already operate on viewport rects and can be reused once a format produces them.
