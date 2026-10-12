import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ConfigError } from "./errors.ts";

export interface HostConfig {
  css: string[];
  /** Component roots: directories whose components are in scope in every snippet. */
  components?: string[];
  wrapper?: string;
  darkClass?: string;
  alias?: Record<string, string>;
}

export interface Host {
  root: string;
  config: HostConfig;
}

/** Nearest ancestor with `vui.json`, else nearest with `package.json`, else `cwd`. */
export function findHostRoot(cwd: string): string {
  const start = resolve(cwd);
  for (const marker of ["vui.json", "package.json"]) {
    for (let dir = start; ; dir = dirname(dir)) {
      if (existsSync(join(dir, marker))) return dir;
      if (dirname(dir) === dir) break;
    }
  }
  return start;
}

function fail(file: string, message: string): never {
  throw new ConfigError(`${file}: ${message}`);
}

export function parseHostConfig(file: string, text: string): HostConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    fail(file, `invalid JSON (${(error as Error).message})`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    fail(file, "expected an object");
  const obj = raw as Record<string, unknown>;
  const known = ["css", "components", "wrapper", "darkClass", "alias"];
  for (const key of Object.keys(obj)) {
    if (!known.includes(key))
      fail(file, `unknown key "${key}" (expected one of ${known.join(", ")})`);
  }
  const css = obj.css ?? [];
  if (!Array.isArray(css) || css.some((c) => typeof c !== "string"))
    fail(file, '"css" must be an array of strings');
  const components = obj.components ?? [];
  if (!Array.isArray(components) || components.some((c) => typeof c !== "string"))
    fail(file, '"components" must be an array of strings');
  for (const key of ["wrapper", "darkClass"] as const) {
    if (obj[key] !== undefined && typeof obj[key] !== "string")
      fail(file, `"${key}" must be a string`);
  }
  const alias = obj.alias;
  if (
    alias !== undefined &&
    (typeof alias !== "object" ||
      alias === null ||
      Object.values(alias).some((v) => typeof v !== "string"))
  ) {
    fail(file, '"alias" must be an object of strings');
  }
  return {
    css: css as string[],
    components: components as string[],
    wrapper: obj.wrapper as string | undefined,
    darkClass: obj.darkClass as string | undefined,
    alias: alias as Record<string, string> | undefined,
  };
}

export function loadHost(cwd: string): Host {
  const root = findHostRoot(cwd);
  const file = join(root, "vui.json");
  const config = existsSync(file) ? parseHostConfig(file, readFileSync(file, "utf8")) : { css: [] };
  return { root, config };
}
