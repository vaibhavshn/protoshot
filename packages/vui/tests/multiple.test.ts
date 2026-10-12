import { expect, test } from "vite-plus/test";
import { fixture, parseShots, readPng, runCli } from "./helpers.ts";

const host = fixture("react-vite-tailwind");

test("--all shoots every component export, one path per line", async () => {
  const { code, stdout } = await runCli(["States.tsx", "--all", "--scale", "1"], { cwd: host });
  expect(code).toBe(0);
  const paths = stdout.trim().split("\n");
  expect(paths).toHaveLength(3);
  expect(paths.map((p) => readPng(p).pixel(37, 37))).toEqual([
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 0, 0, 255],
  ]);
});

test("--all --json prints one object per line with the export of each shot", async () => {
  const { stdout } = await runCli(["States.tsx", "--all", "--json"], { cwd: host });
  const shots = parseShots<{ export: string }>(stdout);
  expect(shots.map((s) => s.export)).toEqual(["default", "Loading", "Empty"]);
});

test("--export shoots one export; an unknown name is a usage error", async () => {
  const one = await runCli(["States.tsx", "--export", "Loading", "--scale", "1"], { cwd: host });
  expect(one.code).toBe(0);
  expect(one.stdout.trim().split("\n")).toHaveLength(1);
  expect(readPng(one.stdout.trim()).pixel(37, 37)).toEqual([0, 0, 255, 255]);

  const bad = await runCli(["States.tsx", "--export", "Nope"], { cwd: host });
  expect(bad.code).toBe(2);
  expect(bad.stderr).toContain("Nope");
  expect(bad.stderr).toContain("Loading");
});

test("diagnostics and the exit code are per shot", async () => {
  const code = `export default () => <div>ok</div>;
export const Broken = () => { console.error("only here"); return <div />; };`;
  const { code: exit, stdout } = await runCli(["-e", code, "--all", "--json"], { cwd: host });
  expect(exit).toBe(1);
  const shots = parseShots<{ export: string; consoleErrors: string[] }>(stdout);
  expect(shots.map((s) => [s.export, s.consoleErrors.length])).toEqual([
    ["default", 0],
    ["Broken", 1],
  ]);
});

test("three shots take under 1.5x the time of one", async () => {
  await runCli(["States.tsx"], { cwd: host }); // warm the dependency cache
  const time = async (args: string[]) => {
    const start = performance.now();
    await runCli(["States.tsx", ...args], { cwd: host });
    return performance.now() - start;
  };
  const one = await time([]);
  const three = await time(["--all"]);
  expect(three).toBeLessThan(one * 1.5);
}, 120_000);
