import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { launchChromium } from "../src/driver/playwright.ts";
import { BrowserNotFound } from "../src/errors.ts";
import { runCli } from "./helpers.ts";

test("with neither system Chrome nor managed Chromium, launching exits 3 naming the fix", async () => {
  const none = {
    launch: async () => {
      throw new Error("Executable doesn't exist");
    },
  };
  const error = await launchChromium(none as never).catch((e) => e);
  expect(error).toBeInstanceOf(BrowserNotFound);
  expect(error.exitCode).toBe(3);
  expect(error.message).toBe("No Chrome found. Run: protoshot install-browser");
});

test("a launch failure that is not a missing browser surfaces as-is", async () => {
  const crashing = {
    launch: async () => {
      throw new Error("Target page, context or browser has been closed: sandbox failure");
    },
  };
  const error = await launchChromium(crashing as never).catch((e) => e);
  expect(error).not.toBeInstanceOf(BrowserNotFound);
  expect(error.message).toContain("sandbox failure");
});

test("a missing system Chrome falls back to managed Chromium", async () => {
  const browser = {};
  const channels: unknown[] = [];
  const chromium = {
    launch: async (options: { channel?: string }) => {
      channels.push(options.channel);
      if (options.channel) throw new Error("Chromium distribution 'chrome' is not found at /x");
      return browser;
    },
  };
  expect(await launchChromium(chromium as never)).toBe(browser);
  expect(channels).toEqual(["chrome", undefined]);
});

test("`protoshot install-browser` installs Chromium", async () => {
  const dir = mkdtempSync(join(tmpdir(), "protoshot-browsers-"));
  const { code } = await runCli(["install-browser"], { env: { PLAYWRIGHT_BROWSERS_PATH: dir } });
  expect(code).toBe(0);
  expect(readdirSync(dir).some((name) => name.startsWith("chromium"))).toBe(true);
}, 300_000);
