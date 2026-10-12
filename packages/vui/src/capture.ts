import type { PageHandle, Rect, Viewport } from "./driver/index.ts";

const MOUNT_TIMEOUT_MS = 30_000;
const NETWORK_IDLE_CAP_MS = 3_000;
const WAIT_SELECTOR_TIMEOUT_MS = 10_000;
const CROP_PADDING = 16;
/** Safety cap for runaway layouts (e.g. an element sized from its own height). */
const MAX_CROP_HEIGHT = 10_000;

export interface CaptureOptions {
  viewport: Viewport;
  /** Capture the whole page, uncropped, instead of cropping to the content. */
  full: boolean;
  /** Extra wait: milliseconds, or a CSS selector to wait for. */
  wait?: string;
}

/**
 * Union of `rects`, padded; null when there is nothing to crop to. Clamped to the viewport width,
 * but not its height: content that runs past the bottom is still captured, up to a cap.
 */
export function computeCrop(
  rects: Rect[],
  viewport: Viewport,
  padding = CROP_PADDING,
): Rect | null {
  if (rects.length === 0) return null;
  const x0 = Math.max(0, Math.min(...rects.map((r) => r.x)) - padding);
  const y0 = Math.max(0, Math.min(...rects.map((r) => r.y)) - padding);
  const x1 = Math.min(viewport.width, Math.max(...rects.map((r) => r.x + r.width)) + padding);
  const y1 = Math.max(...rects.map((r) => r.y + r.height)) + padding;
  return { x: x0, y: y0, width: x1 - x0, height: Math.min(y1 - y0, MAX_CROP_HEIGHT) };
}

/** Bounding rects of everything visible under <body>, except the mount point and body itself. */
function visibleRects(): Rect[] {
  const rects: Rect[] = [];
  const root = document.getElementById("root");
  for (const el of document.body.querySelectorAll("*")) {
    if (el === root) continue;
    const { display, visibility } = getComputedStyle(el);
    if (display === "none" || display === "contents" || visibility === "hidden") continue;
    const { x, y, width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) rects.push({ x, y, width, height });
  }
  return rects;
}

/** Waits until the render has settled, then takes the screenshot. */
export async function capture(page: PageHandle, options: CaptureOptions): Promise<Uint8Array> {
  await page.waitFor("window.__vuiDone === true", MOUNT_TIMEOUT_MS);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForNetworkIdle(NETWORK_IDLE_CAP_MS);
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  if (options.wait !== undefined) {
    if (/^\d+$/.test(options.wait)) {
      await new Promise((done) => setTimeout(done, Number(options.wait)));
    } else {
      await page.waitForSelector(options.wait, WAIT_SELECTOR_TIMEOUT_MS);
    }
  }
  if (options.full) return page.screenshot({ fullPage: true });
  const crop = computeCrop(await page.evaluate(visibleRects), options.viewport);
  // fullPage lets the clip extend below the viewport.
  return page.screenshot(crop ? { clip: crop, fullPage: true } : undefined);
}
