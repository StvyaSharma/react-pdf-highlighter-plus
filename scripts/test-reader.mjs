import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const temporary = await mkdtemp(join(tmpdir(), "epub-reader-tests-"));
try {
  const output = join(temporary, "reader.test.mjs");
  await build({
    entryPoints: ["tests/reader.test.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    outfile: output,
  });
  const result = spawnSync(process.execPath, ["--test", output], {
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
