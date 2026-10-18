import React from "react";
import { EpubHighlighter } from "../../src";
import type { DocumentHighlight } from "../../src";

export function EpubDemo() {
  const ref = React.useRef<{ search: (q: string) => Promise<any[]> }>(null);
  const [highlights, setHighlights] = React.useState<DocumentHighlight[]>([]);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<any[]>([]);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: 260, padding: 12, borderRight: "1px solid #ddd", overflow: "auto" }}>
        <h3>Search</h3>
        <input value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: "100%" }} />
        <button onClick={async () => setResults((await ref.current?.search(query)) ?? [])}>Go</button>
        <ul>
          {results.map((r, i) => (
            <li key={i}>{r.excerpt}</li>
          ))}
        </ul>
      </div>
      <div style={{ flex: 1 }}>
        <EpubHighlighter
          ref={ref as any}
          source="/test.epub"
          highlights={highlights}
          styles={{ fontSize: 18, fontFamily: "Georgia, serif", lineHeight: 1.6 }}
          customCss={"p { text-align: justify; }"}
          onSelection={(sel) => {
            if (sel.position.cfiRange) {
              setHighlights((prev) => [
                ...prev,
                { id: String(prev.length + 1), type: "text", position: sel.position, content: sel.content },
              ]);
            }
          }}
          style={{ height: "100%" }}
        />
      </div>
    </div>
  );
}
