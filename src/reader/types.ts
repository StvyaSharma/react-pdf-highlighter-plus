import type { DocumentHighlight, DocumentPosition } from "../core/document";

export type ReaderSource = string | ArrayBuffer | Record<string, unknown>;
export type ReaderStyles = {
  fontSize?: number | string;
  fontFamily?: string;
  lineHeight?: number | string;
  color?: string;
  background?: string;
};
export type ReaderFeatures = {
  highlight?: boolean;
  navigation?: boolean;
  search?: boolean;
  outline?: boolean;
};
export interface ReaderConfiguration {
  highlights?: DocumentHighlight[];
  styles?: ReaderStyles;
  customCss?: string;
  features?: ReaderFeatures;
}
export interface ReaderLocation {
  cfi?: string;
  page?: number;
  percentage?: number;
}
export interface ReaderSelection {
  format: "epub";
  position: DocumentPosition;
  content?: { text?: string };
}
export interface ReaderSearchResult {
  cfi?: string;
  excerpt?: string;
  href?: string;
}
export interface ReaderOutlineItem {
  id: string;
  href: string;
  label: string;
  subitems?: ReaderOutlineItem[];
}
export type ReaderErrorCode =
  | "LOAD_FAILED"
  | "RENDER_FAILED"
  | "COMMAND_FAILED"
  | "NOT_READY"
  | "BRIDGE_TIMEOUT"
  | "DISCONNECTED";
export interface ReaderError {
  code: ReaderErrorCode;
  message: string;
  retryable: boolean;
  operation?: string;
}
export interface ReaderState {
  status: "idle" | "loading" | "ready" | "error" | "disposed";
  error: ReaderError | null;
  location: ReaderLocation | null;
}
export type ReaderEvent =
  | { type: "selection"; selection: ReaderSelection }
  | { type: "location"; location: ReaderLocation };
export type MaybePromise<T> = T | Promise<T>;

/** No React, DOM nodes, or function-valued selections cross this interface. */
export interface ReaderEngine {
  open(source: ReaderSource): Promise<void>;
  close(): void;
  configure(configuration: ReaderConfiguration): MaybePromise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  display(target?: string | number): Promise<void>;
  search(query: string): Promise<ReaderSearchResult[]>;
  getOutline(): Promise<ReaderOutlineItem[]>;
  getLocation(): Promise<ReaderLocation | null>;
  captureSelection(): MaybePromise<boolean>;
  clearSelection(): MaybePromise<void>;
  annotate(
    type: string,
    cfi: string,
    data?: Record<string, unknown>,
    styles?: Record<string, string | number>,
  ): MaybePromise<string>;
  removeAnnotation(cfi: string, type: string): MaybePromise<void>;
  subscribe(listener: (event: ReaderEvent) => void): () => void;
}
