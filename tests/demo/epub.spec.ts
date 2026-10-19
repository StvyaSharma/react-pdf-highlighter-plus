import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const fixture = path.resolve("tests/fixtures/reader.epub");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=",
  "base64",
);

async function ready(page: Page) {
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeEnabled();
}
async function choose(page: Page, tool: string) {
  await page
    .getByRole("button", { name: "Open annotation tools", exact: true })
    .click();
  await page
    .locator(".epub-tool-grid")
    .getByRole("button", { name: tool, exact: true })
    .click();
}
async function selectPassage(page: Page) {
  // Select text endpoints, like browser selection. Element ranges do not model
  // real user selections and produce different CFIs in EPUB.js.
  const text = await page
    .locator("iframe")
    .first()
    .evaluate((frame: HTMLIFrameElement) => {
      const doc = frame.contentDocument!;
      frame.contentWindow!.focus();
      const paragraph =
        [...doc.querySelectorAll("p")].find((p) =>
          p.textContent?.includes("truth universally"),
        ) || doc.querySelector("p")!;
      const walker = doc.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const nodes: Node[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      const range = doc.createRange();
      range.setStart(nodes[0], 0);
      range.setEnd(
        nodes[nodes.length - 1],
        nodes[nodes.length - 1].textContent!.length,
      );
      const selection = frame.contentWindow!.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      doc.dispatchEvent(new Event("selectionchange"));
      return range.toString();
    });
  await page
    .getByRole("button", { name: "Annotate selection", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .first()
        .evaluate(
          (f: HTMLIFrameElement) =>
            f.contentWindow?.getSelection()?.isCollapsed ?? true,
        ),
    )
    .toBe(true);
  return text;
}
async function save(page: Page) {
  await page
    .getByRole("button", { name: "Save annotation", exact: true })
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
}
async function newSketch(page: Page, tool = "Rectangle") {
  await choose(page, tool);
  await selectPassage(page);
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function drag(page: Page, reverse = false) {
  const box = (await page.locator(".epub-sketch-canvas").boundingBox())!;
  const a = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.25 };
  const b = { x: box.x + box.width * 0.8, y: box.y + box.height * 0.75 };
  const [start, end] = reverse ? [b, a] : [a, b];
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}
async function openNotes(page: Page) {
  if (
    await page
      .getByRole("button", { name: "Show sidebar", exact: true })
      .count()
  )
    await page
      .getByRole("button", { name: "Show sidebar", exact: true })
      .click();
  await page.locator("#epub-tab-annotations").click();
}

// Any uncaught application error fails the scenario, including errors after save.
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto("/?format=epub");
  await ready(page);
  await page.getByRole("button", { name: "Chapter I.", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Chapter I.", exact: true }),
  ).toHaveAttribute("aria-current", "location");
});

test("clicking the current layout keeps navigation and tools enabled", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await ready(page);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await choose(page, "Add note");
  await selectPassage(page);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("layout changes preserve the current chapter, not the cover", async ({
  page,
}) => {
  await page.getByRole("button", { name: "CHAPTER X.", exact: true }).click();
  await page.getByRole("button", { name: "Scroll", exact: true }).click();
  await ready(page);
  // The first spine section contains the cover and Chapter I; X is in a later section.
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .first()
        .evaluate(
          (f: HTMLIFrameElement) => f.contentDocument?.body.textContent || "",
        ),
    )
    .toContain("CHAPTER X.");
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await ready(page);
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .first()
        .evaluate(
          (f: HTMLIFrameElement) => f.contentDocument?.body.textContent || "",
        ),
    )
    .toContain("CHAPTER X.");
});

