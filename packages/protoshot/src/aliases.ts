import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { Host } from "./host.ts";

export interface Alias {
  find: RegExp | string;
  replacement: string;
}

/** Strips comments and trailing commas so tsconfig.json (JSONC) can go through JSON.parse. */
export function parseJsonc(text: string): unknown {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2) + 1;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Aliases from tsconfig `compilerOptions.paths` (first target of each pattern). */
function tsconfigAliases(root: string): Alias[] {
  const file = join(root, "tsconfig.json");
  if (!existsSync(file)) return [];
  const { compilerOptions } = parseJsonc(readFileSync(file, "utf8")) as {
    compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
  };
  const paths = compilerOptions?.paths;
  if (!paths) return [];
  const base = resolve(root, compilerOptions?.baseUrl ?? ".");
  const aliases: Alias[] = [];
  for (const [pattern, targets] of Object.entries(paths)) {
    const target = targets[0];
    if (!target) continue;
    if (pattern.endsWith("/*") && target.endsWith("/*")) {
      aliases.push({
        find: new RegExp(`^${escape(pattern.slice(0, -2))}/(.*)$`),
        replacement: `${resolve(base, target.slice(0, -2))}/$1`,
      });
    } else if (!pattern.includes("*")) {
      aliases.push({
        find: new RegExp(`^${escape(pattern)}$`),
        replacement: resolve(base, target),
      });
    }
  }
  return aliases;
}

/** `protoshot.json` aliases win over tsconfig paths. Targets are relative to the host root. */
export function buildAliases(host: Host, useTsconfig: boolean): Alias[] {
  const fromConfig = Object.entries(host.config.alias ?? {}).map(([find, target]) => ({
    find: new RegExp(`^${escape(find)}(?=/|$)`),
    replacement: isAbsolute(target) ? target : resolve(host.root, target),
  }));
  return [...fromConfig, ...(useTsconfig ? tsconfigAliases(host.root) : [])];
}
