import { existsSync } from "node:fs";
import { expect, test } from "vite-plus/test";
import { fixture, readPng, runCli } from "./helpers.ts";

test("--help prints usage and exits 0", async () => {
  const { code, stdout } = await runCli(["--help"]);
  expect(code).toBe(0);
  expect(stdout).toContain("Usage: protoshot");
});

test("a snippet file prints the path of its shot", async () => {
  const host = fixture("react-vite-tailwind");
  const { code, stdout } = await runCli(["Button.tsx"], { cwd: host });
  expect(code).toBe(0);
  const path = stdout.trim();
  expect(existsSync(path)).toBe(true);
  expect(readPng(path).width).toBeLessThan(1280);
});

test("`protoshot -e` renders the argument", async () => {
  const host = fixture("react-vite-tailwind");
  const { code, stdout } = await runCli(["-e", '<i className="bg-[#00ff00] p-4">x</i>'], {
    cwd: host,
  });
  expect(code).toBe(0);
  expect(readPng(stdout.trim()).pixel(42, 42)).toEqual([0, 255, 0, 255]);
});

test("`protoshot -` renders stdin", async () => {
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

test("-C runs as if started in another directory", async () => {
  const host = fixture("react-vite-tailwind");
  const { code, stdout } = await runCli(
    ["-C", "react-vite-tailwind", "-e", '<i className="bg-[#00ff00] p-4">x</i>'],
    { cwd: fixture("") },
  );
  expect(code).toBe(0);
  expect(readPng(stdout.trim()).pixel(42, 42)).toEqual([0, 255, 0, 255]);
  const file = await runCli(["--cwd", host, "Button.tsx"], { cwd: fixture("") });
  expect(file.code).toBe(0);
  expect(existsSync(file.stdout.trim())).toBe(true);
});

test("a missing --cwd directory is a usage error", async () => {
  const { code, stderr } = await runCli(["-C", "no-such-dir", "Button.tsx"]);
  expect(code).toBe(2);
  expect(stderr).toContain("--cwd");
});

test("a malformed --viewport is a usage error", async () => {
  const { code, stderr } = await runCli(["Button.tsx", "--viewport", "big"]);
  expect(code).toBe(2);
  expect(stderr).toContain("--viewport");
});

test("a non-https, non-loopback URL is a usage error", async () => {
  const { code, stderr } = await runCli(["http://example.com"]);
  expect(code).toBe(2);
  expect(stderr).toContain("https");
});

test("snippet-only flags are a usage error with a URL", async () => {
  const { code, stderr } = await runCli(["https://example.com", "--all"]);
  expect(code).toBe(2);
  expect(stderr).toContain("--all");
});
