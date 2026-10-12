import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { shoot } from "../src/index.ts";
import { fixture, runCli } from "./helpers.ts";

const host = fixture("react-vite-tailwind");

test("a bad import exits 1 and names the import and the snippet", async () => {
  const code = 'import x from "./does-not-exist";\nexport default () => <div>{x}</div>;';
  const { code: exit, stderr, stdout } = await runCli(["-e", code], { cwd: host });
  expect(exit).toBe(1);
  expect(stderr).toContain("./does-not-exist");
  expect(stderr).toMatch(/\.vui\/snippets\/\w+\.tsx/);
  // A shot (showing the error) still exists.
  expect(existsSync(stdout.trim())).toBe(true);
});

test("a throwing component exits 1, reports the message, and still produces a shot", async () => {
  const code = 'export default () => { throw new Error("kaboom"); };';
  const { code: exit, stderr, stdout } = await runCli(["-e", code], { cwd: host });
  expect(exit).toBe(1);
  expect(stderr).toContain("kaboom");
  expect(existsSync(stdout.trim())).toBe(true);
});

test("a console.error exits 1 but a console.warn does not", async () => {
  const error = await runCli(
    ["-e", 'export default () => { console.error("bad thing"); return <div />; };'],
    {
      cwd: host,
    },
  );
  expect(error.code).toBe(1);
  expect(error.stderr).toContain("bad thing");

  const warn = await runCli(
    ["-e", 'export default () => { console.warn("careful"); return <div />; };'],
    {
      cwd: host,
    },
  );
  expect(warn.code).toBe(0);
});

test("--json prints one object per shot, details still go to stderr", async () => {
  const { code, stdout, stderr } = await runCli(
    [
      "-e",
      'export default () => { console.warn("careful"); console.error("bad thing"); return <div className="p-4">x</div>; };',
      "--json",
    ],
    { cwd: host },
  );
  expect(code).toBe(1);
  const shots = JSON.parse(stdout);
  expect(shots).toHaveLength(1);
  expect(shots[0]).toMatchObject({
    export: "default",
    consoleErrors: ["bad thing"],
    warnings: ["careful"],
  });
  expect(typeof shots[0].path).toBe("string");
  expect(shots[0].width).toBeGreaterThan(0);
  expect(shots[0].height).toBeGreaterThan(0);
  expect(stderr).toContain("bad thing");
});

test("a syntax error is reported with file, line, column and a code frame", async () => {
  const [shot] = await shoot({ code: "export default () => <div>;" }, { cwd: host });
  expect(shot!.error).toMatchObject({ line: 1 });
  expect(shot!.error!.file).toMatch(/\.vui\/snippets\/\w+\.tsx$/);
  expect(shot!.error!.column).toBeGreaterThan(0);
  expect(shot!.error!.frame).toBeTruthy();
});

test("a clean snippet has no error and empty diagnostics", async () => {
  const [shot] = await shoot({ code: '<p className="p-4">fine</p>' }, { cwd: host });
  expect(shot).toMatchObject({ consoleErrors: [], warnings: [] });
  expect(shot!.error).toBeUndefined();
});

test("a missing snippet file is a usage error (exit 2)", async () => {
  const { code, stderr } = await runCli(["nope.tsx"], { cwd: host });
  expect(code).toBe(2);
  expect(stderr).toContain("nope.tsx");
});

test("an invalid vui.json is a config error (exit 2)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vui-badcfg-"));
  writeFileSync(join(dir, "vui.json"), "{ nope");
  const { code, stderr } = await runCli(["-e", "<div />"], { cwd: dir });
  expect(code).toBe(2);
  expect(stderr).toContain("vui.json");
});

test("a host without React is an environment error (exit 3)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vui-noreact-"));
  writeFileSync(join(dir, "package.json"), "{}");
  const { code, stderr } = await runCli(["-e", "<div />"], { cwd: dir });
  expect(code).toBe(3);
  expect(stderr).toContain("react");
});
