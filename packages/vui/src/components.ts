import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { parseSync } from "oxc-parser";
import { ConfigError, UsageError } from "./errors.ts";
import type { ShotError } from "./types.ts";

/** A name a snippet can use without importing it, and the file that provides it. */
export interface ComponentEntry {
  name: string;
  file: string;
  kind: "named" | "default";
  /** For `export { X } from "./y"`: the file it re-exports from, when that is a relative path. */
  target?: string;
}

export interface ComponentIndex {
  /** Each Component root with the number of distinct component names it provides. */
  roots: { dir: string; count: number }[];
  byName: Map<string, ComponentEntry[]>;
}

const SOURCE_EXT = [".tsx", ".ts", ".jsx", ".js", ".mjs"];
const IGNORED_FILE = /\.(test|stories)\.[^.]+$|\.d\.ts$/;
const PASCAL_CASE = /^[A-Z][A-Za-z0-9_$]*$/;
const TYPE_DECLARATIONS = new Set([
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSDeclareFunction",
]);

// oxc's ESTree nodes are walked structurally here, so a loose node type keeps this readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = { type: string; [key: string]: any };

function langOf(file: string): "tsx" | "ts" | "jsx" | "js" {
  const ext = extname(file);
  return ext === ".tsx" ? "tsx" : ext === ".ts" ? "ts" : ext === ".jsx" ? "jsx" : "js";
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") out.push(...sourceFiles(path));
    } else if (SOURCE_EXT.includes(extname(entry.name)) && !IGNORED_FILE.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

/** `button-group.tsx` → `ButtonGroup`; `Button/index.tsx` → `Button`. */
export function defaultExportName(file: string): string | undefined {
  let stem = basename(file, extname(file));
  if (stem === "index") stem = basename(dirname(file));
  const name = stem
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
  return PASCAL_CASE.test(name) ? name : undefined;
}

function resolveRelative(from: string, spec: string): string | undefined {
  if (!spec.startsWith(".")) return undefined;
  const base = resolve(dirname(from), spec);
  const candidates = [
    base,
    ...SOURCE_EXT.map((ext) => base + ext),
    ...SOURCE_EXT.map((ext) => join(base, `index${ext}`)),
  ];
  return candidates.find((file) => existsSync(file) && statSync(file).isFile());
}

function bindingNames(pattern: Node | null | undefined, into: Set<string>): void {
  if (!pattern) return;
  switch (pattern.type) {
    case "Identifier":
      into.add(pattern.name);
      break;
    case "ObjectPattern":
      for (const prop of pattern.properties as Node[])
        bindingNames(prop.type === "RestElement" ? prop.argument : prop.value, into);
      break;
    case "ArrayPattern":
      for (const element of pattern.elements as (Node | null)[]) bindingNames(element, into);
      break;
    case "RestElement":
      bindingNames(pattern.argument, into);
      break;
    case "AssignmentPattern":
      bindingNames(pattern.left, into);
      break;
    case "TSParameterProperty":
      bindingNames(pattern.parameter, into);
      break;
  }
}

/** The PascalCase value exports of one file, as entries. */
function exportsOf(file: string): ComponentEntry[] {
  const { program } = parseSync(file, readFileSync(file, "utf8"), { lang: langOf(file) });
  const body = program.body as unknown as Node[];
  const typeNames = new Set<string>();
  for (const node of body) {
    const decl = node.type === "ExportNamedDeclaration" ? node.declaration : node;
    if (decl && TYPE_DECLARATIONS.has(decl.type) && decl.id?.name) typeNames.add(decl.id.name);
  }

  const entries: ComponentEntry[] = [];
  const named = new Set<string>();
  const addNamed = (name: string, target?: string) => {
    if (!PASCAL_CASE.test(name) || named.has(name)) return;
    named.add(name);
    entries.push({ name, file, kind: "named", target });
  };
  let hasDefault = false;
  for (const node of body) {
    if (node.type === "ExportDefaultDeclaration") {
      hasDefault = !TYPE_DECLARATIONS.has(node.declaration?.type);
    } else if (node.type === "ExportNamedDeclaration" && node.exportKind !== "type") {
      const decl = node.declaration as Node | null;
      if (decl) {
        if (TYPE_DECLARATIONS.has(decl.type)) continue;
        const names = new Set<string>();
        if (decl.type === "VariableDeclaration")
          for (const d of decl.declarations as Node[]) bindingNames(d.id, names);
        else if (decl.id?.name) names.add(decl.id.name);
        for (const name of names) addNamed(name);
      } else {
        const target = node.source ? resolveRelative(file, node.source.value as string) : undefined;
        for (const spec of node.specifiers as Node[]) {
          if (spec.exportKind === "type") continue;
          if (!node.source && typeNames.has(spec.local.name)) continue;
          addNamed((spec.exported.name ?? spec.exported.value) as string, target);
        }
      }
    }
  }
  const defaultName = hasDefault ? defaultExportName(file) : undefined;
  // A named export of the same name wins over the filename-derived default.
  if (defaultName && !named.has(defaultName))
    entries.push({ name: defaultName, file, kind: "default" });
  return entries;
}

/** Scans the Component roots (paths relative to the host root) once; share the result across shots. */
export function scanComponents(hostRoot: string, dirs: string[]): ComponentIndex {
  const byName = new Map<string, ComponentEntry[]>();
  const roots: ComponentIndex["roots"] = [];
  const perRoot: ComponentEntry[][] = [];
  for (const dir of dirs) {
    const abs = resolve(hostRoot, dir);
    if (!existsSync(abs) || !statSync(abs).isDirectory())
      throw new ConfigError(
        `${join(hostRoot, "vui.json")}: "components" entry "${dir}" is not a directory`,
      );
    const entries = sourceFiles(abs).flatMap(exportsOf);
    perRoot.push(entries);
    roots.push({ dir, count: 0 });
    for (const entry of entries) {
      const list = byName.get(entry.name) ?? [];
      list.push(entry);
      byName.set(entry.name, list);
    }
  }
  // A barrel's `export { Button } from "./Button"` is the same component as Button's own export.
  for (const [name, list] of byName) {
    const files = new Set(list.map((entry) => entry.file));
    const direct = list.filter((entry) => !entry.target || !files.has(entry.target));
    const unique = [...new Map(direct.map((entry) => [entry.file + entry.kind, entry])).values()];
    byName.set(name, unique);
  }
  perRoot.forEach((entries, index) => {
    roots[index]!.count = new Set(
      entries.filter((e) => byName.get(e.name)?.includes(e)).map((e) => e.name),
    ).size;
  });
  return { roots, byName };
}

/** Identifiers the snippet references but never declares or imports, limited to `candidates`. */
export function referencedComponents(
  source: string,
  filename: string,
  candidates: ReadonlySet<string>,
): string[] {
  const { program } = parseSync(filename, source, { lang: langOf(filename) });
  const declared = new Set<string>();
  const referenced = new Set<string>();
  const visit = (node: Node, parent: Node | undefined, key: string | undefined) => {
    switch (node.type) {
      case "ImportSpecifier":
      case "ImportDefaultSpecifier":
      case "ImportNamespaceSpecifier":
        declared.add(node.local.name);
        return;
      case "VariableDeclarator":
        bindingNames(node.id, declared);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        for (const param of (node.params ?? []) as Node[]) bindingNames(param, declared);
        if (node.id?.name) declared.add(node.id.name);
        break;
      case "ClassDeclaration":
      case "ClassExpression":
      case "TSEnumDeclaration":
        if (node.id?.name) declared.add(node.id.name);
        break;
      case "CatchClause":
        bindingNames(node.param, declared);
        break;
      case "ExportSpecifier":
        return;
      case "Identifier":
      case "JSXIdentifier": {
        const isName =
          (parent?.type === "MemberExpression" && key === "property" && !parent.computed) ||
          (parent?.type === "JSXMemberExpression" && key === "property") ||
          (parent?.type === "JSXAttribute" && key === "name") ||
          ((parent?.type === "Property" ||
            parent?.type === "MethodDefinition" ||
            parent?.type === "PropertyDefinition") &&
            key === "key" &&
            !parent.computed);
        if (!isName && candidates.has(node.name)) referenced.add(node.name);
        return;
      }
    }
    for (const [childKey, value] of Object.entries(node)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object" && typeof item.type === "string")
            visit(item, node, childKey);
        }
      } else if (value && typeof value === "object" && typeof (value as Node).type === "string") {
        visit(value as Node, node, childKey);
      }
    }
  };
  visit(program as unknown as Node, undefined, undefined);
  return [...referenced].filter((name) => !declared.has(name));
}

