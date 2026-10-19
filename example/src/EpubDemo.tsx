import React from "react";
import type { NavItem } from "epubjs";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Highlighter,
  List,
  Menu,
  Moon,
  Search,
  Settings2,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  EpubHighlighter,
  type EpubHighlighterHandle,
} from "../../src/components/EpubHighlighter";
import {
  EpubAnnotationTools,
  annotationTools,
  toolLabel,
  type AnnotationTool,
} from "./components/EpubAnnotationTools";
import {
  EpubSketchEditor,
  SketchPreview,
  type EpubAnnotation,
} from "./components/EpubSketchEditor";
import sampleBook from "./assets/pride-and-prejudice.epub?url";
import "./style/EpubDemo.css";

type SearchResult = Awaited<
  ReturnType<EpubHighlighterHandle["search"]>
>[number];
type Tab = "contents" | "search" | "annotations";
const bookTitle = "Pride and Prejudice";

export function EpubDemo() {
  const ref = React.useRef<EpubHighlighterHandle>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const externalSource = new URLSearchParams(location.search).get("epub");
  const [source, setSource] = React.useState<string | ArrayBuffer>(
    () => externalSource || sampleBook,
  );
  const [title, setTitle] = React.useState(
    externalSource ? "EPUB document" : bookTitle,
  );
  const [isSample, setIsSample] = React.useState(!externalSource);
  const [highlights, setHighlights] = React.useState<EpubAnnotation[]>([]);
  const [draft, setDraft] = React.useState<EpubAnnotation | null>(null);
  const [compactNotes, setCompactNotes] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [outline, setOutline] = React.useState<NavItem[]>([]);
  const [ready, setReady] = React.useState(false);
  const [status, setStatus] = React.useState("Opening your book…");
  const [fontSize, setFontSize] = React.useState(19);
  const [fontFamily, setFontFamily] = React.useState("Georgia, serif");
  const [lineHeight, setLineHeight] = React.useState(1.7);
  const [dark, setDark] = React.useState(false);
  const [flow, setFlow] = React.useState("paginated");
  const [annotationType, setAnnotationType] =
    React.useState<AnnotationTool>("highlight");
  const [customCss, setCustomCss] = React.useState("p { text-align: start; }");
  const [tab, setTab] = React.useState<Tab>("contents");
  const [sidebarOpen, setSidebarOpen] = React.useState(
    () => !window.matchMedia("(max-width: 760px)").matches,
  );
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [activeHref, setActiveHref] = React.useState("");
  const searchRequest = React.useRef(0);
  const styles = React.useMemo(
    () => ({
      fontSize,
      fontFamily,
      lineHeight,
      color: dark ? "#dce1eb" : "#253047",
      background: dark ? "#1b2231" : "#ffffff",
    }),
    [fontSize, fontFamily, lineHeight, dark],
  );

  const run = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "That action could not be completed. Try again.",
      );
    }
  };
  const navigate = (target?: string | number) =>
    run(async () => {
      await ref.current?.display(target);
      if (typeof target === "string" && !target.startsWith("epubcfi"))
        setActiveHref(target);
      if (window.matchMedia("(max-width: 760px)").matches)
        setSidebarOpen(false);
    });
  const replaceBook = (
    value: string | ArrayBuffer,
    name: string,
    sample: boolean,
  ) => {
    searchRequest.current++;
    setReady(false);
    setStatus("Opening your book…");
    setHighlights([]);
    setDraft(null);
    setResults([]);
    setOutline([]);
    setSearched(false);
    setSearching(false);
    setActiveHref("");
    setQuery("");
    setTitle(name);
    setIsSample(sample);
    setSource(value);
    setTab("contents");
  };
  const renderOutline = (items: NavItem[]): React.ReactNode => (
    <ul className="epub-contents">
      {items.map((item) => (
        <li key={item.id || item.href}>
          <button
            disabled={!ready}
            aria-current={activeHref === item.href ? "location" : undefined}
            onClick={() => void navigate(item.href)}
          >
            <span>{item.label.trim()}</span>
            <ChevronRight size={14} aria-hidden="true" />
          </button>
          {item.subitems?.length ? renderOutline(item.subitems) : null}
        </li>
      ))}
    </ul>
  );

  return (
    <main className={`epub-demo${dark ? " epub-dark" : ""}`}>
      <header className="epub-header">
        <div className="epub-brand">
          <button
            className="epub-icon"
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu size={20} />
          </button>
          <span className="epub-badge">EPUB</span>
          <strong>Highlighter</strong>
        </div>
        <div className="epub-header-actions">
          <a className="epub-button epub-pdf-link" href="?">
            <FileText size={16} />
            PDF demo
          </a>
          <button
            className="epub-icon"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <button
            className="epub-button"
            aria-label="Appearance"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Settings2 size={16} />
            <span>Appearance</span>
          </button>
          <button
            className="epub-button epub-primary"
            aria-label="Open EPUB"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={16} />
            <span>Open EPUB</span>
          </button>
        </div>
        <input
          ref={fileInput}
          className="epub-file-input"
          aria-label="Open EPUB file"
          type="file"
          accept=".epub,application/epub+zip"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void run(async () =>
              replaceBook(
                await file.arrayBuffer(),
                file.name.replace(/\.epub$/i, ""),
                false,
              ),
            );
            event.target.value = "";
          }}
        />
      </header>
      <div className="epub-workspace">
        {sidebarOpen && (
          <>
            <button
              className="epub-backdrop"
              aria-label="Close sidebar"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="epub-sidebar" aria-label="Book navigation">
              <div className="epub-book-info">
                <div className="epub-cover" aria-hidden="true">
                  <BookOpen size={22} />
                  <span>{title}</span>
                  <small>{isSample ? "JANE AUSTEN" : "YOUR LIBRARY"}</small>
                </div>
                <div>
                  <span className="epub-eyebrow">
                    {isSample ? "THE COMPLETE NOVEL" : "NOW READING"}
                  </span>
                  <h1>{title}</h1>
                  <p>
                    {isSample ? "Jane Austen · 1813" : "Your EPUB document"}
                  </p>
                  {isSample ? (
                    <a
                      href="https://www.gutenberg.org/ebooks/1342"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Project Gutenberg ↗
                    </a>
                  ) : (
                    <button
                      className="epub-text-button"
                      onClick={() => replaceBook(sampleBook, bookTitle, true)}
                    >
                      Open the sample book
                    </button>
                  )}
                </div>
              </div>
              <div className="epub-tabs" role="tablist" aria-label="Book tools">
                {(
                  [
                    ["contents", List, "Contents"],
                    ["search", Search, "Search"],
                    ["annotations", Highlighter, "Notes"],
                  ] as const
                ).map(([id, Icon, label]) => (
                  <button
                    key={id}
                    id={`epub-tab-${id}`}
                    role="tab"
                    aria-selected={tab === id}
                    aria-controls={`epub-panel-${id}`}
                    onClick={() => setTab(id)}
                  >
                    <Icon size={16} />
                    {label}
                    {id === "annotations" && highlights.length > 0 && (
                      <span className="epub-count">{highlights.length}</span>
                    )}
                  </button>
                ))}
              </div>
              <div
                className="epub-sidebar-panel"
                id={`epub-panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`epub-tab-${tab}`}
              >
                {tab === "contents" && (
                  <>
                    <div className="epub-panel-heading">
                      <h2>Table of contents</h2>
                      <span>{outline.length} entries</span>
                    </div>
                    {outline.length ? (
                      renderOutline(outline)
                    ) : (
                      <p className="epub-empty">
                        {ready
                          ? "This book has no table of contents. Use the page controls to read."
                          : "Loading the table of contents…"}
                      </p>
                    )}
                  </>
                )}
                {tab === "search" && (
                  <>
                    <h2>Search this book</h2>
                    <form
                      className="epub-search"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const request = ++searchRequest.current;
                        setSearching(true);
                        setSearched(false);
                        void run(async () => {
                          try {
                            const found =
                              (await ref.current?.search(query)) ?? [];
                            if (request !== searchRequest.current) return;
                            setResults(found);
                            setSearched(true);
                          } finally {
                            if (request === searchRequest.current)
                              setSearching(false);
                          }
                        });
                      }}
                    >
                      <Search size={17} aria-hidden="true" />
                      <input
                        aria-label="Search EPUB"
                        placeholder="Find a word or phrase"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <button
                        className="epub-icon"
                        disabled={!ready || !query.trim() || searching}
                        aria-label="Search"
                        type="submit"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </form>
                    <p className="epub-muted" role="status">
                      {searching
                        ? "Searching every chapter…"
                        : searched
                          ? `${results.length} matches found`
                          : "Search across the entire book."}
                    </p>
                    <ul className="epub-results" aria-label="Search results">
                      {results.map((result, i) => (
                        <li key={`${result.cfi}-${i}`}>
                          <button onClick={() => void navigate(result.cfi)}>
                            <small>RESULT {i + 1}</small>
                            <span>{result.excerpt}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {searched && !results.length && (
                      <p className="epub-empty">
                        No matches. Try another word or a shorter phrase.
                      </p>
                    )}
                  </>
                )}
                {tab === "annotations" && (
                  <>
                    <div className="epub-panel-heading">
                      <h2>Your annotations</h2>
                      <span>{highlights.length} saved</span>
                    </div>
                    <p className="epub-muted">
                      Select a passage in the book to add it here. Annotations
                      stay for this session.
                    </p>
                    {!highlights.length && (
                      <div className="epub-empty-state">
                        <Highlighter size={28} />
                        <h3>Keep a passage</h3>
                        <p>
                          Choose a tool below the book, then select the text you
                          want to remember.
                        </p>
                      </div>
                    )}
                    <ul
                      className={`epub-notes${compactNotes ? " epub-notes-compact" : ""}`}
                      aria-label="Annotations"
                    >
                      {highlights.map((highlight) => (
                        <li key={highlight.id}>
                          <div className="epub-note-body">
                            <button
                              className="epub-note-content"
                              onClick={() =>
                                void navigate(highlight.position.cfiRange)
                              }
                            >
                              <small>
                                {toolLabel(
                                  highlight.content?.tool ||
                                    highlight.type ||
                                    "highlight",
                                )}
                              </small>
                              <span>
                                {String(
                                  highlight.content?.text ?? "Annotation",
                                )}
                              </span>
                            </button>
                            {highlight.content?.note && (
                              <p className="epub-note-comment">
                                {highlight.content.note}
                              </p>
                            )}
                            {highlight.content?.sketch && (
                              <button
                                className="epub-sketch-preview-button"
                                aria-label="Edit passage sketch"
                                onClick={() => setDraft(highlight)}
                              >
                                <SketchPreview
                                  sketch={highlight.content.sketch}
                                />
                              </button>
                            )}
                            {(highlight.content?.tool === "note" ||
                              highlight.content?.sketch) && (
                              <button
                                className="epub-text-button epub-edit-note"
                                onClick={() => setDraft(highlight)}
                              >
                                Edit annotation
                              </button>
                            )}
                          </div>
                          <button
                            className="epub-icon"
                            aria-label={`Remove annotation ${highlight.id}`}
                            onClick={() =>
                              setHighlights((items) =>
                                items.filter(
                                  (item) => item.id !== highlight.id,
                                ),
                              )
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {highlights.length > 0 && (
                      <button
                        className="epub-button"
                        onClick={() => setHighlights([])}
                      >
                        <Trash2 size={15} />
                        Clear annotations
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="epub-sidebar-footer">
                <BookOpen size={15} />
                <span>
                  {isSample
                    ? "Public domain · Project Gutenberg"
                    : "Reading in your browser"}
                </span>
              </div>
            </aside>
          </>
        )}
        <div className="epub-reading-area">
          <div className="epub-document-heading">
            <div>
              <span className="epub-eyebrow">YOUR READING SPACE</span>
              <h2>{title}</h2>
            </div>
            <div className="epub-layout" aria-label="Reading layout">
              <button
                aria-pressed={flow === "paginated"}
                onClick={() => {
                  setReady(false);
                  setFlow("paginated");
                }}
              >
                Pages
              </button>
              <button
                aria-pressed={flow === "scrolled-doc"}
                onClick={() => {
                  setReady(false);
                  setFlow("scrolled-doc");
                }}
              >
                Scroll
              </button>
            </div>
          </div>
          <section className="epub-paper" aria-label="EPUB document">
            <EpubHighlighter
              ref={ref}
              source={source}
              highlights={highlights}
              flow={flow}
              styles={styles}
              customCss={customCss}
              onReady={(adapter) => {
                setReady(true);
                setStatus("Ready to read");
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
                if (!selection.position.cfiRange || draft) return;
                const annotation: EpubAnnotation = {
                  id: crypto.randomUUID(),
                  type: ["highlight", "underline", "mark"].includes(
                    annotationType,
                  )
                    ? annotationType
                    : "note",
                  position: selection.position,
                  content: { ...selection.content, tool: annotationType },
                };
                selection.hide?.();
                if (
                  ["highlight", "underline", "mark"].includes(annotationType)
                ) {
                  setHighlights((items) => [...items, annotation]);
                  setStatus("Passage saved to Notes");
                } else setDraft(annotation);
              }}
            />
          </section>
          <footer className="epub-reader-footer">
            <div className="epub-selection-tool">
              <Highlighter size={16} aria-hidden="true" />
              <label htmlFor="epub-selection-tool">Selection tool</label>
              <select
                id="epub-selection-tool"
                value={annotationType}
                onChange={(e) => {
                  const tool = annotationTools.find(
                    (item) => item.id === e.target.value,
                  );
                  if (tool) setAnnotationType(tool.id);
                }}
              >
                {annotationTools.map((tool) => (
                  <option key={tool.id} value={tool.id}>
                    {tool.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="epub-reader-status" role="status">
              {status}
            </span>
            <div className="epub-page-controls">
              <button
                className="epub-icon"
                aria-label="Previous page"
                disabled={!ready}
                onClick={() => void run(async () => ref.current?.prev())}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="epub-icon"
                aria-label="Next page"
                disabled={!ready}
                onClick={() => void run(async () => ref.current?.next())}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </footer>
          <EpubAnnotationTools
            tool={annotationType}
            disabled={!ready}
            compact={compactNotes}
            onCompactChange={() => setCompactNotes((value) => !value)}
            onChange={(tool) => {
              setAnnotationType(tool);
              setStatus(`${toolLabel(tool)}: select a passage in the book`);
              if (window.matchMedia("(max-width: 760px)").matches)
                setSidebarOpen(false);
            }}
          />
        </div>
        {settingsOpen && (
          <section className="epub-settings" aria-label="Reading appearance">
            <div className="epub-panel-heading">
              <h2>Reading appearance</h2>
              <button
                className="epub-icon"
                aria-label="Close appearance"
                onClick={() => setSettingsOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="epub-muted">Make the page feel right for you.</p>
            <label>
              Font size <span>{fontSize}px</span>
              <input
                aria-label="Font size"
                type="range"
                min={12}
                max={32}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
              />
            </label>
            <label>
              Font
              <select
                aria-label="Font"
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
              >
                <option value="Georgia, serif">Georgia · Serif</option>
                <option value="Arial, sans-serif">Arial · Sans serif</option>
              </select>
            </label>
            <label>
              Line height <span>{lineHeight.toFixed(1)}</span>
              <input
                aria-label="Line height"
                type="range"
                min={1}
                max={2.5}
                step={0.1}
                value={lineHeight}
                onChange={(e) => setLineHeight(Number(e.target.value))}
              />
            </label>
            <button className="epub-button" onClick={() => setDark(!dark)}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
              {dark ? "Use light theme" : "Use dark theme"}
            </button>
            <details>
              <summary>Custom book styles</summary>
              <label>
                Custom CSS
                <textarea
                  aria-label="Custom CSS"
                  value={customCss}
                  onChange={(e) => setCustomCss(e.target.value)}
                  spellCheck={false}
                />
              </label>
            </details>
          </section>
        )}
      </div>
      {draft && (
        <EpubSketchEditor
          key={draft.id}
          annotation={draft}
          onCancel={() => setDraft(null)}
          onSave={(annotation) => {
            setHighlights((items) => [
              ...items.filter((item) => item.id !== annotation.id),
              annotation,
            ]);
            setDraft(null);
            setTab("annotations");
            setSidebarOpen(true);
            setStatus("Annotation saved to Notes");
          }}
        />
      )}
    </main>
  );
}
