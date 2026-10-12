import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { UsageError, VuiError } from "./errors.ts";
import { runInit } from "./init.ts";
import { shoot } from "./shoot.ts";
import type { Shot, SnippetInput } from "./types.ts";

const USAGE = `Usage: vui <snippet-file> [options]
       vui -            read the snippet from stdin
       vui -e '<jsx>'   use the argument as the snippet
       vui install-browser   install managed Chromium (when no system Chrome)
       vui init         write vui.json, update .gitignore and AGENTS.md/CLAUDE.md

Options:
  --viewport WxH   viewport size (default 1280x800)
  --scale N        device scale factor (default 2)
  --full           capture the whole viewport instead of cropping to the content
  --dark           render in dark mode
  --wait MS|SEL    extra wait: milliseconds, or a selector to wait for
  --json           print one JSON object per shot on stdout
`;

/** argv → shoot() → stdout/stderr/exit code. Returns the exit code. */
export async function runCli(argv: string[]): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        help: { type: "boolean", short: "h" },
        eval: { type: "string", short: "e" },
        viewport: { type: "string" },
        scale: { type: "string" },
        full: { type: "boolean" },
        dark: { type: "boolean" },
        wait: { type: "string" },
        json: { type: "boolean" },
      },
      allowPositionals: true,
    });
    if (values.help) {
      process.stdout.write(USAGE);
      return 0;
    }
    const [target] = positionals;
    if (target === "install-browser") return await installBrowser();
    if (target === "init" && values.eval === undefined) {
      const report = await runInit(process.cwd(), Boolean(process.stdin.isTTY));
      process.stdout.write(`${report.join("\n")}\n`);
      return 0;
    }
    let input: SnippetInput;
    if (values.eval !== undefined) input = { code: values.eval };
    else if (target === "-") input = { code: await readStdin() };
    else if (target) input = { file: target };
    else {
      process.stderr.write(USAGE);
      return 2;
    }
    const shots = await shoot(input, {
      viewport: parseViewport(values.viewport),
      scale: parseScale(values.scale),
      full: values.full,
      dark: values.dark,
      wait: values.wait,
    });
    for (const shot of shots) process.stderr.write(describeProblems(shot));
    if (values.json) process.stdout.write(`${JSON.stringify(shots, null, 2)}\n`);
    else for (const shot of shots) process.stdout.write(`${shot.path}\n`);
    return shots.some((shot) => shot.error || shot.consoleErrors.length > 0) ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return error instanceof VuiError ? error.exitCode : 2;
  }
}

/** Installs managed Chromium using vui's own playwright-core. */
async function installBrowser(): Promise<number> {
  const pkg = createRequire(import.meta.url).resolve("playwright-core/package.json");
  const cli = join(dirname(pkg), "cli.js");
  const child = spawn(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" });
  return await new Promise((resolve) => {
    child.on("error", () => resolve(3));
    child.on("close", (code) => resolve(code === 0 ? 0 : 3));
  });
}

/** Human-readable details for one shot, for stderr. Empty when the shot is clean. */
function describeProblems(shot: Shot): string {
  const lines: string[] = [];
  const { error } = shot;
  if (error) {
    const where = error.file
      ? ` (${error.file}${error.line ? `:${error.line}${error.column ? `:${error.column}` : ""}` : ""})`
      : "";
    lines.push(`error: ${error.message}${where}`);
    if (error.frame) lines.push(error.frame);
  }
  for (const message of shot.consoleErrors) lines.push(`console.error: ${message}`);
  for (const message of shot.warnings) lines.push(`console.warn: ${message}`);
  return lines.length ? `${lines.join("\n")}\n` : "";
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function parseViewport(value: string | undefined) {
  if (value === undefined) return undefined;
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match)
    throw new UsageError(`--viewport expects WIDTHxHEIGHT, e.g. 1280x800 (got "${value}")`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function parseScale(value: string | undefined) {
  if (value === undefined) return undefined;
  const scale = Number(value);
  if (!(scale > 0)) throw new UsageError(`--scale expects a positive number (got "${value}")`);
  return scale;
}
