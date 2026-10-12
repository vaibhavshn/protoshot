import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { UsageError } from "./errors.ts";
import { capture } from "./capture.ts";
import { launchPlaywright } from "./driver/playwright.ts";
import { loadHost } from "./host.ts";
import { writeShot } from "./output.ts";
import { toModuleSource } from "./snippet.ts";
import { startServer } from "./server.ts";
import type { ShootOptions, Shot, ShotError, SnippetInput } from "./types.ts";

export async function shoot(input: SnippetInput, options: ShootOptions = {}): Promise<Shot[]> {
  const cwd = options.cwd ?? process.cwd();
  const host = loadHost(cwd);
  const snippet =
    "file" in input ? resolve(cwd, input.file) : writeInlineSnippet(host.root, input.code);
  if ("file" in input && !existsSync(snippet)) {
    throw new UsageError(`Snippet file not found: ${input.file}`);
  }

  const server = await startServer({ host, snippet });
  try {
    const driver = await launchPlaywright(host.root);
    try {
      const viewport = options.viewport ?? { width: 1280, height: 800 };
      const colorScheme = options.dark ? "dark" : "light";
      const page = await driver.open({ viewport, scale: options.scale ?? 2, colorScheme });
      await page.goto(server.pageUrl("default", colorScheme));
      server.warmed();
      const png = await capture(page, {
        viewport,
        full: options.full ?? false,
        wait: options.wait,
      });
      const { consoleErrors, warnings } = page.diagnostics();
      const pageError = await page.evaluate(
        () => (window as unknown as { __vuiError?: ShotError }).__vuiError,
      );
      await page.close();
      // Vite knows the file and line; the browser only sees "failed to fetch module".
      const error = server.errors()[0] ?? pageError;
      return [{ ...writeShot(host.root, png), export: "default", consoleErrors, warnings, error }];
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
