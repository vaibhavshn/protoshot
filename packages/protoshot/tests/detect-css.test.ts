import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vite-plus/test";
import { detectCss } from "../src/init.ts";

function host(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "protoshot-detect-")));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

test("CSS imported through a tsconfig alias is detected", () => {
  const root = host({
    "tsconfig.json": '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
    "src/main.tsx": 'import "@/styles/app.css";',
    "src/styles/app.css": "body{}",
  });
  expect(detectCss(root)).toEqual(["src/styles/app.css"]);
});

test("CSS imported from a package is detected", () => {
  const root = host({
    "src/main.tsx": 'import "ui-kit/dist/kit.css";',
    "node_modules/ui-kit/package.json": '{"name":"ui-kit"}',
    "node_modules/ui-kit/dist/kit.css": "body{}",
  });
  expect(detectCss(root)).toEqual(["node_modules/ui-kit/dist/kit.css"]);
});

test("a Tailwind file is still found when the entry only imports other CSS", () => {
  const root = host({
    "src/main.tsx": 'import "./fonts.css";',
    "src/fonts.css": "body{}",
    "src/theme/tw.css": '@import "tailwindcss";',
  });
  expect(detectCss(root)).toEqual(["src/fonts.css", "src/theme/tw.css"]);
});

test("the fallback walk does not descend past its depth bound", () => {
  const root = host({ "a/b/c/d/e/f/g/h/deep.css": '@import "tailwindcss";' });
  expect(detectCss(root)).toEqual([]);
});

test("main-named stylesheets load first, then the rest alphabetically", () => {
  const root = host({
    "src/main.tsx":
      'import "./a.css"; import "./styles.css"; import "./index.css"; import "./b.css";',
    "src/a.css": "body{}",
    "src/b.css": "body{}",
    "src/index.css": "body{}",
    "src/styles.css": "body{}",
  });
  expect(detectCss(root)).toEqual(["src/index.css", "src/styles.css", "src/a.css", "src/b.css"]);
});

test("without entry imports, the best main-named stylesheet is used", () => {
  const root = host({
    "src/main.tsx": "export {};",
    "src/other.css": "body{}",
    "src/styles.css": "body{}",
    "src/global.css": "body{}",
  });
  expect(detectCss(root)).toEqual(["src/global.css"]);
});
