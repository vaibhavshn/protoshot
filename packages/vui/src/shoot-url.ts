import { capture } from "./capture.ts";
import { launchPlaywright } from "./driver/playwright.ts";
import { NavigationError, UsageError } from "./errors.ts";
import { findHostRoot } from "./host.ts";
import { pruneShots, shotsDir, writeShot } from "./output.ts";
import type { ShootOptions, Shot } from "./types.ts";
import { assertPageUrl, labelPageMessage, navigationProblem } from "./url.ts";

/** Options that only mean something for a rendered snippet. */
const SNIPPET_ONLY = ["export", "all", "css", "components"] as const;

/**
 * Shoots a live page as it is (ADR 0004). No host project is needed: the browser is resolved
 * host-first from `cwd` but falls back to vui's own install.
 */
export async function shootUrl(url: string, options: ShootOptions = {}): Promise<Shot[]> {
  for (const key of SNIPPET_ONLY) {
    if (options[key] !== undefined && options[key] !== false) {
      throw new UsageError(`--${key} only applies to snippets, not to a page URL`);
    }
  }
  assertPageUrl(url);

  const outDir = shotsDir(undefined, options.outDir);
  if (!options.outDir && !process.env.VUI_OUT_DIR) pruneShots(outDir);

  const driver = await launchPlaywright(findHostRoot(options.cwd ?? process.cwd()));
  try {
    const viewport = options.viewport ?? { width: 1280, height: 800 };
    let blocked: string | undefined;
    const page = await driver.open({
      viewport,
      scale: options.scale ?? 2,
      colorScheme: options.dark ? "dark" : "light",
      blockNavigation: (target) => {
        const problem = navigationProblem(target);
        if (problem) blocked ??= problem;
        return problem !== undefined;
      },
    });
    try {
      let response;
      try {
        response = await page.goto(url);
      } catch (error) {
        // A blocked redirect surfaces as ERR_BLOCKED_BY_CLIENT; the reason is more useful.
        throw new NavigationError(blocked ?? firstLine((error as Error).message));
      }
      const png = await capture(page, {
        viewport,
        full: options.full ?? false,
        wait: options.wait,
        page: true,
      });
      const { consoleErrors, warnings } = page.diagnostics();
      const failed = response !== null && response.status >= 400 ? response : undefined;
      return [
        {
          ...writeShot(outDir, png),
          export: "default",
          consoleErrors: consoleErrors.map(labelPageMessage),
          warnings: warnings.map(labelPageMessage),
          error: failed
            ? { message: `HTTP ${failed.status} ${failed.statusText}`.trim() }
            : undefined,
        },
      ];
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    await driver.close();
  }
}

function firstLine(message: string): string {
  return message.split("\n")[0]!.replace(/^page\.goto: /, "");
}
