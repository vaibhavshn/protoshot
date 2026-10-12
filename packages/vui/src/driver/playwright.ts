import type { Browser, BrowserType } from "playwright-core";
import { BrowserNotFound } from "../errors.ts";
import { importFromHost } from "../resolve.ts";
import type { Driver } from "./index.ts";

type Playwright = typeof import("playwright-core");

/** System Chrome first, then managed Chromium (`vui install-browser`); otherwise BrowserNotFound. */
export async function launchChromium(chromium: BrowserType): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    try {
      return await chromium.launch({ headless: true });
    } catch {
      throw new BrowserNotFound();
    }
  }
}

export async function launchPlaywright(hostRoot: string): Promise<Driver> {
  const mod = await importFromHost<Playwright & { default?: Playwright }>(
    "playwright-core",
    hostRoot,
  );
  const { chromium } = mod.chromium ? mod : mod.default!;

  const browser = await launchChromium(chromium);

  return {
    async open({ viewport, scale, colorScheme }) {
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: scale,
        colorScheme,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      const warnings: string[] = [];
      page.on("console", (message) => {
        const text = message.text();
        if (message.type() === "warning") warnings.push(text);
        // Chrome also logs a console error per failed load; the request listeners report those.
        else if (message.type() === "error" && !text.startsWith("Failed to load resource"))
          consoleErrors.push(text);
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      page.on("requestfailed", (request) =>
        consoleErrors.push(`Request failed: ${request.url()} (${request.failure()?.errorText})`),
      );
      page.on("response", (response) => {
        if (response.status() >= 400)
          consoleErrors.push(`Request failed: ${response.url()} (${response.status()})`);
      });
      return {
        diagnostics: () => ({ consoleErrors: [...consoleErrors], warnings: [...warnings] }),
        goto: async (url) => void (await page.goto(url)),
        waitFor: async (expression, timeout) =>
          void (await page.waitForFunction(expression, undefined, { timeout })),
        evaluate: (fn) => page.evaluate(fn),
        waitForNetworkIdle: async (capMs) => {
          await page.waitForLoadState("networkidle", { timeout: capMs }).catch(() => {});
        },
        waitForSelector: async (selector, timeout) =>
          void (await page.waitForSelector(selector, { timeout })),
        screenshot: (options) => page.screenshot({ type: "png", ...options }),
        close: () => context.close(),
      };
    },
    close: () => browser.close(),
  };
}
