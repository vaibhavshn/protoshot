import { spawn } from "node:child_process";
import { join } from "node:path";
import { findHostRoot } from "./host.ts";
import { resolvePackageDir } from "./resolve.ts";

/** Path of the `playwright-core` CLI the launcher will use: host first, then vui's own (ADR 0001). */
export function playwrightCliPath(hostRoot: string): string | undefined {
  const dir = resolvePackageDir("playwright-core", hostRoot);
  return dir && join(dir, "cli.js");
}

/** Installs managed Chromium with the same playwright-core the launcher resolves, so revisions match. */
export async function installBrowser(cwd: string): Promise<number> {
  const cli = playwrightCliPath(findHostRoot(cwd));
  if (!cli) {
    process.stderr.write("Could not find playwright-core in the host project or vui's install.\n");
    return 3;
  }
  const child = spawn(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" });
  return await new Promise((resolve) => {
    child.on("error", () => resolve(3));
    child.on("close", (code) => resolve(code === 0 ? 0 : 3));
  });
}
