import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, test } from "vite-plus/test";
import { fixture, parseShots, readPng, repoRoot, type Png } from "./helpers.ts";

// Packs the package and installs the tarball into a throwaway global prefix,
// so the tests run the binary exactly as a user would after `npm i -g`.
let vui: string;

beforeAll(() => {
  const work = mkdtempSync(join(tmpdir(), "vui-pack-"));
  execFileSync("vp", ["pack"], { cwd: repoRoot, stdio: "ignore" });
  const packed = execFileSync("pnpm", ["pack", "--pack-destination", work], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const tarball = packed
    .split("\n")
    .find((line) => line.trim().endsWith(".tgz"))!
    .trim();
  const prefix = join(work, "prefix");
  execFileSync("npm", ["install", "-g", "--prefix", prefix, tarball], { stdio: "ignore" });
  vui = join(prefix, "bin/vui");
}, 300_000);

function shootGlobally(args: string[], cwd: string) {
  const stdout = execFileSync(vui, [...args, "--json"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return parseShots<{ path: string; consoleErrors: string[]; warnings: string[] }>(stdout);
}

// Just inside the content: the crop is symmetric, so its centre can land on text.
const contentPixel = (png: Png) => png.pixel(42, 42);

test("the installed tarball renders a Tailwind host through the host's Vite", () => {
  const [shot] = shootGlobally(["Button.tsx"], fixture("react-vite-tailwind"));
  expect(shot!.consoleErrors).toEqual([]);
  expect(shot!.warnings).toEqual([]);
  expect(contentPixel(readPng(shot!.path))).toEqual([0, 255, 0, 255]);
});

test("the installed tarball falls back to its own Vite for a host without one, with a single React", () => {
  const [shot] = shootGlobally(["src/Card.tsx", "--all"], fixture("react-plain"));
  // A duplicate React would break the Wrapper's context (red box) or warn.
  expect(shot!.consoleErrors).toEqual([]);
  expect(shot!.warnings).toEqual([]);
  expect(contentPixel(readPng(shot!.path))).toEqual([0, 0, 255, 255]);
});

test("the installed tarball renders from a monorepo package directory", () => {
  const cwd = join(fixture("monorepo"), "packages/app");
  const [shot] = shootGlobally(["src/Hello.tsx"], cwd);
  expect(shot!.consoleErrors).toEqual([]);
  expect(contentPixel(readPng(shot!.path))).toEqual([0, 0, 255, 255]);
});
