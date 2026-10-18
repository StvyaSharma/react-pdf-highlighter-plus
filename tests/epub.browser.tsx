import React, { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { EpubAdapter } from "../src/adapters/EpubAdapter";
import {
  EpubHighlighter,
  type EpubHighlighterHandle,
  type EpubHighlighterProps,
} from "../src/components/EpubHighlighter";
import { useDocumentHighlighterContext } from "../src/core/DocumentContext";
import type { DocumentSelection } from "../src/core/types";
import fixtureUrl from "./fixtures/reader.epub?url";

type Result = { feature: string; passed: boolean; error?: string };
const output = document.getElementById("results")!;
const testHost = document.getElementById("test-host")!;
const results: Result[] = [];
const unexpected: string[] = [];
window.addEventListener("unhandledrejection", (event) =>
  unexpected.push(String(event.reason?.stack ?? event.reason)),
);
window.addEventListener("error", (event) => unexpected.push(event.message));
const assert = (value: unknown, message: string): void => {
  if (!value) throw new Error(message);
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => unknown, message: string, timeout = 4000) {
  const started = performance.now();
  while (!check()) {
    if (performance.now() - started > timeout) throw new Error(message);
    await wait(20);
  }
}
async function test(feature: string, run: () => Promise<void> | void) {
  try {
    await run();
    results.push({ feature, passed: true });
  } catch (error) {
    results.push({ feature, passed: false, error: String(error) });
  }
  output.textContent = results
    .map(
      (r) =>
        `${r.passed ? "PASS" : "FAIL"} ${r.feature}${r.error ? `: ${r.error}` : ""}`,
    )
    .join("\n");
}
function host() {
  const el = document.createElement("div");
  el.style.cssText = "width:900px;height:550px;position:relative";
  testHost.appendChild(el);
  return el;
}
function doc(el: HTMLElement) {
  return el.querySelector("iframe")!.contentDocument!;
}
function bodyStyle(el: HTMLElement) {
  const d = doc(el);
  return d.defaultView!.getComputedStyle(d.body);
}
// These diagnostics inspect actual epub.js state, rather than mocked calls.
function rendition(adapter: EpubAdapter): any {
  return (adapter as any).rendition;
}
function annotations(adapter: EpubAdapter): any[] {
  return Object.values(rendition(adapter).annotations._annotations);
}
function emitSelection(adapter: EpubAdapter, cfi: string) {
  const r = rendition(adapter);
  r.emit("selected", cfi, r.getContents()[0]);
}
function ContextProbe() {
  const context = useDocumentHighlighterContext();
  (window as any).epubContext = context;
  return null;
}

export async function runEpubValidation() {
  results.length = 0;
  unexpected.length = 0;
  testHost.replaceChildren();
  let root: Root | null = null;
  const a = new EpubAdapter({ width: 900, height: 550 });
  const el = host();
  let matches: Array<{ cfi?: string; excerpt?: string; href?: string }> = [];
  try {
    await test("URL loading and first chapter rendering", async () => {
      await a.load(fixtureUrl);
      await a.render(el);
      assert(
        doc(el).body.textContent?.includes("chapter 1"),
        "First chapter missing",
      );
    });
    await test("Outline contains all chapters", async () => {
      const toc = (await a.getOutline()) as Array<{ href: string }>;
      assert(
        toc.length === 3 && toc[2].href === "chapter3.xhtml",
        JSON.stringify(toc),
      );
    });
    await test("Case-insensitive full-book search and CFI results", async () => {
      matches = await a.search("LIGHTHOUSE");
      assert(
        matches.length === 6 &&
          matches.every(
            (m) =>
              m.cfi?.startsWith("epubcfi(") &&
              m.excerpt?.toLowerCase().includes("lighthouse"),
          ),
        JSON.stringify(matches),
      );
    });
    await test("Empty, whitespace, and missing searches", async () => {
      for (const query of ["", "   ", "absent-term-123"])
        assert((await a.search(query)).length === 0, query);
    });
    await test("Concurrent searches leave live sections intact", async () => {
      const section = (a as any).book.spine.get(0);
      const originalDocument = section.document;
      const [first, second] = await Promise.all([
        a.search("amber"),
        a.search("chapter"),
      ]);
      assert(
        first.length === 3 && second.length >= 6,
        "Concurrent result mismatch",
      );
      assert(
        section.document === originalDocument && section.document,
        "Search unloaded live document",
      );
    });
    await test("Typography and colors apply to current content", () => {
      a.setStyles({
        fontSize: 22,
        fontFamily: "Georgia, serif",
        lineHeight: 1.8,
        color: "#123456",
        background: "#f0e0d0",
      });
      const s = bodyStyle(el);
      assert(
        s.fontSize === "22px" &&
          s.fontFamily.includes("Georgia") &&
          s.lineHeight === "39.6px" &&
          s.color === "rgb(18, 52, 86)" &&
          s.backgroundColor === "rgb(240, 224, 208)",
        JSON.stringify({
          size: s.fontSize,
          font: s.fontFamily,
          line: s.lineHeight,
          color: s.color,
          bg: s.backgroundColor,
        }),
      );
    });
    await test("CSS updates replace earlier rules without accumulating styles", () => {
      a.injectCss("p { text-align: right; }");
      a.injectCss("p { text-align: center; }");
      const d = doc(el);
      assert(
        d.querySelectorAll("style[data-epub-reader-css]").length === 1 &&
          d.defaultView!.getComputedStyle(d.querySelector("p")!).textAlign ===
            "center",
        "CSS not replaced",
      );
    });
    await test("Next/previous chapter and location reporting", async () => {
      await a.next();
      await until(
        () => a.currentLocation()?.cfi?.includes("/6/4"),
        "Next location not updated",
      );
      assert(
        doc(el).body.textContent?.includes("chapter 2"),
        "Next chapter missing",
      );
      await a.prev();
      await until(
        () => a.currentLocation()?.cfi?.includes("/6/2"),
        "Previous location not updated",
      );
      assert(
        doc(el).body.textContent?.includes("chapter 1"),
        "Previous chapter missing",
      );
      assert((a.currentLocation()?.page ?? 0) >= 1, "Displayed page missing");
    });
    await test("Styles and latest CSS persist into future chapters", async () => {
      await a.display("chapter3.xhtml");
      const s = bodyStyle(el),
        d = doc(el);
      assert(
        s.fontSize === "22px" &&
          s.fontFamily.includes("Georgia") &&
          s.color === "rgb(18, 52, 86)" &&
          d.defaultView!.getComputedStyle(d.querySelector("p")!).textAlign ===
            "center",
        "Future chapter styles missing",
      );
    });
    await test("Search result navigation by CFI and numeric spine index", async () => {
      await a.display(matches[0].cfi);
      assert(
        doc(el).body.textContent?.includes("chapter 1"),
        "CFI jump failed",
      );
      await a.display(1);
      assert(
        doc(el).body.textContent?.includes("chapter 2"),
        "Spine index jump failed",
      );
      await a.display(0);
    });
    await test("Native text selection returns text, position, and hide callback", async () => {
      let selection: DocumentSelection | undefined;
      const off = a.onSelection((value) => {
        selection = value;
      });
      const d = doc(el),
        range = d.createRange(),
        text = d.getElementById("quote")!.firstChild!;
      range.setStart(text, 10);
      range.setEnd(text, 20);
      d.defaultView!.getSelection()!.addRange(range);
      d.dispatchEvent(new Event("selectionchange"));
      await until(() => selection, "Native selection never forwarded");
      assert(
        selection?.content?.text?.toLowerCase() === "lighthouse" &&
          selection.position.format === "epub" &&
          typeof selection.hide === "function",
        JSON.stringify(selection),
      );
      selection!.hide!();
      off();
      selection = undefined;
      emitSelection(a, matches[0].cfi!);
      assert(!selection, "Unsubscribe failed");
    });
    await test("Add, replace, navigate, and remove highlights", async () => {
      const cfi = matches[0].cfi!;
      const handle = a.addHighlight({ format: "epub", cfiRange: cfi });
      assert(
        annotations(a).length === 1 && el.querySelector("svg .epub-highlight"),
        "Highlight not drawn",
      );
      a.addHighlight({ format: "epub", cfiRange: cfi }, { fill: "red" });
      assert(
        annotations(a).length === 1 &&
          el.querySelectorAll("svg .epub-highlight").length === 1,
        "Replacement orphaned highlight",
      );
      await a.display(2);
      await a.display(0);
      assert(
        el.querySelector("svg .epub-highlight"),
        "Highlight lost across navigation",
      );
      a.removeHighlight(handle);
      assert(
        annotations(a).length === 0 && !el.querySelector("svg .epub-highlight"),
        "Removal failed",
      );
      assert(
        a.addHighlight({ format: "pdf", cfiRange: cfi }) === "",
        "Wrong format accepted",
      );
    });
    await test("Underline, mark, and note annotations are visible and removable", async () => {
      for (const type of ["underline", "mark", "note"]) {
        a.annotate(type, matches[0].cfi!, { note: "A test note" });
        assert(annotations(a).length === 1, `${type} missing`);
        const view = rendition(a).views().all()[0];
        assert(
          type === "mark"
            ? Object.keys(view.marks).length === 1
            : el.querySelector(`svg .epub-${type}`),
          `${type} not drawn`,
        );
        if (type === "mark") {
          const visible = () =>
            el.querySelector<HTMLElement>('[ref="epubjs-mk"]');
          assert(
            visible()?.textContent &&
              visible()!.getBoundingClientRect().width > 0 &&
              visible()!.getAttribute("role") === "button",
            "Mark is invisible or inaccessible",
          );
          await a.display(1);
          await a.display(0);
          assert(
            visible()?.textContent &&
              visible()!.getBoundingClientRect().width > 0,
            "Mark invisible after navigation",
          );
        }
        a.removeAnnotation(matches[0].cfi!, type);
        assert(annotations(a).length === 0, `${type} removal failed`);
      }
    });
    await test("Removing style props and CSS clears overrides", () => {
      a.setStyles({});
      a.injectCss("");
      assert(
        bodyStyle(el).fontSize !== "22px" &&
          !doc(el).querySelector("style[data-epub-reader-css]"),
        "Old styling remains",
      );
    });
    await test("ArrayBuffer loading and scrolled flow", async () => {
      const other = new EpubAdapter({
        width: 900,
        height: 550,
        flow: "scrolled-doc",
      });
      const h = host();
      try {
        await other.load(await (await fetch(fixtureUrl)).arrayBuffer());
        await other.render(h);
        assert(
          doc(h).body.textContent?.includes("chapter 1") &&
            rendition(other).settings.flow === "scrolled-doc",
          "Buffer/flow failed",
        );
      } finally {
        other.destroy();
        h.remove();
      }
    });
    await test("Object source preserves options", async () => {
      const other = new EpubAdapter();
      try {
        await other.load({
          url: fixtureUrl,
          requestHeaders: { "X-Reader-Test": "yes" },
        });
        assert(
          (other as any).book.settings.requestHeaders["X-Reader-Test"] ===
            "yes",
          "Options discarded",
        );
      } finally {
        other.destroy();
      }
    });
    await test("Invalid sources and missing books reject instead of hanging", async () => {
      for (const source of [
        {},
        "/missing-validation.epub",
        new ArrayBuffer(8),
      ]) {
        const other = new EpubAdapter();
        try {
          const result = await Promise.race([
            other.load(source).then(
              () => "resolved",
              () => "rejected",
            ),
            wait(1500).then(() => "timeout"),
          ]);
          assert(
            result === "rejected",
            `Invalid source ${String(source)}: ${result}`,
          );
        } finally {
          other.destroy();
        }
      }
    });
    await test("Destroy during loading and immediate reload", async () => {
      const other = new EpubAdapter();
      await Promise.all([other.load(fixtureUrl), other.load(fixtureUrl)]);
      other.destroy();
      await other.load(fixtureUrl);
      assert((await other.getOutline()).length === 3, "Reload failed");
      other.destroy();
    });
    await test("Destroy during an in-flight network request is safe", async () => {
      const other = new EpubAdapter();
      let started = false;
      const loading = other.load({
        url: fixtureUrl,
        requestMethod: async () => {
          started = true;
          await wait(60);
          return (await fetch(fixtureUrl)).arrayBuffer();
        },
      });
      await until(() => started, "Request not started");
      other.destroy();
      await loading;
      assert(
        (await other.getOutline()).length === 0 && !other.currentLocation(),
        "Destroyed book revived",
      );
    });
    await test("Destroy during rendering releases the pending viewer", async () => {
      const other = new EpubAdapter({ width: 900, height: 550 }),
        h = host();
      await other.load(fixtureUrl);
      const rendering = other.render(h);
      other.destroy();
      await rendering;
      await wait(50);
      assert(!h.querySelector("iframe"), "Pending viewer survived destroy");
      h.remove();
    });
    const h = host();
    const ref = createRef<EpubHighlighterHandle>();
    let readyCount = 0;
    root = createRoot(h);
    let readyHasHandle = false;
    let props: EpubHighlighterProps = {
      source: fixtureUrl,
      highlights: [],
      width: 900,
      height: 550,
      onReady: (adapter) => {
        readyCount += 1;
        readyHasHandle = ref.current?.adapter === adapter;
      },
    };
    const render = (next: Partial<EpubHighlighterProps> = {}) => {
      props = { ...props, ...next };
      flushSync(() =>
        root!.render(
          <React.StrictMode>
            <EpubHighlighter ref={ref} {...props}>
              <ContextProbe />
            </EpubHighlighter>
          </React.StrictMode>,
        ),
      );
    };
    await test("React StrictMode mounting renders exactly one viewer", async () => {
      render();
      await until(() => ref.current?.adapter, "React adapter not ready");
      assert(
        h.querySelectorAll("iframe").length === 1 &&
          readyCount === 1 &&
          readyHasHandle,
        "Duplicate viewer / invalid ready handle",
      );
    });
    const highlighter = () => ref.current!;
    await test("React style and CSS props update and clear", async () => {
      render({
        styles: {
          fontSize: 24,
          fontFamily: "Georgia",
          lineHeight: 2,
          color: "purple",
          background: "beige",
        },
        customCss: "p { text-align:right }",
      });
      assert(
        bodyStyle(h).fontSize === "24px" && bodyStyle(h).lineHeight === "48px",
        "Styles not synced",
      );
      render({ styles: undefined, customCss: undefined });
      assert(
        bodyStyle(h).fontSize !== "24px" &&
          !doc(h).querySelector("style[data-epub-reader-css]"),
        "Props did not clear",
      );
    });
    await test("Controlled highlights update same ID, change type, and remove", () => {
      const one = {
        id: "same",
        type: "text",
        position: { format: "epub", cfiRange: matches[0].cfi },
      };
      render({ highlights: [one] });
      assert(
        annotations(highlighter().adapter!).length === 1,
        "Controlled add failed",
      );
      const two = {
        ...one,
        position: { format: "epub", cfiRange: matches[1].cfi },
      };
      render({ highlights: [two] });
      assert(
        annotations(highlighter().adapter!)[0].cfiRange === matches[1].cfi &&
          annotations(highlighter().adapter!).length === 1,
        "Same-ID update failed",
      );
      render({ highlights: [{ ...two, type: "underline" }] });
      assert(
        annotations(highlighter().adapter!)[0].type === "underline",
        "Type update failed",
      );
      render({ highlights: [] });
      assert(
        annotations(highlighter().adapter!).length === 0,
        "Controlled removal failed",
      );
    });
    await test("Duplicate ranges and non-EPUB highlights reconcile safely", () => {
      const one = {
        id: "one",
        position: { format: "epub", cfiRange: matches[0].cfi },
      };
      render({
        highlights: [
          one,
          { ...one, id: "two" },
          { id: "pdf", position: { format: "pdf" } },
        ],
      });
      assert(
        annotations(highlighter().adapter!).length === 1,
        "Duplicate/wrong format rendered",
      );
      render({ highlights: [one] });
      assert(
        annotations(highlighter().adapter!).length === 1,
        "Removing duplicate removed shared range",
      );
      render({ highlights: [one, { ...one, id: "note", type: "note" }] });
      render({ highlights: [one] });
      assert(
        annotations(highlighter().adapter!).length === 1 &&
          h.querySelector("svg .epub-highlight"),
        "Removing note removed shared highlight",
      );
      render({ highlights: [] });
    });
    await test("React selection callbacks update without stale subscriptions", () => {
      let first = 0,
        second = 0;
      render({
        onSelection: () => {
          first += 1;
        },
      });
      emitSelection(highlighter().adapter!, matches[0].cfi!);
      render({
        onSelection: () => {
          second += 1;
        },
      });
      emitSelection(highlighter().adapter!, matches[0].cfi!);
      assert(first === 1 && second === 1, `${first}/${second}`);
    });
    await test("Imperative navigation, search, outline, styles, CSS and annotations", async () => {
      assert(
        (await highlighter().search("amber")).length === 3 &&
          (await highlighter().getOutline()).length === 3,
        "Handle search/outline failed",
      );
      await highlighter().next();
      await highlighter().prev();
      await highlighter().display(2);
      assert(
        doc(h).body.textContent?.includes("chapter 3"),
        "Handle navigation failed",
      );
      await highlighter().display(0);
      highlighter().setStyles({ fontSize: 26 });
      highlighter().injectCss("p {text-align:center}");
      assert(bodyStyle(h).fontSize === "26px", "Handle styles failed");
      highlighter().annotate("underline", matches[0].cfi!);
      assert(
        annotations(highlighter().adapter!).length === 1,
        "Handle annotate failed",
      );
      highlighter().removeAnnotation(matches[0].cfi!, "underline");
      assert(
        annotations(highlighter().adapter!).length === 0,
        "Handle remove failed",
      );
    });
    await test("All feature switches disable their public behavior", async () => {
      let selections = 0;
      render({
        features: {
          highlight: false,
          search: false,
          navigation: false,
          outline: false,
        },
        onSelection: () => {
          selections += 1;
        },
        highlights: [
          {
            id: "disabled",
            position: { format: "epub", cfiRange: matches[0].cfi },
          },
        ],
      });
      assert(
        (await highlighter().search("amber")).length === 0 &&
          (await highlighter().getOutline()).length === 0,
        "Search/outline enabled",
      );
      await highlighter().next();
      await highlighter().prev();
      await highlighter().display(2);
      assert(
        doc(h).body.textContent?.includes("chapter 1"),
        "Navigation enabled",
      );
      assert(
        highlighter().annotate("highlight", matches[0].cfi!) === "" &&
          annotations(highlighter().adapter!).length === 0,
        "Highlights enabled",
      );
      emitSelection(highlighter().adapter!, matches[0].cfi!);
      assert(selections === 0, "Selections enabled");
      render({ features: undefined, highlights: [] });
      assert(
        (await highlighter().search("amber")).length === 3,
        "Feature did not re-enable",
      );
    });
    await test("Context scrolling and tip controls", async () => {
      const ctx = () => (window as any).epubContext;
      assert(
        ctx().adapter === highlighter().adapter,
        "Context adapter mismatch",
      );
      ctx().scrollToHighlight({
        position: { format: "epub", cfiRange: matches[4].cfi },
      });
      await until(
        () => doc(h).body.textContent?.includes("chapter 3"),
        "Context scroll failed",
      );
      flushSync(() => ctx().setTip(<span>Test annotation tip</span>));
      assert(h.textContent?.includes("Test annotation tip"), "Tip absent");
      flushSync(() => ctx().clearTip());
      assert(
        !h.textContent?.includes("Test annotation tip"),
        "Tip not cleared",
      );
    });
    await test("React source replacement rebuilds controlled annotations", async () => {
      const previous = highlighter().adapter;
      const buffer = await (await fetch(fixtureUrl)).arrayBuffer();
      render({
        source: buffer,
        highlights: [
          {
            id: "new-source",
            position: { format: "epub", cfiRange: matches[0].cfi },
          },
        ],
      });
      await until(
        () => ref.current?.adapter && ref.current.adapter !== previous,
        "Source not replaced",
      );
      await until(
        () => annotations(highlighter().adapter!).length === 1,
        "Highlights not restored",
      );
      assert(h.querySelectorAll("iframe").length === 1, "Stale viewer remains");
    });
    await test("React load errors are visible and recovery works", async () => {
      let error: Error | undefined;
      render({
        source: "/missing-validation.epub",
        onError: (e) => {
          error = e;
        },
      });
      await until(() => error, "onError never called");
      assert(
        h
          .querySelector('[role="alert"]')
          ?.textContent?.includes("Unable to open EPUB"),
        "No error UI",
      );
      render({ source: fixtureUrl });
      await until(() => ref.current?.adapter, "Recovery failed");
      assert(!h.querySelector('[role="alert"]'), "Error not cleared");
    });
    await test("Rapid prop changes and unmount during loading leave no viewer", async () => {
      render({ source: await (await fetch(fixtureUrl)).arrayBuffer() });
      render({ source: fixtureUrl });
      flushSync(() => root!.unmount());
      root = null;
      await wait(200);
      assert(h.querySelectorAll("iframe").length === 0, "Unmount left iframe");
    });
    await test("No unexpected browser errors or unhandled rejections", async () => {
      await wait(150);
      assert(unexpected.length === 0, unexpected.join("\n"));
    });
  } finally {
    if (root) flushSync(() => root!.unmount());
    a.destroy();
    testHost.replaceChildren();
  }
  const report = {
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results: [...results],
    unexpected: [...unexpected],
  };
  (window as any).epubValidationReport = report;
  document.title = `EPUB validation: ${report.passed} passed, ${report.failed} failed`;
  return report;
}
(window as any).runEpubValidation = runEpubValidation;
document.getElementById("run")!.addEventListener("click", () => {
  void runEpubValidation();
});
