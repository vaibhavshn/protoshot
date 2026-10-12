import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { findHostRoot } from "./host.ts";

const ENTRY_DIRS = ["src", "app", "src/app", "pages", "src/pages"];
const ENTRY_NAMES = ["main", "index", "layout", "_app"];
const SOURCE_EXT = [".tsx", ".ts", ".jsx", ".js", ".mjs"];
const STYLE_EXT = /\.(css|scss|sass|less)$/;
const IMPORT_RE = /(?:import\s+|import\s*\(\s*)["']([^"']+)["']/g;
const TAILWIND_RE = /@tailwind\b|@import\s+["']tailwindcss/;
const SKIP_DIRS = new Set(["node_modules", ".git", ".vui", "dist", "build", ".next"]);

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

- \`--json\` prints one JSON object per shot (path, error, console errors, warnings) instead of bare paths.
- \`--all\` renders every variant a snippet file exports, one shot each.
- \`--dark\` renders in dark mode.
- A non-zero exit code means the build, render or console reported an error; read stderr.
`;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** CSS imported by the app entry files, else any file that pulls in Tailwind. */
export function detectCss(root: string): string[] {
  const found = new Set<string>();
  for (const dir of ENTRY_DIRS) {
    for (const name of ENTRY_NAMES) {
      for (const ext of SOURCE_EXT) {
        const entry = join(root, dir, name + ext);
        if (!existsSync(entry)) continue;
        for (const match of readFileSync(entry, "utf8").matchAll(IMPORT_RE)) {
          const spec = match[1]!;
          if (!spec.startsWith(".") || !STYLE_EXT.test(spec)) continue;
          const css = resolve(dirname(entry), spec);
          if (existsSync(css)) found.add(css);
        }
      }
    }
  }
  if (found.size === 0) {
    for (const file of walk(root)) {
      if (file.endsWith(".css") && TAILWIND_RE.test(readFileSync(file, "utf8"))) found.add(file);
    }
  }
  return [...found].map((file) => relative(root, file).split(sep).join("/")).sort();
}

function appendBlock(file: string, block: string) {
  const prior = existsSync(file) ? readFileSync(file, "utf8") : "";
  const gap =
    prior === "" ? "" : prior.endsWith("\n\n") ? "" : prior.endsWith("\n") ? "\n" : "\n\n";
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
    writeFileSync(configFile, `${JSON.stringify({ css }, null, 2)}\n`);
    report.push(
      css.length ? `wrote vui.json (css: ${css.join(", ")})` : "wrote vui.json (no CSS found)",
    );
  }

  const ignoreFile = join(root, ".gitignore");
  const ignored = existsSync(ignoreFile) ? readFileSync(ignoreFile, "utf8") : "";
  if (ignored.split(/\r?\n/).some((line) => /^\/?\.vui\/?$/.test(line.trim())))
    report.push(".gitignore already ignores .vui/");
  else if (await confirm("Add .vui/ to .gitignore?", interactive)) {
    const gap = ignored === "" || ignored.endsWith("\n") ? "" : "\n";
    writeFileSync(ignoreFile, `${ignored}${gap}.vui/\n`);
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
