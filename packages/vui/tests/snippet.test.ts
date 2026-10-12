import { expect, test } from "vite-plus/test";
import { classifySnippet, toModuleSource } from "../src/snippet.ts";

test.each([
  ['<button className="x">Hi</button>', "expression"],
  ["<><A /><B /></>", "expression"],
  ["(<div />)", "expression"],
  ["<Card title={a + b} />;", "expression"],
  ["export default () => <div />", "module"],
  ['import { Card } from "@/Card";\nexport const A = () => <Card />;', "module"],
  ["const a = 1;\n<div>{a}</div>", "module"],
  ["export const Loading = () => null", "module"],
])("classifies %j as %s", (source, kind) => {
  expect(classifySnippet(source)).toBe(kind);
});

test("a bare expression becomes a module with a default export", () => {
  const out = toModuleSource("<b>hi</b>");
  expect(classifySnippet(out)).toBe("module");
  expect(out).toContain("export default");
  expect(out).toContain("<b>hi</b>");
});

test("a module is left as is", () => {
  const source = "export default () => null";
  expect(toModuleSource(source)).toBe(source);
});
