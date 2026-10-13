import { parseArgs } from "node:util";
import { UsageError, ProtoshotError } from "./errors.ts";
import { installBrowser } from "./install-browser.ts";
import { openFile } from "./open.ts";
import { runInit } from "./init.ts";
import { shoot } from "./shoot.ts";
import type { Shot, SnippetInput } from "./types.ts";
import { isPageUrl } from "./url.ts";

const USAGE = `Usage: protoshot <snippet-file> [options]
       protoshot <url>        shoot a live page: https://..., or http://localhost / 127.0.0.1 only
       protoshot -            read the snippet from stdin
       protoshot -e '<jsx>'   use the argument as the snippet
       protoshot install-browser   install managed Chromium (when no system Chrome)
       protoshot init         add the protoshot section to AGENTS.md/CLAUDE.md
       protoshot init --config   also write protoshot.json (CSS and component folders are
                        usually auto-detected on every run, so this is optional)

Options:
  --viewport WxH   viewport size (default 1280x800)
  --scale N        device scale factor (default 2)
  --full           capture the whole page, uncropped, instead of cropping to the content
  --export NAME    shoot one component export ("default" for the default export)
  --all            shoot every component export
  --dark           render in dark mode
  --wait MS|SEL    extra wait: milliseconds, or a selector to wait for
  --out DIR        write shots to DIR (default: $PROTOSHOT_OUT_DIR, else the OS temp dir)
  --open           open each shot in the default viewer once written (off by default)
  --json           print one compact JSON object per shot, one per line
  --css FILE       stylesheet to load (repeatable or comma-separated); replaces protoshot.json/auto-detection
  --components DIR component folder whose exports need no import (repeatable or comma-separated);
                   replaces protoshot.json/auto-detection
`;

/** argv → shoot() → stdout/stderr/exit code. Returns the exit code. */
export async function runCli(argv: string[]): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        help: { type: "boolean", short: "h" },
        config: { type: "boolean" },
        eval: { type: "string", short: "e" },
        viewport: { type: "string" },
        scale: { type: "string" },
        full: { type: "boolean" },
        dark: { type: "boolean" },
        export: { type: "string" },
        all: { type: "boolean" },
        wait: { type: "string" },
        out: { type: "string" },
        json: { type: "boolean" },
        open: { type: "boolean" },
        css: { type: "string", multiple: true },
        components: { type: "string", multiple: true },
      },
      allowPositionals: true,
    });
    if (values.help) {
      process.stdout.write(USAGE);
      return 0;
    }
    const [target] = positionals;
    if (target === "install-browser") return await installBrowser(process.cwd());
    if (target === "init" && values.eval === undefined) {
      const report = runInit(process.cwd(), Boolean(values.config));
      process.stdout.write(`${report.join("\n")}\n`);
      return 0;
    }
    let input: SnippetInput;
    if (values.eval !== undefined) input = { code: values.eval };
    else if (target === "-") input = { code: await readStdin() };
    else if (target && isPageUrl(target)) input = { url: target };
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
      export: values.export,
      all: values.all,
      wait: values.wait,
      outDir: values.out,
      css: splitList(values.css),
      components: splitList(values.components),
    });
    for (const shot of shots) process.stderr.write(describeProblems(shot));
    if (values.json) for (const shot of shots) process.stdout.write(`${JSON.stringify(shot)}\n`);
    else for (const shot of shots) if (shot.path) process.stdout.write(`${shot.path}\n`);
    if (values.open) {
      for (const shot of shots) {
        const problem = shot.path ? await openFile(shot.path) : undefined;
        if (problem) process.stderr.write(`warning: ${problem}\n`);
      }
    }
    // A third-party page's console noise is not the agent's mistake (ADR 0004).
    const consoleFails = !("url" in input);
    return shots.some((shot) => shot.error || (consoleFails && shot.consoleErrors.length > 0))
      ? 1
      : 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return error instanceof ProtoshotError ? error.exitCode : 2;
  }
}

/** Human-readable details for one shot, for stderr. Empty when the shot is clean. */
function describeProblems(shot: Shot): string {
  const lines: string[] = [];
  const { error } = shot;
  if (error) {
    const where = error.file
      ? ` (${error.file}${error.line ? `:${error.line}${error.column ? `:${error.column}` : ""}` : ""})`
      : "";
    lines.push(`error: ${tidy(error.message)}${where}`);
    if (error.frame) lines.push(tidy(error.frame));
  }
  for (const message of shot.consoleErrors) {
    if (!error || !repeats(error.message, message)) lines.push(`console.error: ${tidy(message)}`);
  }
  for (const message of shot.warnings) lines.push(`console.warn: ${tidy(message)}`);
  return lines.length ? `${lines.join("\n")}\n` : "";
}

/** Drops blank lines, which only waste space in a terminal or an agent's context. */
function tidy(text: string): string {
  return text.replace(/\n\s*\n+/g, "\n").trim();
}

/**
 * Whether console output just repeats a shot's error. The browser logs a render error with leading
 * `%o`/`%s` format placeholders, so compare on its first line that has real text.
 */
function repeats(errorMessage: string, consoleMessage: string): boolean {
  const key = consoleMessage
    .split("\n")
    .map((line) => line.replace(/%[osdifOcj]/g, "").trim())
    .find(Boolean);
  return key !== undefined && errorMessage.includes(key);
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

function splitList(values: string[] | undefined) {
  if (!values) return undefined;
  return values.flatMap((value) => value.split(",")).filter(Boolean);
}
