import { existsSync } from "node:fs";
import { expect, test } from "vite-plus/test";
import { fixture, readPng, runCli } from "./helpers.ts";

test("--help prints usage and exits 0", async () => {
  const { code, stdout } = await runCli(["--help"]);
  expect(code).toBe(0);
  expect(stdout).toContain("Usage: vui");
});

test("a snippet file prints the path of its shot", async () => {
  const host = fixture("react-vite-tailwind");
  const { code, stdout } = await runCli(["Button.tsx"], { cwd: host });
  expect(code).toBe(0);
  const path = stdout.trim();
  expect(existsSync(path)).toBe(true);
  expect(readPng(path).width).toBeLessThan(1280);
});

test("`vui -e` renders the argument", async () => {
  const host = fixture("react-vite-tailwind");
  const { code, stdout } = await runCli(["-e", '<i className="bg-[#00ff00] p-4">x</i>'], {
    cwd: host,
  });
  expect(code).toBe(0);
  expect(readPng(stdout.trim()).pixel(42, 42)).toEqual([0, 255, 0, 255]);
});

test("`vui -` renders stdin", async () => {
  const host = fixture("react-vite-tailwind");
  const { code, stdout } = await runCli(["-"], {
    cwd: host,
    stdin: '<i className="bg-[#00ff00] p-4">x</i>',
  });
  expect(code).toBe(0);
  expect(readPng(stdout.trim()).pixel(42, 42)).toEqual([0, 255, 0, 255]);
});

test("--viewport, --scale and --full control the shot", async () => {
  const host = fixture("react-vite-tailwind");
  const { code, stdout } = await runCli(
    ["Button.tsx", "--full", "--viewport", "600x400", "--scale", "1"],
    { cwd: host },
  );
  expect(code).toBe(0);
  const png = readPng(stdout.trim());
  expect([png.width, png.height]).toEqual([600, 400]);
});

test("--dark renders in dark mode", async () => {
  const host = fixture("react-vite-tailwind");
  const { stdout } = await runCli(["Themed.tsx", "--dark"], { cwd: host });
  expect(readPng(stdout.trim()).pixel(52, 52)).toEqual([0, 0, 0, 255]);
});

test("a malformed --viewport is a usage error", async () => {
  const { code, stderr } = await runCli(["Button.tsx", "--viewport", "big"]);
  expect(code).toBe(2);
  expect(stderr).toContain("--viewport");
});
