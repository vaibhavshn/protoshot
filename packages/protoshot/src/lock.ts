import { randomBytes } from "node:crypto";
import {
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export interface LockOptions {
  /** How often to retry while another run holds the lock (default 100ms). */
  pollMs?: number;
  /** Give up waiting after this long (default 120s). */
  timeoutMs?: number;
}

/** An empty lock file is a writer between create and write; after this long it was a crash. */
const EMPTY_GRACE_MS = 2000;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** True when the lock file's content shows no live owner (dead pid, or empty and old). */
function isStale(file: string): boolean {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  if (text === "") {
    try {
      return Date.now() - statSync(file).mtimeMs > EMPTY_GRACE_MS;
    } catch {
      return false;
    }
  }
  const pid = Number.parseInt(text, 10);
  return Number.isInteger(pid) && pid > 0 && !isAlive(pid);
}

/**
 * Removes a stale lock without racing other recoverers: the file is renamed away first (atomic,
 * so only one of them wins), then checked. If what was moved turns out to be a live lock that
 * replaced the stale one in between, it is put back.
 */
function removeStale(file: string): void {
  if (!isStale(file)) return;
  const moved = `${file}.stale-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    renameSync(file, moved);
  } catch {
    return;
  }
  if (isStale(moved)) {
    rmSync(moved, { force: true });
    return;
  }
  try {
    linkSync(moved, file); // no-overwrite restore
  } catch {
    // Someone else already took the lock; theirs stands.
  }
  rmSync(moved, { force: true });
}

/**
 * Takes an exclusive file lock (`O_EXCL` create holding our pid). Waits while a live process
 * holds it; removes it when its owner is gone. Returns the release function, which only
 * removes the lock while it is still ours.
 */
export async function acquireLock(file: string, options: LockOptions = {}): Promise<() => void> {
  const { pollMs = 100, timeoutMs = 120_000 } = options;
  const deadline = Date.now() + timeoutMs;
  const token = `${process.pid}:${randomBytes(6).toString("hex")}`;
  mkdirSync(dirname(file), { recursive: true });
  for (;;) {
    try {
      writeFileSync(file, token, { flag: "wx" });
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try {
          if (readFileSync(file, "utf8") === token) rmSync(file, { force: true });
        } catch {
          // Already gone.
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    removeStale(file);
    if (Date.now() > deadline) throw new Error(`Timed out waiting for lock ${file}`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
