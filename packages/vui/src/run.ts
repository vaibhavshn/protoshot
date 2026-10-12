import { parseArgs } from "node:util";
import { VuiError } from "./errors.ts";
import { shoot } from "./shoot.ts";
import type { SnippetInput } from "./types.ts";

const USAGE = `Usage: vui <snippet-file> [options]
       vui -            read the snippet from stdin
       vui -e '<jsx>'   use the argument as the snippet
`;

/** argv → shoot() → stdout/stderr/exit code. Returns the exit code. */
export async function runCli(argv: string[]): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        help: { type: "boolean", short: "h" },
        eval: { type: "string", short: "e" },
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
    const shots = await shoot(input);
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
