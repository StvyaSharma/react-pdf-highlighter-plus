import type {
  ReaderConfiguration,
  ReaderEngine,
  ReaderEvent,
  ReaderSource,
  ReaderState,
  ReaderSelection,
  ReaderLocation,
} from "./types";
import { ReaderFailure, readerError } from "./errors";

/** Owns document state and policy; rendering and presentation are injected. */
export class ReaderController {
  private engine: ReaderEngine | null = null;
  private unsubscribeEngine?: () => void;
  private revision = 0;
  private ready = false;
  private configuration: ReaderConfiguration = {};
  private source?: ReaderSource;
  private state: ReaderState = { status: "idle", error: null, location: null };
  private listeners = new Set<() => void>();
  private selectionListeners = new Set<(selection: ReaderSelection) => void>();

  constructor(private createEngine: () => ReaderEngine) {}
  getState = (): ReaderState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  onSelection(listener: (selection: ReaderSelection) => void): () => void {
    this.selectionListeners.add(listener);
    return () => {
      this.selectionListeners.delete(listener);
    };
  }
  private publish(state: ReaderState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private disconnect(): void {
    this.ready = false;
    this.unsubscribeEngine?.();
    this.unsubscribeEngine = undefined;
    const engine = this.engine;
    this.engine = null;
    engine?.close();
  }
  private event = (event: ReaderEvent): void => {
    if (event.type === "location")
      this.publish({ ...this.state, location: event.location });
    else if (this.configuration.features?.highlight !== false)
      this.selectionListeners.forEach((listener) => listener(event.selection));
  };

  async load(source: ReaderSource): Promise<void> {
    const revision = ++this.revision;
    this.disconnect();
    this.source = source;
    this.publish({ status: "loading", error: null, location: null });
    try {
      const engine = this.createEngine();
      this.engine = engine;
      this.unsubscribeEngine = engine.subscribe((event) => {
        if (this.engine === engine) this.event(event);
      });
      await engine.open(source);
      if (revision !== this.revision) return;
      // Prop changes during open are applied before readiness is published.
      let configuration: ReaderConfiguration;
      do {
        configuration = this.configuration;
        await engine.configure(configuration);
      } while (
        revision === this.revision &&
        configuration !== this.configuration
      );
      if (revision !== this.revision) return;
      this.ready = true;
      const location = await engine.getLocation();
      if (revision !== this.revision) return;
      this.publish({ status: "ready", error: null, location });
    } catch (error) {
      if (revision !== this.revision) return;
      this.disconnect();
      this.publish({
        status: "error",
        error: readerError(error, "LOAD_FAILED", "load"),
        location: null,
      });
    }
  }

  async retry(): Promise<void> {
    if (this.source !== undefined) await this.load(this.source);
  }
  /** Replace the configuration. Browser engines apply this synchronously. */
  configure(configuration: ReaderConfiguration): Promise<void> {
    this.configuration = configuration;
    if (!this.ready || !this.engine) return Promise.resolve();
    return this.command("configure", (engine) =>
      engine.configure(configuration),
    );
  }
  private async command<T>(
    operation: string,
    run: (engine: ReaderEngine) => T | Promise<T>,
  ): Promise<T> {
    const engine = this.engine;
    if (!engine || !this.ready)
      throw new ReaderFailure({
        code: "NOT_READY",
        message: "The reader is not ready",
        retryable: false,
        operation,
      });
    try {
      const result = await run(engine);
      if (this.engine !== engine)
        throw new ReaderFailure({
          code: "DISCONNECTED",
          message: "The document was replaced",
          retryable: true,
          operation,
        });
      if (this.state.error)
        this.publish({ ...this.state, status: "ready", error: null });
      return result;
    } catch (error) {
      const detail = readerError(error, "COMMAND_FAILED", operation);
      if (this.engine === engine)
        this.publish({ ...this.state, status: "error", error: detail });
      throw new ReaderFailure(detail);
    }
  }
  async next(): Promise<void> {
    if (this.configuration.features?.navigation !== false)
      await this.command("next", (e) => e.next());
  }
  async prev(): Promise<void> {
    if (this.configuration.features?.navigation !== false)
      await this.command("prev", (e) => e.prev());
  }
  async display(target?: string | number): Promise<void> {
    if (this.configuration.features?.navigation !== false)
      await this.command("display", (e) => e.display(target));
  }
  async search(query: string) {
    return this.configuration.features?.search === false
      ? []
      : this.command("search", (e) => e.search(query));
  }
  async getOutline() {
    return this.configuration.features?.outline === false
      ? []
      : this.command("getOutline", (e) => e.getOutline());
  }
  async getLocation(): Promise<ReaderLocation | null> {
    return this.command("getLocation", (e) => e.getLocation());
  }
  async captureSelection(): Promise<boolean> {
    return this.configuration.features?.highlight === false
      ? false
      : this.command("captureSelection", (engine) => engine.captureSelection());
  }
  async clearSelection(): Promise<void> {
    await this.command("clearSelection", (e) => e.clearSelection());
  }
  async annotate(
    type: string,
    cfi: string,
    data?: Record<string, unknown>,
    styles?: Record<string, string | number>,
  ): Promise<string> {
    return this.configuration.features?.highlight === false
      ? ""
      : this.command("annotate", (e) => e.annotate(type, cfi, data, styles));
  }
  async removeAnnotation(cfi: string, type: string): Promise<void> {
    await this.command("removeAnnotation", (e) =>
      e.removeAnnotation(cfi, type),
    );
  }
  dispose(): void {
    ++this.revision;
    this.disconnect();
    this.publish({ status: "disposed", error: null, location: null });
    this.listeners.clear();
    this.selectionListeners.clear();
  }
}
