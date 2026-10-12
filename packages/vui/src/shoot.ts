import { isAbsolute, resolve } from "node:path";
import { capture } from "./capture.ts";
import { launchPlaywright } from "./driver/playwright.ts";
import { loadHost } from "./host.ts";
import { writeShot } from "./output.ts";
import { startServer } from "./server.ts";
import type { ShootOptions, Shot, SnippetInput } from "./types.ts";

export async function shoot(input: SnippetInput, options: ShootOptions = {}): Promise<Shot[]> {
  const cwd = options.cwd ?? process.cwd();
  const host = loadHost(cwd);
  const snippet = isAbsolute(input.file) ? input.file : resolve(cwd, input.file);

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
