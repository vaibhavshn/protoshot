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
