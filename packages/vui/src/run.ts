import { parseArgs } from "node:util";
import { VuiError } from "./errors.ts";
import { shoot } from "./shoot.ts";

const USAGE = `Usage: vui <snippet-file> [options]
       vui -            read the snippet from stdin
       vui -e '<jsx>'   use the argument as the snippet
`;

/** argv → shoot() → stdout/stderr/exit code. Returns the exit code. */
export async function runCli(argv: string[]): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: { help: { type: "boolean", short: "h" } },
      allowPositionals: true,
    });
    if (values.help) {
      process.stdout.write(USAGE);
      return 0;
    }
    const [file] = positionals;
    if (!file) {
      process.stderr.write(USAGE);
      return 2;
    }
    const shots = await shoot({ file });
    for (const shot of shots) process.stdout.write(`${shot.path}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return error instanceof VuiError ? error.exitCode : 2;
  }
}
