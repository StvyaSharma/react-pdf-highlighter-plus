# Shared EPUB logic and React Native

The reader has three separate layers:

- `src/reader`: plain TypeScript state, commands, feature policy, annotation
  reconciliation, structured errors, and message transport. It imports neither
  React nor DOM APIs.
- `BrowserEpubEngine`: mounts EPUB.js into a browser element. The same engine
  runs in the web reader and inside the bundled WebView document.
- `EpubHighlighter` (web) and `EpubReader` (native): platform-specific mounting
  and presentation. Applications can replace error presentation independently.

PDF behavior and its existing browser adapter are unchanged. The native entry
point currently supports EPUB, not native PDF rendering.

## Installation and imports

In a React Native app, install this package plus `react-native-webview`. With
Expo use `npx expo install react-native-webview`; with a bare iOS project also
install the native pods according to the WebView installation guide.

```tsx
import React, { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  EpubReader,
  type EpubReaderHandle,
  type DocumentHighlight,
} from "react-pdf-highlighter-plus/native";

export function Book({ base64 }: { base64: string }) {
  const reader = useRef<EpubReaderHandle>(null);
  const [highlights, setHighlights] = useState<DocumentHighlight[]>([]);
  // Keep object sources stable across renders, e.g. useMemo in the caller.
  const source = React.useMemo(() => ({ base64 }), [base64]);
  return (
    <View style={{ flex: 1 }}>
      <Pressable
        onPress={() => {
          void reader.current?.captureSelection();
        }}
      >
        <Text>Annotate selection</Text>
      </Pressable>
      <EpubReader
        ref={reader}
        source={source}
        highlights={highlights}
        styles={{ fontSize: 18, fontFamily: "Georgia", lineHeight: 1.6 }}
        onSelection={(selection) => {
          setHighlights((items) => [
            ...items,
            {
              id: String(Date.now()),
              type: "highlight",
              position: selection.position,
              content: selection.content,
            },
          ]);
          void reader.current?.clearSelection();
        }}
        onError={(error) => console.warn(error.code, error.message)}
        renderStatus={(state) =>
          state.error ? (
            <Text accessibilityRole="alert">{state.error.message}</Text>
          ) : null
        }
      />
    </View>
  );
}
```

The native import is isolated from `react-dom`, PDF.js, browser CSS, and browser
mount code. EPUB.js is included in the WebView's inline HTML; it does not use a
CDN, external JavaScript URL, or a hosted reader. The generated HTML is built
from the same source as the web reader. No separate HTML asset setup is needed
in the consuming app.

## Sources, offline books, and networking

`source` accepts:

- A URL string, or `{ url, requestHeaders?, requestCredentials?, openAs? }`.
- `{ base64 }` containing the EPUB ZIP bytes encoded as base64.
- An `ArrayBuffer`, which the transport explicitly encodes as base64.

For a local file, read its bytes or base64 on the native side and pass that
value to the reader. The example uses Expo Asset and Expo FileSystem. A native
`file://` or Android `content://` URI is not automatically readable by an inline
WebView. The package deliberately does not enable unrestricted file access.

Remote URLs are fetched by the WebView and are subject to server CORS,
cookie/authentication policies, and platform transport security. For predictable
authenticated/offline behavior, download on the native side and pass bytes.
Base64 creates additional copies in memory; very large books should be tested
against the application's memory budget. Streaming file transfer is not provided.

`flow` supports `paginated` and `scrolled-doc`. A source or flow change reopens
the book and reapplies the latest controlled highlights and styles.

## Commands and state

The native ref exposes asynchronous `next`, `prev`, `display`, `search`,
`getOutline`, `getLocation`, `captureSelection`, `clearSelection`, `annotate`, `removeAnnotation`,
and `configure` methods, plus `retry()` and `getState()`. Wait for `onReady` or
`onStateChange` with `status: "ready"` before issuing commands.

`configure` replaces the reader configuration (`highlights`, `styles`,
`customCss`, `features`). Props remain the source of truth: subsequent prop
changes replace any imperative configuration.

