import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface WrittenShot {
  path: string;
  width: number;
  height: number;
}

/** Writes the PNG to `<hostRoot>/.vui/shots/<timestamp>-<hash>.png`. */
export function writeShot(hostRoot: string, png: Uint8Array): WrittenShot {
  const dir = join(hostRoot, ".vui", "shots");
  mkdirSync(dir, { recursive: true });
  const hash = createHash("sha1").update(png).digest("hex").slice(0, 8);
  const path = join(dir, `${Date.now()}-${hash}.png`);
  writeFileSync(path, png);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  // IHDR width and height sit right after the 8-byte signature and the chunk header.
  return { path, width: view.getUint32(16), height: view.getUint32(20) };
}
