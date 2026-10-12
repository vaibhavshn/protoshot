import { expect, test } from "vite-plus/test";
import { classifySnippet, listComponentExports, toModuleSource } from "../src/snippet.ts";

test("lists component exports: functions, arrows, memo and forwardRef with PascalCase names", () => {
  const source = `
import React, { memo, forwardRef } from "react";
export default function Main() { return null; }
export const Loading = () => null;
export function Empty() { return null; }
export const Memoed = memo(() => null);
export const Fwd = React.forwardRef((p, r) => null);
const Local = forwardRef(() => null);
export { Local as Renamed };
export const lowercase = () => null;
export const NUMBER = 4;
export const Data = { a: 1 };
export function helper() {}
`;
  expect(listComponentExports(source)).toEqual([
    "default",
    "Loading",
    "Empty",
    "Memoed",
    "Fwd",
    "Renamed",
  ]);
});

test("a bare expression exposes only the default export", () => {
  expect(listComponentExports("<b>hi</b>")).toEqual(["default"]);
});

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
