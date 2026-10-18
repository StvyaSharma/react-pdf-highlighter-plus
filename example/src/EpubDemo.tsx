import React from "react";
import type { NavItem } from "epubjs";
import {
  EpubHighlighter,
  type EpubHighlighterHandle,
} from "../../src/components/EpubHighlighter";
import type { DocumentHighlight } from "../../src/core/types";
import sampleBook from "../../tests/fixtures/reader.epub?url";
import "./style/EpubDemo.css";

type SearchResult = Awaited<
  ReturnType<EpubHighlighterHandle["search"]>
>[number];

export function EpubDemo() {
  const ref = React.useRef<EpubHighlighterHandle>(null);
  const [source, setSource] = React.useState<string | ArrayBuffer>(
    () => new URLSearchParams(location.search).get("epub") || sampleBook,
  );
  const [highlights, setHighlights] = React.useState<DocumentHighlight[]>([]);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [outline, setOutline] = React.useState<NavItem[]>([]);
  const [ready, setReady] = React.useState(false);
  const [status, setStatus] = React.useState("Loading EPUB…");
  const [fontSize, setFontSize] = React.useState(18);
  const [fontFamily, setFontFamily] = React.useState("Georgia, serif");
  const [lineHeight, setLineHeight] = React.useState(1.6);
  const [dark, setDark] = React.useState(false);
  const [flow, setFlow] = React.useState("paginated");
  const [annotationType, setAnnotationType] = React.useState("highlight");
  const [customCss, setCustomCss] = React.useState(
    "p { text-align: justify; }",
  );
  const searchRequest = React.useRef(0);
  const styles = React.useMemo(
    () => ({
      fontSize,
      fontFamily,
      lineHeight,
      color: dark ? "#eeeeee" : "#222222",
      background: dark ? "#202020" : "#ffffff",
    }),
    [fontSize, fontFamily, lineHeight, dark],
  );

  const run = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch (error) {
      setStatus(String(error));
    }
  };
  const navigate = (target?: string | number) =>
    run(async () => {
      await ref.current?.display(target);
    });
  const renderOutline = (items: NavItem[]): React.ReactNode => (
    <ul>
      {items.map((item) => (
        <li key={item.id || item.href}>
          <button disabled={!ready} onClick={() => void navigate(item.href)}>
            {item.label.trim()}
          </button>
          {item.subitems?.length ? renderOutline(item.subitems) : null}
        </li>
      ))}
    </ul>
  );

  return (
    <main
      className="epub-demo"
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        background: dark ? "#202020" : "white",
        color: dark ? "#eee" : "#222",
      }}
    >
      <aside
        aria-label="EPUB controls"
        style={{
          width: 280,
          flexShrink: 0,
          padding: 16,
          borderRight: "1px solid #aaa",
          overflow: "auto",
          boxSizing: "border-box",
        }}
      >
        <h1 style={{ fontSize: 22 }}>EPUB reader</h1>
        <a href="?">PDF demo</a>
        <p role="status">{status}</p>
        <label>
          Open EPUB{" "}
          <input
            type="file"
            accept=".epub,application/epub+zip"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void run(async () => {
                const buffer = await file.arrayBuffer();
                searchRequest.current += 1;
                setReady(false);
                setStatus(`Loading ${file.name}…`);
                setHighlights([]);
                setResults([]);
                setOutline([]);
                setSource(buffer);
              });
            }}
          />
        </label>
        <p>
          <button
            disabled={!ready}
            onClick={() =>
              void run(async () => {
                await ref.current?.prev();
              })
            }
          >
            Previous
          </button>{" "}
          <button
            disabled={!ready}
            onClick={() =>
              void run(async () => {
                await ref.current?.next();
              })
            }
          >
            Next
          </button>
        </p>
        <label>
          Layout{" "}
          <select
            aria-label="Layout"
            value={flow}
            onChange={(e) => {
              setReady(false);
              setFlow(e.target.value);
            }}
          >
            <option value="paginated">Pages</option>
            <option value="scrolled-doc">Scroll</option>
          </select>
        </label>
        <h2 style={{ fontSize: 17 }}>Contents</h2>
        {renderOutline(outline)}
        <h2 style={{ fontSize: 17 }}>Search</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const request = ++searchRequest.current;
            void run(async () => {
              const found = (await ref.current?.search(query)) ?? [];
              if (request !== searchRequest.current) return;
              setResults(found);
              setStatus(`${found.length} search results`);
            });
          }}
        >
          <input
            aria-label="Search EPUB"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: "70%" }}
          />
          <button disabled={!ready} type="submit">
            Search
          </button>
        </form>
        <ul aria-label="Search results">
          {results.map((result, i) => (
            <li key={`${result.cfi}-${i}`}>
              <button onClick={() => void navigate(result.cfi)}>
                {result.excerpt}
              </button>
            </li>
          ))}
        </ul>
        <h2 style={{ fontSize: 17 }}>Appearance</h2>
        <p>
          <label>
            Font size{" "}
            <input
              aria-label="Font size"
              type="number"
              min={10}
              max={48}
              value={fontSize}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (value >= 10 && value <= 48) setFontSize(value);
              }}
              style={{ width: 50 }}
            />
          </label>
        </p>
        <p>
          <label>
            Font{" "}
            <select
              aria-label="Font"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
            >
              <option value="Georgia, serif">Georgia</option>
              <option value="Arial, sans-serif">Arial</option>
            </select>
          </label>
        </p>
        <p>
          <label>
            Line height{" "}
            <input
              aria-label="Line height"
              type="number"
              min={1}
              max={3}
              step={0.1}
              value={lineHeight}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (value >= 1 && value <= 3) setLineHeight(value);
              }}
              style={{ width: 50 }}
            />
          </label>
        </p>
        <p>
          <label>
            <input
              type="checkbox"
              checked={dark}
              onChange={(e) => setDark(e.target.checked)}
            />{" "}
            Dark theme
          </label>
        </p>
        <label>
          Custom CSS{" "}
          <textarea
            aria-label="Custom CSS"
            value={customCss}
            onChange={(e) => setCustomCss(e.target.value)}
            style={{ width: "100%", height: 65, boxSizing: "border-box" }}
          />
        </label>
        <h2 style={{ fontSize: 17 }}>Annotations ({highlights.length})</h2>
        <label>
          Selection tool{" "}
          <select
            aria-label="Selection tool"
            value={annotationType}
            onChange={(e) => setAnnotationType(e.target.value)}
          >
            <option value="highlight">Highlight</option>
            <option value="underline">Underline</option>
            <option value="mark">Mark</option>
            <option value="note">Note highlight</option>
          </select>
        </label>
        <p>Select text to annotate it.</p>
        <ul aria-label="Annotations">
          {highlights.map((highlight) => (
            <li key={highlight.id}>
              <button
                onClick={() => void navigate(highlight.position.cfiRange)}
              >
                {highlight.type}:{" "}
                {String(highlight.content?.text ?? "Annotation")}
              </button>{" "}
              <button
                aria-label={`Remove annotation ${highlight.id}`}
                onClick={() =>
                  setHighlights((items) =>
                    items.filter((item) => item.id !== highlight.id),
                  )
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button disabled={!highlights.length} onClick={() => setHighlights([])}>
          Clear annotations
        </button>
      </aside>
      <section
        aria-label="EPUB document"
        style={{ flex: 1, minWidth: 0, height: "100%" }}
      >
        <EpubHighlighter
          ref={ref}
          source={source}
          highlights={highlights}
          flow={flow}
          styles={styles}
          customCss={customCss}
          onReady={(adapter) => {
            setReady(true);
            setStatus("Ready — select text to annotate");
            void adapter.getOutline().then((toc) => {
              if (ref.current?.adapter === adapter)
                setOutline(toc as NavItem[]);
            });
          }}
          onError={(error) => {
            setReady(false);
            setStatus(error.message);
          }}
          onSelection={(selection) => {
            if (!selection.position.cfiRange) return;
            setHighlights((items) => [
              ...items,
              {
                id: crypto.randomUUID(),
                type: annotationType,
                position: selection.position,
                content: selection.content,
              },
            ]);
            selection.hide?.();
          }}
        />
      </section>
    </main>
  );
}
