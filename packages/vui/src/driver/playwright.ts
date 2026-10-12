import type { Browser } from "playwright-core";
import { BrowserNotFound } from "../errors.ts";
import { importFromHost } from "../resolve.ts";
import type { Driver } from "./index.ts";

type Playwright = typeof import("playwright-core");

export async function launchPlaywright(hostRoot: string): Promise<Driver> {
  const mod = await importFromHost<Playwright & { default?: Playwright }>(
    "playwright-core",
    hostRoot,
  );
  const { chromium } = mod.chromium ? mod : mod.default!;

  let browser: Browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      throw new BrowserNotFound();
    }
  }

  return {
    async open({ viewport, scale, colorScheme }) {
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: scale,
        colorScheme,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      return {
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
