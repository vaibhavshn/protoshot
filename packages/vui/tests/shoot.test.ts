import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { shoot } from "../src/index.ts";
import { fixture, readPng } from "./helpers.ts";

test("a snippet file with a default export becomes a styled PNG", async () => {
  const host = fixture("react-vite-tailwind");
  const [shot] = await shoot({ file: join(host, "Button.tsx") }, { cwd: host });

  expect(existsSync(shot!.path)).toBe(true);
  expect(shot!.path).toContain(join(host, ".vui/shots"));
  const png = readPng(shot!.path);
  expect([png.width, png.height]).toEqual([1280, 800]);
  // Tailwind arbitrary class `bg-[#00ff00]` only exists if the host CSS pipeline ran.
  expect(png.pixel(20, 20)).toEqual([0, 255, 0, 255]);
});

test("a host without React fails with a clear error", async () => {
  const host = mkdtempSync(join(tmpdir(), "vui-no-react-"));
  writeFileSync(join(host, "package.json"), "{}");
  writeFileSync(join(host, "a.tsx"), "export default () => null;");
  await expect(shoot({ file: "a.tsx" }, { cwd: host })).rejects.toThrow(
    /Could not resolve "react"/,
  );
});

test("a bare expression is rendered, and Tailwind generates classes used only there", async () => {
  const host = fixture("react-vite-tailwind");
  const [shot] = await shoot(
    { code: '<button className="bg-[#123456] p-4">Hi</button>' },
    { cwd: host },
  );
  expect(readPng(shot!.path).pixel(20, 20)).toEqual([0x12, 0x34, 0x56, 255]);
});

test("an inline module can import host components through the alias", async () => {
  const host = fixture("react-vite-tailwind");
  const [shot] = await shoot(
    {
      code: 'import { Card } from "@/components/Card";\nexport default () => <Card title="x" />;',
    },
    { cwd: host },
  );
  // Card is blue when the Wrapper's provider is active.
  expect(readPng(shot!.path).pixel(20, 20)).toEqual([0, 0, 255, 255]);
});
