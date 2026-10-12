import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { shoot } from "../src/index.ts";
import { fixture } from "./helpers.ts";

test("5 parallel runs on a cold cache all succeed, leaving the host's Vite cache alone", async () => {
  const host = fixture("react-vite-tailwind");
  const hostCache = join(host, "node_modules/.vite");
  mkdirSync(hostCache, { recursive: true });
  writeFileSync(join(hostCache, "sentinel"), "host dev server state");
  const before = readdirSync(hostCache).sort();
  rmSync(join(host, "node_modules/.vite-protoshot"), { recursive: true, force: true });

  const runs = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      shoot({ code: `<b className="p-${i + 1}">run ${i}</b>` }, { cwd: host, scale: 1 }),
    ),
  );

  for (const [shot] of runs) {
    expect(shot!.error).toBeUndefined();
    expect(shot!.consoleErrors).toEqual([]);
    expect(existsSync(shot!.path)).toBe(true);
  }
  expect(readdirSync(hostCache).sort()).toEqual(before);
  expect(existsSync(join(host, "node_modules/.vite-protoshot"))).toBe(true);
}, 120_000);
