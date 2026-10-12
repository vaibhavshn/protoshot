import { parseArgs } from "node:util";
import { VuiError } from "./errors.ts";
import { shoot } from "./shoot.ts";
import type { SnippetInput } from "./types.ts";

const USAGE = `Usage: vui <snippet-file> [options]
       vui -            read the snippet from stdin
       vui -e '<jsx>'   use the argument as the snippet

Options:
  --viewport WxH   viewport size (default 1280x800)
  --scale N        device scale factor (default 2)
  --full           capture the whole viewport instead of cropping to the content
  --dark           render in dark mode
  --wait MS|SEL    extra wait: milliseconds, or a selector to wait for
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
      },
      allowPositionals: true,
    });
    if (values.help) {
      process.stdout.write(USAGE);
      return 0;
    }
    const [target] = positionals;
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
    for (const shot of shots) process.stdout.write(`${shot.path}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return error instanceof VuiError ? error.exitCode : 2;
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

class UsageError extends VuiError {
  constructor(message: string) {
    super(message, 2);
  }
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
