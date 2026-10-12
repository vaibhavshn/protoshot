import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { buildAliases } from "./aliases.ts";
import { findPackageDir } from "./resolve.ts";

const ENTRY_DIRS = ["src", "app", "src/app", "pages", "src/pages"];
const ENTRY_NAMES = ["main", "index", "layout", "_app"];
const SOURCE_EXT = [".tsx", ".ts", ".jsx", ".js", ".mjs"];
const STYLE_EXT = /\.(css|scss|sass|less)$/;
const IMPORT_RE = /(?:import\s+|import\s*\(\s*)["']([^"']+)["']/g;
const TAILWIND_RE = /@tailwind\b|@import\s+["']tailwindcss/;
const SKIP_DIRS = new Set(["node_modules", ".git", ".vui", "dist", "build", ".next"]);

const COMPONENT_DIRS = ["src/components", "components", "app/components", "src/ui"];

const MAX_WALK_DEPTH = 6;
const MAX_WALK_FILES = 5000;
const MAX_CSS_BYTES = 1_000_000;

/** CSS files under `dir`, breadth-bounded so a huge repo cannot stall `vui init`. */
function walkCss(root: string): string[] {
  const out: string[] = [];
  let seen = 0;
  const visit = (dir: string, depth: number) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (++seen > MAX_WALK_FILES) return;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && depth < MAX_WALK_DEPTH)
          visit(join(dir, entry.name), depth + 1);
      } else if (entry.name.endsWith(".css")) out.push(join(dir, entry.name));
    }
  };
  visit(root, 0);
  return out;
}

function hasTailwind(file: string): boolean {
  try {
    return statSync(file).size <= MAX_CSS_BYTES && TAILWIND_RE.test(readFileSync(file, "utf8"));
  } catch {
    return false;
  }
}

/** Resolves a stylesheet import from `entry`: relative, tsconfig/alias, or package CSS. */
function resolveStyleImport(root: string, entry: string, spec: string): string | undefined {
  let candidate: string | undefined;
  if (spec.startsWith(".")) candidate = resolve(dirname(entry), spec);
  else {
    for (const { find, replacement } of buildAliases(
      { root, config: { css: [], components: [] } },
      true,
    )) {
      if (typeof find !== "string" && find.test(spec)) {
        candidate = spec.replace(find, replacement);
        break;
      }
    }
    if (!candidate) {
      const parts = spec.split("/");
      const name = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
      const dir = findPackageDir(name, root);
      if (dir) candidate = join(dir, ...spec.slice(name.length).split("/"));
    }
  }
  return candidate && existsSync(candidate) && statSync(candidate).isFile() ? candidate : undefined;
}

/** Main stylesheet names, most important first; they load first so later files can override them. */
const MAIN_CSS_NAMES = ["index", "global", "globals", "styles", "style", "main", "app"];

function mainRank(file: string): number {
  const rank = MAIN_CSS_NAMES.indexOf(
    basename(file)
      .replace(/\.[^.]+$/, "")
      .toLowerCase(),
  );
  return rank === -1 ? MAIN_CSS_NAMES.length : rank;
}

/** Main-named files first (in `MAIN_CSS_NAMES` order, shallower paths first), then the rest alphabetically. */
export function sortCss(files: string[]): string[] {
  const depth = (file: string) => file.split("/").length;
  return [...files].sort((a, b) => {
    const [ra, rb] = [mainRank(a), mainRank(b)];
    if (ra !== rb) return ra - rb;
    if (ra < MAIN_CSS_NAMES.length && depth(a) !== depth(b)) return depth(a) - depth(b);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** CSS imported by the app entry files, plus any Tailwind file those imports did not cover. */
export function detectCss(root: string): string[] {
  const found = new Set<string>();
  for (const dir of ENTRY_DIRS) {
    for (const name of ENTRY_NAMES) {
      for (const ext of SOURCE_EXT) {
        const entry = join(root, dir, name + ext);
        if (!existsSync(entry)) continue;
        for (const match of readFileSync(entry, "utf8").matchAll(IMPORT_RE)) {
          const spec = match[1]!;
          if (!STYLE_EXT.test(spec)) continue;
          const css = resolveStyleImport(root, entry, spec);
          if (css) found.add(css);
        }
      }
    }
  }
  if (![...found].some(hasTailwind)) {
    for (const file of walkCss(root)) if (hasTailwind(file)) found.add(file);
  }
  if (found.size === 0) {
    // Nothing imported from an entry: fall back to the best main-named stylesheet near the root.
    const mains = sortCss(
      walkCss(root)
        .map((file) => relative(root, file).split(sep).join("/"))
        .filter((file) => mainRank(file) < MAIN_CSS_NAMES.length)
        .filter((file) => file.startsWith("src/") || !file.includes("/")),
    );
    return mains.slice(0, 1);
  }
  return sortCss([...found].map((file) => relative(root, file).split(sep).join("/")));
}

export function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/** Conventional component directories that exist in the host. */
export function detectComponents(root: string): string[] {
  return COMPONENT_DIRS.filter((dir) => isDirectory(join(root, dir)));
}
