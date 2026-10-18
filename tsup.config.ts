import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    reader: "src/reader/index.ts",
    native: "src/native/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: "dist/esm",
  // treeshake: dead-code-eliminate at build; splitting: keep dynamic imports
  // (the lazy exportPdf wrapper) as separate chunks so pdf-lib is only
  // downloaded by consumers that actually export PDFs.
  treeshake: true,
  splitting: true,
  external: [
    "react",
    "react-dom",
    "pdfjs-dist",
    "react-native",
    "react-native-webview",
  ],
  esbuildOptions(options) {
    options.jsx = "transform";
  },
  onSuccess: async () => {
    const srcStyleDir = "src/style";
    const destStyleDir = "dist/esm/style";

    mkdirSync(destStyleDir, { recursive: true });

    const files = readdirSync(srcStyleDir);
    for (const file of files) {
      if (file.endsWith(".css")) {
        copyFileSync(join(srcStyleDir, file), join(destStyleDir, file));
      }
    }

    copyFileSync(
      "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
      "dist/esm/pdf.worker.min.mjs",
    );

    console.log("✓ CSS files and PDF.js worker copied to dist/esm");
  },
});
