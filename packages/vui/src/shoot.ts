import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { attributeError } from "./attribute.ts";
import { UsageError } from "./errors.ts";
import { capture } from "./capture.ts";
import { launchPlaywright } from "./driver/playwright.ts";
import { loadHost } from "./host.ts";
import { writeShot } from "./output.ts";
import { listComponentExports, toModuleSource } from "./snippet.ts";
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

  const exportNames = selectExports(snippet, options);

  const server = await startServer({ host, snippet });
  try {
    const driver = await launchPlaywright(host.root);
    try {
      const viewport = options.viewport ?? { width: 1280, height: 800 };
      const colorScheme = options.dark ? "dark" : "light";
      // One page per shot, all against the same server and browser; each shot fails alone.
      const settled = await Promise.allSettled(
        exportNames.map(async (exportName): Promise<Shot> => {
          const page = await driver.open({ viewport, scale: options.scale ?? 2, colorScheme });
          try {
            await page.goto(server.pageUrl(exportName, colorScheme));
            server.releaseColdStartLock();
            const png = await capture(page, {
              viewport,
              full: options.full ?? false,
              wait: options.wait,
            });
            const { consoleErrors, warnings } = page.diagnostics();
            const pageError = await page.evaluate(
              () => (window as unknown as { __vuiError?: ShotError }).__vuiError,
            );
            return {
              ...writeShot(host.root, png),
              export: exportName,
              consoleErrors,
              warnings,
              // Vite knows the file and line; the browser only sees "failed to fetch module".
              error: attributeError(pageError, server.errors(), host.root),
            };
          } finally {
            await page.close().catch(() => {});
          }
        }),
      );
      // A run where nothing was shot is a failed run; otherwise keep the shots that worked.
      const failure = settled.find((result) => result.status === "rejected");
      if (failure && settled.every((result) => result.status === "rejected")) throw failure.reason;
      return settled.map((result, index): Shot => {
        if (result.status === "fulfilled") return result.value;
        const reason = result.reason as Error;
        return {
          path: "",
          width: 0,
          height: 0,
          export: exportNames[index]!,
          consoleErrors: [],
          warnings: [],
          error: { message: reason.message },
        };
      });
    } finally {
      await driver.close();
    }
  } finally {
    await server.close();
  }
}

/** The exports to shoot: `--all`, one named by `--export`, or the default export. */
function selectExports(snippet: string, options: ShootOptions): string[] {
  if (!options.all && options.export === undefined) return ["default"];
  const available = listComponentExports(readFileSync(snippet, "utf8"));
  if (options.all) {
    if (available.length === 0) throw new UsageError("--all found no component exports");
    return available;
  }
  const name = options.export!;
  if (!available.includes(name)) {
    throw new UsageError(
      `No component export named "${name}". Available: ${available.join(", ") || "(none)"}`,
    );
  }
  return [name];
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
