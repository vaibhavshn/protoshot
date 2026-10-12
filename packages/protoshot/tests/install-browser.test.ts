import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { playwrightCliPath } from "../src/install-browser.ts";

const tempHost = () => realpathSync(mkdtempSync(join(tmpdir(), "protoshot-host-")));

test("install-browser uses the host's playwright-core before protoshot's own", () => {
  const host = tempHost();
  const pkg = join(host, "node_modules", "playwright-core");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, "package.json"), '{"name":"playwright-core"}');
  expect(playwrightCliPath(host)).toBe(join(pkg, "cli.js"));
});

test("without a host copy it falls back to protoshot's own playwright-core", () => {
  expect(playwrightCliPath(tempHost())).toMatch(/playwright-core[\\/]cli\.js$/);
});
