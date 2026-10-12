import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ReactNotFound } from "./errors.ts";

type Exports = string | { [condition: string]: Exports } | Exports[] | null;

function pickEntry(target: Exports | undefined): string | undefined {
  if (typeof target === "string") return target;
  if (Array.isArray(target)) {
    for (const t of target) {
      const found = pickEntry(t);
      if (found) return found;
    }
    return undefined;
  }
  if (target && typeof target === "object") {
    for (const condition of ["import", "node", "module-sync", "default"]) {
      const found = pickEntry(target[condition]);
      if (found) return found;
    }
  }
  return undefined;
}

function packageEntry(pkgDir: string): string | undefined {
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const exp = pkg.exports;
  const entry =
    typeof exp === "string" || Array.isArray(exp)
      ? pickEntry(exp)
      : exp && "." in exp
        ? pickEntry(exp["."])
        : exp
          ? pickEntry(exp)
          : (pkg.module ?? pkg.main ?? "index.js");
  return entry ? join(pkgDir, entry) : undefined;
}

/** Walks up from `from` looking for `node_modules/<name>`; returns its real directory. */
export function findPackageDir(name: string, from: string): string | undefined {
  let dir = from;
  for (;;) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** vui's own install location, used for bundled fallbacks. */
const ownDir = import.meta.dirname;

/**
 * Host-first resolution (ADR 0001): looks in the host's node_modules, then in vui's own.
 * Returns the package directory.
 */
export function resolvePackageDir(name: string, hostRoot: string): string | undefined {
  return findPackageDir(name, hostRoot) ?? findPackageDir(name, ownDir);
}

export async function importFromHost<T>(name: string, hostRoot: string): Promise<T> {
  const dir = resolvePackageDir(name, hostRoot);
  const entry = dir && packageEntry(dir);
  if (!entry) throw new Error(`Cannot find module "${name}" from ${hostRoot} or vui's own install`);
  return (await import(pathToFileURL(entry).href)) as T;
}

/** React is only ever taken from the host, never from vui (ADR 0001). */
export function resolveReact(hostRoot: string): { dir: string; major: number } {
  const dir = findPackageDir("react", hostRoot);
  if (!dir) throw new ReactNotFound(hostRoot);
  const { version } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  return { dir, major: Number.parseInt(version, 10) };
}
