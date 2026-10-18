import React, { createContext, useContext } from "react";
import type { DocumentAdapter, DocumentHighlight } from "./types";

export interface DocumentHighlighterContextValue<A extends DocumentAdapter = DocumentAdapter> {
  adapter: A | null;
  highlights: DocumentHighlight[];
  scrollToHighlight: (highlight: DocumentHighlight) => void;
  setTip: (content: React.ReactNode) => void;
  clearTip: () => void;
}

export const DocumentHighlighterContext = createContext<DocumentHighlighterContextValue | null>(null);

export function useDocumentHighlighterContext<A extends DocumentAdapter = DocumentAdapter>(): DocumentHighlighterContextValue<A> {
  const ctx = useContext(DocumentHighlighterContext);
  if (!ctx) {
    throw new Error("useDocumentHighlighterContext must be used within a DocumentHighlighter");
  }
  return ctx as DocumentHighlighterContextValue<A>;
}
