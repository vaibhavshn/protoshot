import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface LockOptions {
  /** How often to retry while another run holds the lock (default 100ms). */
  pollMs?: number;
  /** Give up waiting after this long (default 120s). */
  timeoutMs?: number;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** An empty or garbled file is a lock mid-write, so it counts as live. */
function ownerIsDead(file: string): boolean {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  const pid = Number.parseInt(text, 10);
  return Number.isInteger(pid) && pid > 0 && !isAlive(pid);
}

/**
 * Takes an exclusive file lock (`O_EXCL` create holding our pid). Waits while a live process
 * holds it; removes it when its owner is gone. Returns the release function.
 */
export async function acquireLock(file: string, options: LockOptions = {}): Promise<() => void> {
  const { pollMs = 100, timeoutMs = 120_000 } = options;
  const deadline = Date.now() + timeoutMs;
  mkdirSync(dirname(file), { recursive: true });
  for (;;) {
    try {
      writeFileSync(file, String(process.pid), { flag: "wx" });
      let released = false;
      return () => {
        if (released) return;
        released = true;
        rmSync(file, { force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (ownerIsDead(file)) {
      rmSync(file, { force: true });
      continue;
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for lock ${file}`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
