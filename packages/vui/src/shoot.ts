import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { capture } from "./capture.ts";
import { launchPlaywright } from "./driver/playwright.ts";
import { loadHost } from "./host.ts";
import { writeShot } from "./output.ts";
import { toModuleSource } from "./snippet.ts";
import { startServer } from "./server.ts";
import type { ShootOptions, Shot, SnippetInput } from "./types.ts";

export async function shoot(input: SnippetInput, options: ShootOptions = {}): Promise<Shot[]> {
  const cwd = options.cwd ?? process.cwd();
  const host = loadHost(cwd);
  const snippet =
    "file" in input ? resolve(cwd, input.file) : writeInlineSnippet(host.root, input.code);

  const server = await startServer({ host, snippet });
  try {
    const driver = await launchPlaywright(host.root);
    try {
      const page = await driver.open({
        viewport: { width: 1280, height: 800 },
        scale: 1,
        colorScheme: "light",
      });
      await page.goto(server.pageUrl("default", "light"));
      const png = await capture(page);
      await page.close();
      return [{ ...writeShot(host.root, png), export: "default" }];
    } finally {
      await driver.close();
    }
  } finally {
    await server.close();
  }
}

/**
 * Inline snippets live on disk under `.vui/snippets` so they resolve `./` and `@/` imports
 * against the host and are visible to the host's CSS tooling.
 */
function writeInlineSnippet(hostRoot: string, code: string): string {
  const dir = join(hostRoot, ".vui", "snippets");
  mkdirSync(dir, { recursive: true });
  const hash = createHash("sha1").update(code).digest("hex").slice(0, 10);
  const file = join(dir, `${hash}.tsx`);
  writeFileSync(file, toModuleSource(code));
  return file;
}