test("notes capture full text, escape markup, edit, cancel and delete", async ({
  page,
}) => {
  await choose(page, "Add note");
  const text = await selectPassage(page);
  await expect(
    page.getByRole("button", { name: "Save annotation", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Your note", exact: true })
    .fill("<script>bad()</script> A complete note.");
  await save(page);
  await expect(page.locator(".epub-note-content span")).toHaveText(text);
  await expect(page.locator(".epub-note-comment")).toHaveText(
    "<script>bad()</script> A complete note.",
  );
  await page
    .getByRole("button", { name: "Edit annotation", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your note", exact: true })
    .fill("Unsaved change");
  await page.keyboard.press("Escape");
  await expect(page.locator(".epub-note-comment")).toContainText(
    "A complete note.",
  );
  await page
    .getByRole("button", { name: "Edit annotation", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your note", exact: true })
    .fill("Edited note");
  await save(page);
  await expect(page.locator(".epub-note-comment")).toHaveText("Edited note");
  await page.getByRole("button", { name: /Remove annotation/ }).click();
  await expect(page.locator(".epub-notes>li")).toHaveCount(0);
});

for (const [tool, tag] of [
  ["Rectangle", "rect"],
  ["Circle", "ellipse"],
  ["Arrow", "line"],
  ["Area highlight", "rect"],
  ["Draw", "path"],
  ["Add signature", "path"],
]) {
  test(`${tool} pointer gesture saves a passage attachment`, async ({
    page,
  }) => {
    await newSketch(page, tool);
    await drag(page, true);
    await expect(page.locator(".epub-sketch-actions")).toContainText(
      "1 sketch elements",
    );
    await page
      .getByRole("textbox", { name: "Sketch caption" })
      .fill(`${tool} caption`);
    await save(page);
    const drawing = page.locator(`.epub-sketch-preview-button svg > ${tag}`);
    await expect(drawing).toHaveCount(1);
    if (tag === "rect") {
      expect(Number(await drawing.getAttribute("width"))).toBeGreaterThan(100);
      expect(Number(await drawing.getAttribute("height"))).toBeGreaterThan(100);
    }
    await page
      .getByRole("button", { name: "Edit passage sketch", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Sketch caption" }),
    ).toHaveValue(`${tool} caption`);
    await expect(page.locator(".epub-sketch-actions")).toContainText(
      "1 sketch elements",
    );
  });
}

test("mixed shapes, ink settings, undo, clear, and cancellation", async ({
  page,
}) => {
  await newSketch(page);
  await page.getByLabel("Ink color", { exact: true }).fill("#ff0000");
  await page.getByLabel("Ink width", { exact: true }).selectOption("8");
  await page
    .getByRole("button", { name: "Insert rectangle", exact: true })
    .click();
  await expect(page.locator(".epub-sketch-canvas > rect")).toHaveAttribute(
    "stroke",
    "#ff0000",
  );
  await expect(page.locator(".epub-sketch-canvas > rect")).toHaveAttribute(
    "stroke-width",
    "8",
  );
  await page
    .locator("dialog")
    .getByRole("button", { name: "Circle", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Insert circle", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Undo sketch action", exact: true })
    .click();
  await expect(page.locator(".epub-sketch-canvas > ellipse")).toHaveCount(0);
  await save(page);
  await page
    .getByRole("button", { name: "Edit passage sketch", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear sketch", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save annotation", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.locator(".epub-sketch-preview-button svg > rect"),
  ).toHaveCount(1);
});

test("images decode, persist and undo; invalid uploads are rejected", async ({
  page,
}) => {
  await newSketch(page, "Add image");
  const input = page.getByLabel("Choose sketch image", { exact: true });
  await input.setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("bad"),
  });
  await expect(page.getByRole("alert")).toContainText("Choose a PNG");
  await input.setInputFiles({
    name: "corrupt.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert")).toContainText("Could not read");
  await expect(page.locator(".epub-sketch-canvas > image")).toHaveCount(0);
  await input.setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("under 5 MB");
  await input.setInputFiles({
    name: "image.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.locator(".epub-sketch-canvas > image")).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await save(page);
  await expect(
    page.locator(".epub-sketch-preview-button svg > image"),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Edit passage sketch", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Undo sketch action", exact: true })
    .click();
  await expect(page.locator(".epub-sketch-canvas > image")).toHaveCount(0);
});

test("pointer cancellation discards draft and ignores other fingers", async ({
  page,
}) => {
  await newSketch(page, "Draw");
  const svg = page.locator(".epub-sketch-canvas");
  const box = (await svg.boundingBox())!;
  await svg.evaluate((el) =>
    el.addEventListener(
      "pointerdown",
      (event) =>
        el.setAttribute(
          "data-pointer-id",
          String((event as PointerEvent).pointerId),
        ),
      { once: true },
    ),
  );
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 60);
  const before = await svg.locator(":scope > path").getAttribute("d");
  await svg.dispatchEvent("pointermove", {
    pointerId: 42,
    pointerType: "touch",
    clientX: box.x + 250,
    clientY: box.y + 250,
    buttons: 1,
  });
  await expect(svg.locator(":scope > path")).toHaveAttribute("d", before!);
  await svg.dispatchEvent("pointercancel", {
    pointerId: Number(await svg.getAttribute("data-pointer-id")),
  });
  await page.mouse.up();
  await expect(svg.locator(":scope > path")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save annotation", exact: true }),
  ).toBeDisabled();
  await drag(page);
  await save(page);
  await expect(
    page.locator(".epub-sketch-preview-button svg > path"),
  ).toHaveCount(1);
});

test("highlight, underline, mark, compact notes, and clear all", async ({
  page,
}) => {
  for (const tool of ["Highlight", "Underline", "Mark passage"]) {
    await choose(page, tool);
    await selectPassage(page);
  }
  await openNotes(page);
  await expect(page.locator(".epub-notes>li")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Open annotation tools", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Compact notes", exact: true })
    .click();
  await expect(page.locator(".epub-notes")).toHaveClass(/epub-notes-compact/);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open annotation tools", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Clear annotations", exact: true })
    .click();
  await expect(page.locator(".epub-notes>li")).toHaveCount(0);
});

test("attachments navigate to their passage after font, layout and chapter changes", async ({
  page,
}) => {
  await newSketch(page);
  await page
    .getByRole("button", { name: "Insert rectangle", exact: true })
    .click();
  await save(page);
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("slider", { name: "Font size", exact: true }).fill("28");
  await page
    .getByRole("combobox", { name: "Font", exact: true })
    .selectOption("Arial, sans-serif");
  await page
    .getByRole("button", { name: "Use dark theme", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close appearance", exact: true })
    .click();
  await page.getByRole("button", { name: "Scroll", exact: true }).click();
  await ready(page);
  await page.locator("#epub-tab-contents").click();
  await page.getByRole("button", { name: "CHAPTER X.", exact: true }).click();
  await openNotes(page);
  await page.locator(".epub-note-content").click();
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .first()
        .evaluate((f: HTMLIFrameElement) => {
            const p = [...(f.contentDocument?.querySelectorAll("p") ?? [])].find((p) =>
            p.textContent?.includes("truth universally"),
          );
          if (!p) return false;
          const r = p.getBoundingClientRect();
          return r.bottom > 0 && r.top < f.clientHeight;
        }),
    )
    .toBe(true);
  await expect(
    page.locator(".epub-sketch-preview-button svg > rect"),
  ).toHaveCount(1);
});

test("bad EPUB shows an error and a valid upload recovers without stale notes", async ({
  page,
}) => {
  await choose(page, "Add note");
  await selectPassage(page);
  await page
    .getByRole("textbox", { name: "Your note", exact: true })
    .fill("Old book");
  await save(page);
  const input = page.getByLabel("Open EPUB file", { exact: true });
  await input.setInputFiles({
    name: "bad.epub",
    mimeType: "application/epub+zip",
    buffer: Buffer.from("invalid zip"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await input.setInputFiles(fixture);
  await ready(page);
  await openNotes(page);
  await expect(page.locator(".epub-notes>li")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open the sample book", exact: true })
    .click();
  await ready(page);
  await expect(
    page
      .getByRole("heading", { name: "Pride and Prejudice", exact: true })
      .first(),
  ).toBeVisible();
});

test("search spans the complete novel and a result navigates", async ({
  page,
}) => {
  await page.locator("#epub-tab-search").click();
  await page
    .getByRole("textbox", { name: "Search EPUB", exact: true })
    .fill("Bingley");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect
    .poll(() => page.locator(".epub-results li").count())
    .toBeGreaterThan(200);
  await page.locator(".epub-results button").nth(10).click();
  await ready(page);
  await page
    .getByRole("textbox", { name: "Search EPUB", exact: true })
    .fill("zzzz-no-such-passage-zzzz");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByText("No matches. Try another word or a shorter phrase."),
  ).toBeVisible();
});

for (const width of [320, 390, 768]) {
  test(`annotation menu and editor fit ${width}px width`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    if (
      await page
        .getByRole("button", { name: "Hide sidebar", exact: true })
        .count()
    )
      await page
        .getByRole("button", { name: "Hide sidebar", exact: true })
        .click();
    await newSketch(page, "Draw");
    await drag(page);
    await save(page);
    await expect(page.locator(".epub-sketch-preview-button")).toBeVisible();
    await page
      .getByRole("button", { name: "Edit passage sketch", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const r = (await page.getByRole("dialog").boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(width);
  });
}

test("real mouse text selection and explicit capture create an annotation", async ({
  page,
}) => {
  await choose(page, "Highlight");
  const frame = page.locator("iframe").first();
  const word = await frame.evaluate((f: HTMLIFrameElement) => {
    const d = f.contentDocument!,
      walker = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
    const host = f.getBoundingClientRect(),
      clip = f.closest(".epub-paper")!.getBoundingClientRect();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (["STYLE", "SCRIPT"].includes(node.parentElement!.tagName)) continue;
      for (const match of node.textContent!.matchAll(/\b[a-zA-Z]{5,}\b/g)) {
        const range = d.createRange();
        range.setStart(node, match.index!);
        range.setEnd(node, match.index! + match[0].length);
        const r = range.getBoundingClientRect(),
          x = host.x + r.x,
          y = host.y + r.y;
        if (
          x > clip.left + 15 &&
          x + r.width < clip.right - 15 &&
          y > clip.top + 15 &&
          y + r.height < clip.bottom - 15
        )
          return { x: x + r.width / 2, y: y + r.height / 2, text: match[0] };
      }
    }
    throw new Error("No visible word");
  });
  await page.mouse.dblclick(word.x, word.y);
  await page
    .getByRole("button", { name: "Annotate selection", exact: true })
    .click();
  await openNotes(page);
  await expect(page.locator(".epub-notes>li")).toHaveCount(1);
  await expect(page.locator(".epub-note-content span")).toContainText(
    word.text,
  );
});
