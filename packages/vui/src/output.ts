import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface WrittenShot {
  path: string;
  width: number;
  height: number;
}

/** Shots in the default directory older than this are deleted at the start of each run. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Where shots go: `outDir`, else `$VUI_OUT_DIR`, else `<os tmpdir>/vui/<hash of host root>`.
 * Shots are throwaway, so the default is outside the host repo, namespaced per host.
 */
export function shotsDir(hostRoot: string, outDir?: string): string {
  const explicit = outDir ?? process.env.VUI_OUT_DIR;
  if (explicit) return explicit;
  const hash = createHash("sha1").update(hostRoot).digest("hex").slice(0, 10);
  return join(tmpdir(), "vui", hash);
}

/** Deletes old PNGs from the default shots directory. Never touches a user-chosen directory. */
export function pruneShots(dir: string, now = Date.now()): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.endsWith(".png")) continue;
    const file = join(dir, name);
    try {
      if (now - statSync(file).mtimeMs > MAX_AGE_MS) rmSync(file, { force: true });
    } catch {
      // Another run got there first.
    }
  }
}

/** Writes the PNG to `<dir>/<timestamp>-<hash>.png`, creating `dir` if needed. */
export function writeShot(dir: string, png: Uint8Array): WrittenShot {
  mkdirSync(dir, { recursive: true });
  const hash = createHash("sha1").update(png).digest("hex").slice(0, 8);
  const path = join(dir, `${Date.now()}-${hash}.png`);
  writeFileSync(path, png);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  // IHDR width and height sit right after the 8-byte signature and the chunk header.
  return { path, width: view.getUint32(16), height: view.getUint32(20) };
}