`display` accepts a chapter href, EPUB CFI, or zero-based spine index. Selections
are plain data, with `position.cfiRange` and `content.text`; use the
`clearSelection()` command instead of carrying a DOM callback across the bridge.
On iOS, expose an **Annotate selection** button that calls
`reader.current.captureSelection()` after the user selects text. This reads the
exact range from EPUB.js's iframe and forwards its CFI to `onSelection`, without
relying on WKWebView to deliver a browser selection event. The native example
provides this button. Native WebView context-menu helpers read only the top
window's selection and cannot reliably identify an EPUB iframe selection.
Highlights, underlines, marks, and note highlights use the same rules as the
[web EPUB reader](epub.md). Applications own storage and editable note UI.

For a custom host, import `ReaderController`, `ReaderEngine` types, and transport
utilities from `react-pdf-highlighter-plus/reader`. The engine interface uses no
DOM nodes; inject an engine factory into `new ReaderController(createEngine)`.
Call `dispose()` when the owner unmounts.

## Errors and presentation

`ReaderState` contains `status`, `location`, and a serializable `error`:

```ts
{
  code: "LOAD_FAILED", // also RENDER_FAILED, COMMAND_FAILED, NOT_READY,
                       // BRIDGE_TIMEOUT, DISCONNECTED
  message: "...",
  retryable: true,
  operation: "load"
}
```

The controller never renders UI. Native `onError` receives this data directly;
the legacy web `onError` continues to receive an `Error` (`ReaderFailure`) with
its structured data in `.detail`. Both wrappers expose `onStateChange` and
`renderStatus(state, retry)`. Return `null` to handle all presentation outside
the reader. Default status modules provide a web alert or native loading/error
view with retry.

A failed document can be retried or replaced. A WebView process/load failure
requires remounting its host; native `retry()` handles that automatically.
Each host has a boot ID and each transport a session ID, so stale responses
cannot complete a new session's requests. Pending requests reject on disconnect
or timeout. `commandTimeoutMs` defaults to 30 seconds, including host startup.

The WebView blocks top-level navigation away from its inline host and leaves
EPUB scripting disabled. Do not enable executable book content when extending
this integration. CSS and typography remain inside the EPUB rendering engine.

## Web compatibility

Existing `EpubHighlighter` props and synchronous browser annotation/style methods
remain available. Its new `ref.current.reader` exposes the shared asynchronous
controller. Use `ref.current.retry()` to retry loading. The legacy
`DocumentAdapter.render(HTMLElement)` contract remains browser-specific; new
portable integrations should implement `ReaderEngine`.

## Run the example and validation

From the repository root:

```sh
npm ci
npm run build:esm
npm run test:reader
cd examples/native
npm ci
npm start
```

Open the example with Expo Go or a development build containing the matching
WebView version. The example includes the local three-chapter EPUB and controls
for navigation, search, typography, theme, annotations, layout, error recovery,
and custom error presentation. **Run checks** exercises the native ref methods.

For browser regression checks, start `npm run dev` from the repository root:

- `/epub-validation.html`: existing EPUB/browser compatibility cases.
- `/webview-validation.html`: the production bundled host in an iframe with the
  actual JSON transport, including binary loading, selection, annotation
  rendering, source replacement, errors, and no CDN requests. Run
  `window.runWebViewValidation()` for a machine-readable result.

Rebuild with `npm run build:webview` after changing host/engine source. The
build generates `src/native/reader-html.generated.ts` (ignored by Git) and
`dist/webview/reader.html`. `npm run build:esm` always performs this step before
building the separate web, reader, and native package entries.

References: [React Native WebView guide](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md),
[Expo WebView documentation](https://docs.expo.dev/versions/v58.0.0/sdk/webview/).

## Validation results

Validated in Chromium and on an iPhone 18 Pro simulator running iOS 27 with
Expo SDK 58 / React Native 0.88:

- 33 web regression cases, including custom error presentation.
- 14 production-host/message-bridge integration cases.
- 12 controller and transport tests (`npm run test:reader`).
- Eight checks in the native example, plus native text capture/annotation,
  default and custom error views, retry, and recovery with the sample book.
- Library/demo production builds, root/web/native type checks, native lint,
  package artifact inclusion, and isolation of the native import graph.

Android runtime behavior has not been verified. The existing size-limit check
still fails (approximately 309 kB against a 220 kB limit); the native entry is
separate and is not pulled into the web entry.
