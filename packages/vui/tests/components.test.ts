import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  componentPrelude,
  defaultExportName,
  hintUnresolved,
  referencedComponents,
  scanComponents,
} from "../src/components.ts";
import { fixture, readPng, runCli } from "./helpers.ts";

function host(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "vui-components-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

const names = (root: string, dirs = ["ui"]) => [...scanComponents(root, dirs).byName.keys()].sort();

test("default exports are named after the file; index files use the directory", () => {
  expect(defaultExportName("/a/button-group.tsx")).toBe("ButtonGroup");
  expect(defaultExportName("/a/date_picker.tsx")).toBe("DatePicker");
  expect(defaultExportName("/a/Button/index.tsx")).toBe("Button");
  expect(defaultExportName("/a/123.tsx")).toBeUndefined();
});

test("scan takes PascalCase value exports and skips types, helpers, tests and stories", () => {
  const root = host({
    "ui/card.tsx": `export const Card = () => null; export const cn = () => ""; export type Props = {};
export interface CardProps {} type Local = {}; export { Local };`,
    "ui/button-group.tsx": "export default function Anything() { return null; }",
    "ui/Toggle/index.tsx": "export default () => null;",
    "ui/same.tsx": "export default function Same() { return null; } export const Same2 = 1;",
    "ui/card.test.tsx": "export const FromTest = () => null;",
    "ui/card.stories.tsx": "export const FromStory = () => null;",
    "ui/types.d.ts": "export const FromDts: number;",
  });
  expect(names(root)).toEqual(["ButtonGroup", "Card", "Same", "Same2", "Toggle"]);
});

test("a named export beats the filename-derived default of the same name", () => {
  const root = host({
    "ui/button.tsx": "export const Button = () => null; export default Button;",
  });
  const entries = scanComponents(root, ["ui"]).byName.get("Button")!;
  expect(entries.map((e) => e.kind)).toEqual(["named"]);
});

test("a barrel re-export is the same component as the file it re-exports", () => {
  const root = host({
    "ui/Button.tsx": "export const Button = () => null;",
    "ui/index.ts": 'export { Button } from "./Button"; export * from "./other";',
    "ui/other.tsx": "export const Other = () => null;",
  });
  const index = scanComponents(root, ["ui"]);
  expect(index.byName.get("Button")!.map((e) => e.file.endsWith("Button.tsx"))).toEqual([true]);
  expect(names(root)).toEqual(["Button", "Other"]);
});

test("references skip declared names, property names and JSX attribute names", () => {
  const candidates = new Set(["Button", "Card", "Icon"]);
  const used = (code: string) => referencedComponents(code, "s.tsx", candidates);
  expect(used("<Card><Button /></Card>")).toEqual(["Card", "Button"]);
  expect(used('import { Button } from "x"; <Button />')).toEqual([]);
  expect(used("const Card = () => null; <Card />")).toEqual([]);
  expect(used("<div Icon={1}>{obj.Button}{{ Card: 1 }}</div>")).toEqual([]);
  expect(used("<Icon.Sub />")).toEqual(["Icon"]);
});

test("prelude imports only used names, on one line; a collision is a usage error", () => {
  const root = host({
    "ui/Card.tsx": "export const Card = () => null;",
    "ui/dup-a/Item.tsx": "export const Item = () => null;",
    "ui/dup-b/item.tsx": "export default () => null;",
  });
  const index = scanComponents(root, ["ui"]);
  const prelude = componentPrelude(index, "<Card />", "s.tsx", root);
  expect(prelude).toMatch(/^import \{ Card \} from ".*Card\.tsx"; $/);
  expect(componentPrelude(index, "<b />", "s.tsx", root)).toBe("");
  expect(() => componentPrelude(index, "<Item />", "s.tsx", root)).toThrow(
    /more than one file[\s\S]*dup-a\/Item\.tsx[\s\S]*dup-b\/item\.tsx/,
  );
});

test("a missing Component root is a config error", () => {
  expect(() => scanComponents(host({}), ["nope"])).toThrow(/not a directory/);
});

test("an unresolved name gets the roots and a did-you-mean", () => {
  const root = host({ "ui/Button.tsx": "export const Button = () => null;" });
  const index = scanComponents(root, ["ui"]);
  expect(hintUnresolved({ message: "Buton is not defined" }, index)!.message).toBe(
    'Buton is not defined. Component roots: ui (1 component). Did you mean "Button"?',
  );
  expect(hintUnresolved({ message: "Zzzzzz is not defined" }, index)!.message).not.toContain(
    "Did you",
  );
  expect(hintUnresolved({ message: "other" }, index)!.message).toBe("other");
});

const react = fixture("react-vite-tailwind");

test("snippets use Component root components without imports", async () => {
  const { code, stdout } = await runCli(["-e", "<Card title='x' />", "--scale", "1"], {
    cwd: react,
  });
  expect(code).toBe(0);
  // Card is blue only when the Wrapper's provider is active.
  expect(readPng(stdout.trim()).pixel(52, 52)).toEqual([0, 0, 255, 255]);
});

test("a default export is in scope under the CamelCased filename", async () => {
  const { code, stdout } = await runCli(["-e", "<StatusBadge />", "--scale", "1"], { cwd: react });
  expect(code).toBe(0);
  expect(readPng(stdout.trim()).pixel(52, 52)).toEqual([0, 255, 0, 255]);
});

test("a name the snippet declares itself wins over the Component root", async () => {
  const snippet =
    'const StatusBadge = () => <div className="h-24 w-48 bg-[#ff0000]" />;\nexport default StatusBadge;';
  const { code, stdout } = await runCli(["-e", snippet, "--scale", "1"], { cwd: react });
  expect(code).toBe(0);
  expect(readPng(stdout.trim()).pixel(52, 52)).toEqual([255, 0, 0, 255]);
});

test("--all ignores names the snippet only uses", async () => {
  const snippet =
    "export default () => <Card title='a' />;\nexport const Other = () => <Card title='b' />;";
  const { stdout } = await runCli(["-e", snippet, "--all", "--json"], { cwd: react });
  expect((JSON.parse(stdout) as { export: string }[]).map((s) => s.export)).toEqual([
    "default",
    "Other",
  ]);
});

test("an unknown component is a snippet error with a hint", async () => {
  const { code, stderr } = await runCli(["-e", "<Crad title='x' />"], { cwd: react });
  expect(code).toBe(1);
  expect(stderr).toContain("Crad is not defined");
  expect(stderr).toContain('Did you mean "Card"?');
});
