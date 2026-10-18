import type { ReaderError, ReaderEvent } from "./types";
export const READER_PROTOCOL = "epub-reader/1";
export type BridgeMethod =
  | "open"
  | "close"
  | "configure"
  | "next"
  | "prev"
  | "display"
  | "search"
  | "getOutline"
  | "getLocation"
  | "captureSelection"
  | "clearSelection"
  | "annotate"
  | "removeAnnotation";
export interface BridgeRequest {
  protocol: typeof READER_PROTOCOL;
  type: "request";
  bootId: string;
  session: string;
  id: string;
  method: BridgeMethod;
  args: unknown[];
}
export type BridgeMessage =
  | { protocol: typeof READER_PROTOCOL; type: "ready"; bootId: string }
  | {
      protocol: typeof READER_PROTOCOL;
      type: "response";
      bootId: string;
      session: string;
      id: string;
      result?: unknown;
      error?: ReaderError;
    }
  | {
      protocol: typeof READER_PROTOCOL;
      type: "event";
      bootId: string;
      session: string;
      event: ReaderEvent;
    };
export function parseMessage(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).protocol === READER_PROTOCOL
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
export function readyBootId(raw: string): string | null {
  const value = parseMessage(raw);
  return value?.type === "ready" && typeof value.bootId === "string"
    ? value.bootId
    : null;
}
const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const n =
      (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    parts.push(
      alphabet[(n >>> 18) & 63] +
        alphabet[(n >>> 12) & 63] +
        (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : "=") +
        (i + 2 < bytes.length ? alphabet[n & 63] : "="),
    );
  }
  return parts.join("");
}
