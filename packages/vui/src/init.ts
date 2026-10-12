import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { buildAliases } from "./aliases.ts";
import { findHostRoot } from "./host.ts";
import { findPackageDir } from "./resolve.ts";

const ENTRY_DIRS = ["src", "app", "src/app", "pages", "src/pages"];
const ENTRY_NAMES = ["main", "index", "layout", "_app"];
const SOURCE_EXT = [".tsx", ".ts", ".jsx", ".js", ".mjs"];
const STYLE_EXT = /\.(css|scss|sass|less)$/;
const IMPORT_RE = /(?:import\s+|import\s*\(\s*)["']([^"']+)["']/g;
const TAILWIND_RE = /@tailwind\b|@import\s+["']tailwindcss/;
const SKIP_DIRS = new Set(["node_modules", ".git", ".vui", "dist", "build", ".next"]);

const COMPONENT_DIRS = ["src/components", "components", "app/components", "src/ui"];

const AGENT_SECTION_TITLE = "Previewing UI with vui";

const AGENT_SECTION = `## ${AGENT_SECTION_TITLE}

Use \`vui\` to render a UI snippet in the real app styles and get a PNG back to look at. It prints the path of each shot.

\`\`\`sh
vui src/components/Button.tsx        # render a snippet file
vui - <<'EOF'                        # render a snippet from stdin
<Button variant="primary">Save</Button>
EOF
vui -e '<Badge>New</Badge>'          # render an inline snippet
\`\`\`

- \`--json\` prints an array with one object per shot (path, export, error, console errors, warnings) instead of bare paths.
- \`--all\` renders every variant a snippet file exports, one shot each.
- \`--dark\` renders in dark mode.
- Components exported from the directories listed under \`components\` in \`vui.json\` need no import in a snippet.
- A non-zero exit code means the build, render or console reported an error; read stderr.
`;

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
    for (const { find, replacement } of buildAliases({ root, config: { css: [] } }, true)) {
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
  return [...found].map((file) => relative(root, file).split(sep).join("/")).sort();
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function appendBlock(file: string, block: string, blankLine = true) {
  const prior = existsSync(file) ? readFileSync(file, "utf8") : "";
  const gap =
    prior === ""
      ? ""
      : prior.endsWith("\n\n") || (!blankLine && prior.endsWith("\n"))
        ? ""
        : prior.endsWith("\n")
          ? "\n"
          : blankLine
            ? "\n\n"
            : "\n";
  writeFileSync(file, `${prior}${gap}${block}`);
}

async function confirm(question: string, interactive: boolean): Promise<boolean> {
  if (!interactive) return true;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return !/^n/i.test((await rl.question(`${question} [Y/n] `)).trim());
  } finally {
    rl.close();
  }
}

/** Writes vui.json, offers the .gitignore entry and adds the agent docs section. Returns report lines. */
export async function runInit(cwd: string, interactive: boolean): Promise<string[]> {
  const root = findHostRoot(cwd);
  const report: string[] = [];

  const configFile = join(root, "vui.json");
  if (existsSync(configFile)) report.push("vui.json already exists, left unchanged");
  else {
    const css = detectCss(root);
    const components = COMPONENT_DIRS.filter((dir) => isDirectory(join(root, dir)));
    const config = components.length ? { css, components } : { css };
    writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
    report.push(
      css.length ? `wrote vui.json (css: ${css.join(", ")})` : "wrote vui.json (no CSS found)",
    );
    if (components.length) report.push(`component roots: ${components.join(", ")}`);
  }

  const ignoreFile = join(root, ".gitignore");
  const ignored = existsSync(ignoreFile) ? readFileSync(ignoreFile, "utf8") : "";
  if (ignored.split(/\r?\n/).some((line) => /^\/?\.vui\/?$/.test(line.trim())))
    report.push(".gitignore already ignores .vui/");
  else if (await confirm("Add .vui/ to .gitignore?", interactive)) {
    appendBlock(ignoreFile, ".vui/\n", false);
    report.push("added .vui/ to .gitignore");
  }

  const docs = ["AGENTS.md", "CLAUDE.md"].map((name) => join(root, name)).filter(existsSync);
  if (docs.length === 0) docs.push(join(root, "AGENTS.md"));
  for (const doc of docs) {
    const name = relative(root, doc);
    if (existsSync(doc) && readFileSync(doc, "utf8").includes(AGENT_SECTION_TITLE))
      report.push(`${name} already documents vui`);
    else {
      appendBlock(doc, AGENT_SECTION);
      report.push(`added "${AGENT_SECTION_TITLE}" to ${name}`);
    }
  }
  return report;
}
