import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite-plus";

/** Inlines `?raw` imports (the renderer's source is served to the browser as-is). */
const rawImports = {
  name: "vui:raw-imports",
  resolveId(id: string, importer?: string) {
    if (!id.endsWith("?raw") || !importer) return null;
    return resolve(dirname(importer), id);
  },
  load(this: { addWatchFile(file: string): void }, id: string) {
    if (!id.endsWith("?raw")) return null;
    const file = id.slice(0, -"?raw".length);
    this.addWatchFile(file);
    return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
  },
};

export default defineConfig({
  plugins: [rawImports],
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    entry: ["src/index.ts", "src/cli.ts"],
    plugins: [rawImports],
    deps: {
      // tsdown <0.23 compatibility: resolve external dependency subpaths.
      // Remove to preserve subpath imports as written (the new default).
      // https://tsdown.dev/options/dependencies#deps-resolvedepsubpath
      resolveDepSubpath: true,
    },
    dts: {
      generator: "tsgo",
    },
    exports: true,
  },
  test: {
    // Vitest blanks every CSS module by default, including `freeze.css?raw`.
    css: { include: [/freeze\.css/] },
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    exclude: ["**/node_modules/**", "tests/fixtures/**"],
  },
  lint: {
    ignorePatterns: ["tests/fixtures/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ["tests/fixtures/**"],
  },
});
