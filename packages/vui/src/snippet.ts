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

/**
 * Names of the exports that render as components, in source order. `default` stands for the
 * default export; named exports must also have a PascalCase name.
 */
export function listComponentExports(source: string): string[] {
  const { program } = parseSync("snippet.tsx", toModuleSource(source), { lang: "tsx" });
  const body = program.body as unknown as Node[];
  const locals = new Map<string, boolean>();
  for (const node of body) {
    const decl = node.type === "ExportNamedDeclaration" ? node.declaration : node;
    if (!decl) continue;
    if (decl.type === "VariableDeclaration") {
      for (const d of decl.declarations as Node[]) {
        if (d.id.type === "Identifier") locals.set(d.id.name, isComponentValue(d.init));
      }
    } else if (decl.id?.type === "Identifier") {
      locals.set(decl.id.name, isComponentValue(decl));
    }
  }

  const names: string[] = [];
  const add = (name: string) => {
    if (!names.includes(name)) names.push(name);
  };
  for (const node of body) {
    if (node.type === "ExportDefaultDeclaration") {
      add("default");
    } else if (node.type === "ExportNamedDeclaration") {
      const decl = node.declaration as Node | null;
      if (decl?.type === "VariableDeclaration") {
        for (const d of decl.declarations as Node[]) {
          if (d.id.type === "Identifier" && PASCAL_CASE.test(d.id.name) && isComponentValue(d.init))
            add(d.id.name);
        }
      } else if (decl) {
        const name = decl.id?.name as string | undefined;
        if (name && PASCAL_CASE.test(name) && isComponentValue(decl)) add(name);
      } else if (!node.source) {
        for (const spec of node.specifiers as Node[]) {
          const exported = (spec.exported.name ?? spec.exported.value) as string;
          if (PASCAL_CASE.test(exported) && locals.get(spec.local.name)) add(exported);
        }
      }
    }
  }
  return names;
}
