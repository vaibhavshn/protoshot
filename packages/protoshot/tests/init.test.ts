import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { fixture, readPng, runCli } from "./helpers.ts";

const made: string[] = [];

/** Copies a fixture (minus protoshot.json, plus a node_modules symlink) into a scratch host. */
function scratchHost(name: string): string {
  const dir = join(fixture(".scratch"), `${name}-${process.pid}-${made.length}`);
  mkdirSync(dir, { recursive: true });
  made.push(dir);
  cpSync(fixture(name), dir, {
    recursive: true,
    filter: (src) => !/node_modules|protoshot\.json$/.test(src),
  });
  symlinkSync(join(fixture(name), "node_modules"), join(dir, "node_modules"));
  return dir;
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("`protoshot init` in react-plain writes a config that renders with no edits", async () => {
  const host = scratchHost("react-plain");
  const init = await runCli(["init"], { cwd: host });
  expect(init.code).toBe(0);
  expect(JSON.parse(readFileSync(join(host, "protoshot.json"), "utf8"))).toEqual({
    css: ["src/styles.css"],
  });
  const shot = await runCli(["-e", '<div className="card" />'], { cwd: host });
  expect(shot.code).toBe(0);
  expect(readPng(shot.stdout.trim()).pixel(52, 52)).toEqual([0, 0, 255, 255]);
});

test('`protoshot init` finds the file containing @import "tailwindcss"', async () => {
  const host = scratchHost("react-vite-tailwind");
  await runCli(["init"], { cwd: host });
  expect(JSON.parse(readFileSync(join(host, "protoshot.json"), "utf8")).css).toEqual([
    "src/index.css",
  ]);
});

test("`protoshot init` keeps an existing protoshot.json", async () => {
  const host = scratchHost("react-plain");
  writeFileSync(join(host, "protoshot.json"), '{"css":["src/other.css"]}');
  const { code } = await runCli(["init"], { cwd: host });
  expect(code).toBe(0);
  expect(readFileSync(join(host, "protoshot.json"), "utf8")).toBe('{"css":["src/other.css"]}');
});

test("`protoshot init` adds .protoshot/ to .gitignore once", async () => {
  const host = scratchHost("react-plain");
  writeFileSync(join(host, ".gitignore"), "node_modules");
  await runCli(["init"], { cwd: host });
  await runCli(["init"], { cwd: host });
  expect(readFileSync(join(host, ".gitignore"), "utf8")).toBe("node_modules\n.protoshot/\n");
});

test("`protoshot init` adds the agent section to existing AGENTS.md and CLAUDE.md, once", async () => {
  const host = scratchHost("react-plain");
  writeFileSync(join(host, "AGENTS.md"), "# Agents\n");
  writeFileSync(join(host, "CLAUDE.md"), "# Claude\n");
  await runCli(["init"], { cwd: host });
  await runCli(["init"], { cwd: host });
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    const text = readFileSync(join(host, name), "utf8");
    expect(text.split("Previewing UI with protoshot")).toHaveLength(2);
    for (const word of ["<<'EOF'", "--json", "--all", "--dark"]) expect(text).toContain(word);
  }
});

test("`protoshot init` creates AGENTS.md when no agent doc exists", async () => {
  const host = scratchHost("react-plain");
  await runCli(["init"], { cwd: host });
  expect(existsSync(join(host, "AGENTS.md"))).toBe(true);
  expect(existsSync(join(host, "CLAUDE.md"))).toBe(false);
});