/**
 * Import statements, on one line so the snippet's line numbers stay put, for every Component root
 * export the snippet uses without importing. A name provided by two files is a usage error.
 */
export function componentPrelude(
  index: ComponentIndex,
  snippetSource: string,
  snippetFile: string,
  hostRoot: string,
): string {
  if (index.byName.size === 0) return "";
  const used = referencedComponents(snippetSource, snippetFile, new Set(index.byName.keys()));
  const imports: string[] = [];
  for (const name of used) {
    const entries = index.byName.get(name)!;
    if (entries.length > 1) {
      const where = entries.map(
        (e) => `  ${relative(hostRoot, e.file).split(sep).join("/")} (${e.kind} export)`,
      );
      throw new UsageError(
        `"${name}" is provided by more than one file in the Component roots:\n${where.join("\n")}\nImport the one you mean explicitly.`,
      );
    }
    const { file, kind } = entries[0]!;
    imports.push(
      kind === "default"
        ? `import ${name} from ${JSON.stringify(file)};`
        : `import { ${name} } from ${JSON.stringify(file)};`,
    );
  }
  return imports.length ? `${imports.join(" ")} ` : "";
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length]!;
}

/** Adds the Component roots and a did-you-mean to a "X is not defined" error. */
export function hintUnresolved(
  error: ShotError | undefined,
  index: ComponentIndex,
): ShotError | undefined {
  const name = error && /\b(\w+) is not defined/.exec(error.message)?.[1];
  if (!error || !name || index.roots.length === 0) return error;
  const roots = index.roots
    .map((root) => `${root.dir} (${root.count} component${root.count === 1 ? "" : "s"})`)
    .join(", ");
  const closest = [...index.byName.keys()]
    .map((candidate) => ({
      candidate,
      d: distance(name.toLowerCase(), candidate.toLowerCase()),
    }))
    .filter(({ d }) => d <= Math.max(2, Math.floor(name.length / 3)))
    .sort((a, b) => a.d - b.d)[0];
  const suggestion = closest ? ` Did you mean "${closest.candidate}"?` : "";
  const hint = `${name} is not defined. Component roots: ${roots}.${suggestion}`;
  return { ...error, message: error.message.replace(`${name} is not defined`, hint) };
}
