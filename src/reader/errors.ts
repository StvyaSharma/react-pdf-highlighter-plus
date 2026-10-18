import type { ReaderError, ReaderErrorCode } from "./types";

export class ReaderFailure extends Error {
  constructor(readonly detail: ReaderError) {
    super(detail.message);
    this.name = "ReaderFailure";
  }
}

export function readerError(
  error: unknown,
  code: ReaderErrorCode,
  operation?: string,
): ReaderError {
  if (error instanceof ReaderFailure) return error.detail;
  return {
    code,
    message: error instanceof Error ? error.message : String(error),
    retryable: code !== "NOT_READY",
    ...(operation ? { operation } : {}),
  };
}
