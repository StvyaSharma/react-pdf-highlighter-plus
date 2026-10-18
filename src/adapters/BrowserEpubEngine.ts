import { EpubAdapter, type EpubAdapterOptions } from "./EpubAdapter";
import {
  desiredAnnotations,
  type AnnotationRecord,
} from "../reader/annotations";
import { ReaderFailure, readerError } from "../reader/errors";
import type {
  ReaderConfiguration,
  ReaderEngine,
  ReaderEvent,
  ReaderOutlineItem,
  ReaderSource,
} from "../reader/types";

/** Browser-only mount code. The controller never sees this HTMLElement. */
export class BrowserEpubEngine implements ReaderEngine {
  readonly adapter: EpubAdapter;
  private host: HTMLDivElement;
  private annotations = new Map<string, AnnotationRecord>();
  private listeners = new Set<(event: ReaderEvent) => void>();
  private off: Array<() => void> = [];
  constructor(container: HTMLElement, options: EpubAdapterOptions = {}) {
    this.host = container.ownerDocument.createElement("div");
    this.host.style.cssText = "width:100%;height:100%";
    container.appendChild(this.host);
    this.adapter = new EpubAdapter(options);
    this.off.push(
      this.adapter.onSelection((selection) =>
        this.emit({
          type: "selection",
          selection: {
            format: "epub",
            position: selection.position,
            content: selection.content,
          },
        }),
      ),
    );
    this.off.push(
      this.adapter.onLocation((location) =>
        this.emit({ type: "location", location }),
      ),
    );
  }
  private emit(event: ReaderEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
  subscribe(listener: (event: ReaderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  async open(source: ReaderSource): Promise<void> {
    try {
      await this.adapter.load(source);
    } catch (error) {
      throw new ReaderFailure(readerError(error, "LOAD_FAILED", "load"));
    }
    try {
      await this.adapter.render(this.host);
    } catch (error) {
      throw new ReaderFailure(readerError(error, "RENDER_FAILED", "render"));
    }
  }
  close(): void {
    this.off.forEach((off) => off());
    this.off = [];
    this.listeners.clear();
    this.adapter.destroy();
    this.host.remove();
    this.annotations.clear();
  }
  configure(configuration: ReaderConfiguration): void {
    const desired = desiredAnnotations(
      configuration.highlights,
      configuration.features?.highlight !== false,
    );
    this.adapter.setStyles(configuration.styles ?? {});
    this.adapter.injectCss(configuration.customCss ?? "");
    for (const [key, annotation] of this.annotations) {
      if (desired.get(key)?.signature !== annotation.signature) {
        this.adapter.removeAnnotation(annotation.cfi, annotation.type);
        this.annotations.delete(key);
      }
    }
    for (const [key, annotation] of desired) {
      if (this.annotations.has(key)) continue;
      const cfi = this.adapter.annotate(
        annotation.type,
        annotation.cfi,
        annotation.data,
      );
      if (cfi) this.annotations.set(key, annotation);
    }
  }
  async next() {
    await this.adapter.next();
    this.reportLocation();
  }
  async prev() {
    await this.adapter.prev();
    this.reportLocation();
  }
  async display(target?: string | number) {
    await this.adapter.display(target);
    this.reportLocation();
  }
  private reportLocation() {
    const location = this.adapter.currentLocation();
    if (location) this.emit({ type: "location", location });
  }
  search(query: string) {
    return this.adapter.search(query);
  }
  async getOutline() {
    return (await this.adapter.getOutline()) as ReaderOutlineItem[];
  }
  async getLocation() {
    return this.adapter.currentLocation();
  }
  captureSelection() {
    return this.adapter.captureSelection();
  }
  clearSelection() {
    this.adapter.clearSelection();
  }
  annotate(
    type: string,
    cfi: string,
    data?: Record<string, unknown>,
    styles?: Record<string, string | number>,
  ) {
    return this.adapter.annotate(type, cfi, data, styles);
  }
  removeAnnotation(cfi: string, type: string) {
    this.adapter.removeAnnotation(cfi, type);
  }
}
