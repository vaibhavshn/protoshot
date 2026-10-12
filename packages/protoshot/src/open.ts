import { spawn } from "node:child_process";

/** The command that opens a file in the OS's default viewer. */
export function openCommand(
  file: string,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  if (platform === "darwin") return { command: "open", args: [file] };
  // `start` treats a first quoted argument as a window title, hence the empty one.
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", '""', file] };
  return { command: "xdg-open", args: [file] };
}

/**
 * Opens `file` in the default viewer without waiting for it. Resolves to an error message when the
 * viewer could not be started, never rejects: opening is a convenience and must not fail a run.
 */
export function openFile(file: string): Promise<string | undefined> {
  const { command, args } = openCommand(file);
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.once("error", (error) => resolve(`could not open ${file}: ${error.message}`));
    child.once("spawn", () => {
      child.unref();
      resolve(undefined);
    });
  });
}
