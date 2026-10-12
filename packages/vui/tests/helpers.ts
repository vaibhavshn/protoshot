import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

export const repoRoot = join(import.meta.dirname, "..");
export const fixture = (name: string) => join(repoRoot, "tests/fixtures", name);
const cliPath = join(repoRoot, "dist/cli.mjs");

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the built vui binary. */
export function runCli(
  args: string[],
  opts: { cwd?: string; stdin?: string; env?: Record<string, string> } = {},
): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [cliPath, ...args],
      { cwd: opts.cwd, timeout: 300_000, env: { ...process.env, ...opts.env } },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolve({ code, stdout, stderr });
      },
    );
    child.stdin?.end(opts.stdin ?? "");
  });
}

export interface Png {
  width: number;
  height: number;
  /** [r, g, b, a] at pixel (x, y). */
  pixel(x: number, y: number): [number, number, number, number];
}

/** Minimal 8-bit RGB/RGBA PNG decoder, enough to inspect Chrome screenshots. */
export function readPng(path: string): Png {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= channels ? out[y * stride + i - channels]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0;
      const c = i >= channels && y > 0 ? out[(y - 1) * stride + i - channels]! : 0;
      let v: number;
      if (filter === 0) v = x;
      else if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[y * stride + i] = v & 0xff;
    }
  }
  return {
    width,
    height,
    pixel(x, y) {
      const o = y * stride + x * channels;
      return [out[o]!, out[o + 1]!, out[o + 2]!, channels === 4 ? out[o + 3]! : 255];
    },
  };
}
