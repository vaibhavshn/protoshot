import type { Browser, BrowserContext, BrowserType, Page } from "playwright-core";
import { BrowserNotFound } from "../errors.ts";
import { importFromHost } from "../resolve.ts";
import type { Driver } from "./index.ts";

type Playwright = typeof import("playwright-core");

/** Playwright's "browser is not there" launch errors, as opposed to a browser that failed to start. */
const MISSING_BROWSER =
  /Executable doesn't exist|distribution '[^']*' is not found|browser has not been found|Please run the following command to download/i;

/**
 * System Chrome first, then managed Chromium (`vui install-browser`). Only a missing browser is
 * reported as BrowserNotFound; any other launch failure surfaces as-is.
 */
export async function launchChromium(chromium: BrowserType): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch (error) {
    if (!MISSING_BROWSER.test((error as Error).message)) throw error;
  }
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (MISSING_BROWSER.test((error as Error).message)) throw new BrowserNotFound();
    throw error;
  }
}

/**
 * Pauses document requests over CDP so `blockNavigation` sees every hop of a redirect chain, which
 * `page.route` does not (it only sees the first request). Documents in child frames pass through.
 */
async function guardNavigation(
  context: BrowserContext,
  page: Page,
  blockNavigation: (url: string) => boolean,
): Promise<void> {
  const session = await context.newCDPSession(page);
  const { frameTree } = await session.send("Page.getFrameTree");
  const mainFrameId = frameTree.frame.id;
  session.on("Fetch.requestPaused", (event) => {
    const blocked = event.frameId === mainFrameId && blockNavigation(event.request.url);
    const done = blocked
      ? session.send("Fetch.failRequest", {
          requestId: event.requestId,
          errorReason: "BlockedByClient",
        })
      : session.send("Fetch.continueRequest", { requestId: event.requestId });
    done.catch(() => {});
  });
  await session.send("Fetch.enable", {
    patterns: [{ resourceType: "Document", requestStage: "Request" }],
  });
}

export async function launchPlaywright(hostRoot: string): Promise<Driver> {
  const mod = await importFromHost<Playwright & { default?: Playwright }>(
    "playwright-core",
    hostRoot,
  );
  const { chromium } = mod.chromium ? mod : mod.default!;

  const browser = await launchChromium(chromium);

  return {
    async open({ viewport, scale, colorScheme, blockNavigation }) {
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: scale,
        colorScheme,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      if (blockNavigation) await guardNavigation(context, page, blockNavigation);
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
        goto: async (url) => {
          const response = await page.goto(url);
          return response && { status: response.status(), statusText: response.statusText() };
        },
        waitFor: async (expression, timeout) =>
          void (await page.waitForFunction(expression, undefined, { timeout })),
        evaluate: (fn) => page.evaluate(fn),
        waitForNetworkIdle: async (capMs) => {
          await page.waitForLoadState("networkidle", { timeout: capMs }).catch(() => {});
        },
        waitForSelector: async (selector, timeout) =>
          void (await page.waitForSelector(selector, { timeout })),
        screenshot: async ({ pad, ...options } = {}) => {
          const shot = await page.screenshot({ type: "png", ...options });
          if (!pad) return shot;
          // Composite on a canvas in the page, which is already done rendering.
          const padded = await page.evaluate(
            async ({ base64, pad, scale }) => {
              const image = new Image();
              image.src = `data:image/png;base64,${base64}`;
              await image.decode();
              const [top, right, bottom, left] = [pad.top, pad.right, pad.bottom, pad.left].map(
                (side) => Math.round(side * scale),
              );
              const canvas = document.createElement("canvas");
              canvas.width = left + image.width + right;
              canvas.height = top + image.height + bottom;
              const context = canvas.getContext("2d")!;
              context.fillStyle = pad.color;
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(image, left, top);
              return canvas.toDataURL("image/png").split(",")[1]!;
            },
            { base64: shot.toString("base64"), pad, scale },
          );
          return Buffer.from(padded, "base64");
        },
        close: () => context.close(),
      };
    },
    close: () => browser.close(),
  };
}
