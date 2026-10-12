import type { PageHandle } from "./driver/index.ts";

const MOUNT_TIMEOUT_MS = 30_000;

/** Waits for the snippet to mount, then takes the screenshot. */
export async function capture(page: PageHandle): Promise<Uint8Array> {
  await page.waitFor("window.__vuiMounted === true", MOUNT_TIMEOUT_MS);
  return page.screenshot();
}
