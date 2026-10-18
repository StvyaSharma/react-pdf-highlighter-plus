import React from "react";
import App from "./App";
import ReactDOM from "react-dom/client";
import { EpubDemo } from "./EpubDemo";

// Use StrictMode for debugging
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get("format") === "epub" ? (
      <EpubDemo />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
