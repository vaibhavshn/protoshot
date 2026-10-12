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

export interface Crop {
  /** The part of the page to screenshot; always inside the page. */
  clip: Rect;
  /** Padding that falls outside the page (CSS px), to be added around the clip. */
  pad: { top: number; right: number; bottom: number; left: number };
}

/**
 * One axis of the crop. Padding is wanted on both sides of the content; where it would reach past
 * the page the clip stops at the edge and the rest is returned as `before`/`after`, for the shot to
 * synthesize. Content that already runs past an edge is cut there, not padded.
 */
function fit(min: number, max: number, size: number, padding: number) {
  const cutBefore = min < 0;
  const cutAfter = max > size;
  const start = cutBefore ? 0 : Math.max(0, min - padding);
  const end = cutAfter ? size : Math.min(size, max + padding);
  return {
    start,
    end,
    before: cutBefore ? 0 : start - (min - padding),
    after: cutAfter ? 0 : max + padding - end,
  };
}

/**
 * The shot for `rects`: the union, padded equally on every side, so the content sits centred
 * whatever the host's body margin is. `page` is the extent of the page; null when there is nothing
 * to crop to.
 */
export function computeCrop(rects: Rect[], page: Viewport, padding = CROP_PADDING): Crop | null {
  if (rects.length === 0) return null;
  const x = fit(
    Math.min(...rects.map((r) => r.x)),
    Math.max(...rects.map((r) => r.x + r.width)),
    page.width,
    padding,
  );
  const y = fit(
    Math.min(...rects.map((r) => r.y)),
    Math.max(...rects.map((r) => r.y + r.height)),
    page.height,
    padding,
  );
  if (x.end <= x.start || y.end <= y.start) return null;
  const height = Math.min(y.end - y.start, MAX_CROP_HEIGHT);
  const capped = height < y.end - y.start;
  return {
    clip: { x: x.start, y: y.start, width: x.end - x.start, height },
    pad: { top: y.before, right: x.after, bottom: capped ? 0 : y.after, left: x.before },
  };
}

interface PageInfo {
  rects: Rect[];
  /** Height of the whole document, which can exceed the viewport. */
  height: number;
  /** The colour the page canvas paints, for the padding that falls outside it. */
  background: string;
}

/** Runs in the page: rects of everything visible under <body> except the mount point, and more. */
function inspectPage(): PageInfo {
  const rects: Rect[] = [];
  const root = document.getElementById("root");
  for (const el of document.body.querySelectorAll("*")) {
    if (el === root) continue;
    const { display, visibility } = getComputedStyle(el);
    if (display === "none" || display === "contents" || visibility === "hidden") continue;
    const { x, y, width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) rects.push({ x, y, width, height });
  }
  // <html>'s background paints the canvas, else <body>'s, else the browser's own (which follows
  // `color-scheme`): resolve that last one through the `Canvas` system color.
  const probe = document.createElement("div");
  probe.style.backgroundColor = "Canvas";
  document.body.append(probe);
  const fallback = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const transparent = (color: string) => color === "rgba(0, 0, 0, 0)" || color === "transparent";
  const html = getComputedStyle(document.documentElement).backgroundColor;
  const body = getComputedStyle(document.body).backgroundColor;
  return {
    rects,
    height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    background: !transparent(html) ? html : !transparent(body) ? body : fallback,
  };
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
  const info = await page.evaluate(inspectPage);
  const { viewport } = options;
  const crop = computeCrop(info.rects, {
    width: viewport.width,
    height: Math.max(viewport.height, info.height),
  });
  if (!crop) return page.screenshot();
  const { pad } = crop;
  const padded = pad.top + pad.right + pad.bottom + pad.left > 0;
  // fullPage lets the clip extend below the viewport.
  return page.screenshot({
    clip: crop.clip,
    fullPage: true,
    pad: padded ? { ...pad, color: info.background } : undefined,
  });
}
