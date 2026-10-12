import { parseSync } from "oxc-parser";

export type SnippetKind = "expression" | "module";

const EXPORT_NODES = new Set([
  "ExportNamedDeclaration",
  "ExportDefaultDeclaration",
  "ExportAllDeclaration",
]);

/** A snippet with no exports whose body is a single expression is a bare expression. */
export function classifySnippet(source: string): SnippetKind {
  const { program } = parseSync("snippet.tsx", source, { lang: "tsx" });
  const { body } = program;
  if (body.some((node) => EXPORT_NODES.has(node.type))) return "module";
  return body.length === 1 && body[0]!.type === "ExpressionStatement" ? "expression" : "module";
}

/** Returns module source: bare expressions are wrapped into a default-exported component. */
export function toModuleSource(source: string): string {
  if (classifySnippet(source) === "module") return source;
  const expression = source.trim().replace(/;$/, "");
  return `import React from "react";\nexport default () => (${expression});\n`;
}

const PASCAL_CASE = /^[A-Z]/;

// oxc's ESTree nodes are walked structurally here, so a loose node type keeps this readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = { type: string; [key: string]: any };

/** A function, arrow, class, or `memo(...)` / `forwardRef(...)` call (also `React.memo`). */
function isComponentValue(node: Node | null | undefined): boolean {
  if (!node) return false;
  switch (node.type) {
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
    case "ClassDeclaration":
    case "ClassExpression":
      return true;
    case "CallExpression": {
      const callee = node.callee as Node;
      const name =
        callee.type === "Identifier"
          ? callee.name
          : callee.type === "MemberExpression"
            ? callee.property?.name
            : undefined;
      return name === "memo" || name === "forwardRef";
    }
    default:
      return false;
  }
}

/** The `[name, isComponent]` pairs a top-level declaration introduces. */
function declared(decl: Node): [string, boolean][] {
  if (decl.type === "VariableDeclaration") {
    return (decl.declarations as Node[])
      .filter((d) => d.id.type === "Identifier")
      .map((d) => [d.id.name, isComponentValue(d.init)]);
  }
  return decl.id?.type === "Identifier" ? [[decl.id.name, isComponentValue(decl)]] : [];
}

/**
 * Names of the exports that render as components, in source order. `default` stands for the
 * default export; named exports must also have a PascalCase name.
 */
export function listComponentExports(source: string): string[] {
  const { program } = parseSync("snippet.tsx", toModuleSource(source), { lang: "tsx" });
  const body = program.body as unknown as Node[];
  const names = new Set<string>();
  const locals = new Map<string, boolean>();
  const exported: Node[] = [];
  for (const node of body) {
    const decl = node.type === "ExportNamedDeclaration" ? node.declaration : node;
    if (decl) for (const [name, isComponent] of declared(decl)) locals.set(name, isComponent);
    if (node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration")
      exported.push(node);
  }
  for (const node of exported) {
    if (node.type === "ExportDefaultDeclaration") names.add("default");
    else if (node.declaration) {
      for (const [name, isComponent] of declared(node.declaration as Node)) {
        if (isComponent && PASCAL_CASE.test(name)) names.add(name);
      }
    } else if (!node.source) {
      for (const spec of node.specifiers as Node[]) {
        const name = (spec.exported.name ?? spec.exported.value) as string;
        if (PASCAL_CASE.test(name) && locals.get(spec.local.name)) names.add(name);
      }
    }
  }
  return [...names];
}
