import React from "react";
import type { ReaderState } from "../reader/types";

/** Default web presentation; the controller itself never renders an error. */
export function EpubReaderStatus({
  state,
  retry,
}: {
  state: ReaderState;
  retry: () => void;
}) {
  if (!state.error) return null;
  return (
    <div
      role="alert"
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        right: 8,
        padding: 12,
        background: "white",
        color: "#b91c1c",
        zIndex: 50,
      }}
    >
      Unable to open EPUB: {state.error.message}{" "}
      {state.error.retryable ? <button onClick={retry}>Retry</button> : null}
    </div>
  );
}
