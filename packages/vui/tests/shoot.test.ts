import { cpSync, existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { shoot } from "../src/index.ts";
import { fixture, readPng } from "./helpers.ts";

test("a snippet file with a default export becomes a styled PNG", async () => {
  const host = fixture("react-vite-tailwind");
  const [shot] = await shoot(
    { file: join(host, "Button.tsx") },
    { cwd: host, full: true, scale: 1 },
  );

  expect(existsSync(shot!.path)).toBe(true);
  expect(shot!.path).toContain(join(tmpdir(), "vui"));
  expect(shot!.path).not.toContain(host);
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
  expect(readPng(shot!.path).pixel(52, 52)).toEqual([0x12, 0x34, 0x56, 255]);
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
  expect(readPng(shot!.path).pixel(52, 52)).toEqual([0, 0, 255, 255]);
});

const BLUE = [0, 0, 255, 255];

test("a non-Vite host renders through tsconfig paths with the Wrapper active", async () => {
  const host = fixture("react-plain");
  const [shot] = await shoot(
    { code: 'import { Card } from "@/Card";\nexport default () => <Card />;' },
    { cwd: host },
  );
  expect(readPng(shot!.path).pixel(52, 52)).toEqual(BLUE);
});

test("running from a monorepo package finds the root vui.json", async () => {
  const root = fixture("monorepo");
  const [shot] = await shoot({ file: "src/Hello.tsx" }, { cwd: join(root, "packages/app") });
  expect(shot!.path).toContain(join(tmpdir(), "vui"));
  expect(readPng(shot!.path).pixel(52, 52)).toEqual(BLUE);
});

/** A throwaway copy of react-plain that shares its node_modules. */
function plainHostCopy(vuiJson: string): string {
  const host = mkdtempSync(join(tmpdir(), "vui-host-"));
  cpSync(fixture("react-plain"), host, {
    recursive: true,
    filter: (src) => !src.includes("node_modules") && !src.endsWith("vui.json"),
  });
  symlinkSync(join(fixture("react-plain"), "node_modules"), join(host, "node_modules"));
  writeFileSync(join(host, "vui.json"), vuiJson);
  return host;
}

test("vui.json alias entries resolve relative to the host root", async () => {
  const host = plainHostCopy(
    JSON.stringify({ css: ["src/styles.css"], wrapper: "src/Wrapper.tsx", alias: { "~": "src" } }),
  );
  const [shot] = await shoot(
    { code: 'import { Card } from "~/Card";\nexport default () => <Card />;' },
    { cwd: host },
  );
  expect(readPng(shot!.path).pixel(52, 52)).toEqual(BLUE);
});

test("an invalid vui.json is reported with its path", async () => {
  const host = plainHostCopy(JSON.stringify({ css: "src/styles.css" }));
  await expect(shoot({ code: "<div />" }, { cwd: host })).rejects.toThrow(
    new RegExp(`${join(host, "vui.json")}.*"css" must be an array`),
  );
});

test("by default the shot is cropped around the content at 2x", async () => {
  const host = fixture("react-vite-tailwind");
  const [shot] = await shoot({ file: "Button.tsx" }, { cwd: host });
  const png = readPng(shot!.path);
  expect(png.width).toBeLessThan(400);
  expect(png.height).toBeLessThan(200);
  // 2x device pixels: the 16px padding alone is 32 device pixels.
  expect(png.width).toBeGreaterThan(32);
  expect(png.pixel(42, 42)).toEqual([0, 255, 0, 255]);
});

test("--viewport and --scale set the size of a full shot", async () => {
  const host = fixture("react-vite-tailwind");
  const [shot] = await shoot(
    { file: "Button.tsx" },
    { cwd: host, full: true, viewport: { width: 600, height: 400 }, scale: 2 },
  );
  const png = readPng(shot!.path);
  expect([png.width, png.height]).toEqual([1200, 800]);
});

test("the padding is filled with the page background", async () => {
  const host = fixture("react-vite-tailwind");
  const code =
    'export default () => { document.body.style.background = "#112233"; return <div style={{ width: 100, height: 50, background: "#00ff00" }} />; };';
  const [shot] = await shoot({ code }, { cwd: host, scale: 1 });
  const png = readPng(shot!.path);
  expect(png.pixel(2, 2)).toEqual([0x11, 0x22, 0x33, 255]);
  expect(png.pixel(60, 40)).toEqual([0, 255, 0, 255]);
});

test("--full is the page as rendered: no padding, no crop", async () => {
  const host = fixture("react-vite-tailwind");
  const [shot] = await shoot(
    { code: '<div style={{ width: 100, height: 50, background: "#00ff00" }} />' },
    { cwd: host, full: true, scale: 1 },
  );
  const png = readPng(shot!.path);
  expect([png.width, png.height]).toEqual([1280, 800]);
  // The host puts the content at the origin; vui adds nothing around it.
  expect(png.pixel(0, 0)).toEqual([0, 255, 0, 255]);
});

test("a portal modal is fully inside the crop", async () => {
  const host = fixture("react-vite-tailwind");
  const [shot] = await shoot({ file: "Modal.tsx" }, { cwd: host, scale: 1 });
  const png = readPng(shot!.path);
  // Modal spans x 600..800 and y 300..400; the crop starts at the trigger in the corner.
  expect(png.width).toBeGreaterThanOrEqual(800);
  expect(png.height).toBeGreaterThanOrEqual(400);
  expect(png.pixel(700, 350)).toEqual([0, 0, 255, 255]);
});

test("--dark flips a Tailwind dark: style", async () => {
  const host = fixture("react-vite-tailwind");
  const [light] = await shoot({ file: "Themed.tsx" }, { cwd: host });
  const [dark] = await shoot({ file: "Themed.tsx" }, { cwd: host, dark: true });
  expect(readPng(light!.path).pixel(52, 52)).toEqual([255, 255, 255, 255]);
  expect(readPng(dark!.path).pixel(52, 52)).toEqual([0, 0, 0, 255]);
});

test("--dark passes colorScheme to the Wrapper", async () => {
  const host = fixture("react-vite-tailwind");
  const code =
    'import { useContext } from "react";\nimport { ThemeContext } from "@/theme";\nexport default () => { const t = useContext(ThemeContext); return <div className={t === "night" ? "bg-[#111111] p-4" : "bg-[#eeeeee] p-4"}>x</div>; };';
  const [light] = await shoot({ code }, { cwd: host });
  const [dark] = await shoot({ code }, { cwd: host, dark: true });
  expect(readPng(light!.path).pixel(42, 42)).toEqual([238, 238, 238, 255]);
  expect(readPng(dark!.path).pixel(42, 42)).toEqual([17, 17, 17, 255]);
});

test("a spinning animation is captured identically every time", async () => {
  const host = fixture("react-vite-tailwind");
  const [a] = await shoot({ file: "Spinner.tsx" }, { cwd: host });
  const [b] = await shoot({ file: "Spinner.tsx" }, { cwd: host });
  expect(readFileSync(a!.path).equals(readFileSync(b!.path))).toBe(true);
});

test("--wait with a selector waits for it to appear", async () => {
  const host = fixture("react-vite-tailwind");
  const code =
    'import { useEffect, useState } from "react";\nexport default () => { const [on, set] = useState(false); useEffect(() => { setTimeout(() => set(true), 400); }, []); return <div>{on && <i id="late" className="bg-[#00ff00] p-4">late</i>}</div>; };';
  const [shot] = await shoot({ code }, { cwd: host, wait: "#late" });
  expect(readPng(shot!.path).pixel(42, 42)).toEqual([0, 255, 0, 255]);
});

test("Vite plugins from astro.config are applied, so Tailwind generates snippet classes", async () => {
  const host = fixture("astro-tailwind");
  const [file, inline] = await Promise.all([
    shoot({ file: join(host, "Badge.tsx") }, { cwd: host, scale: 1 }),
    shoot({ code: '<div className="bg-[#00ffff] p-8">Hi</div>' }, { cwd: host, scale: 1 }),
  ]);
  expect(readPng(file[0]!.path).pixel(52, 52)).toEqual([255, 0, 255, 255]);
  expect(readPng(inline[0]!.path).pixel(52, 52)).toEqual([0, 255, 255, 255]);
});

test("content taller than the viewport is captured in full, not cut off", async () => {
  const host = fixture("react-vite-tailwind");
  const [shot] = await shoot(
    { code: '<div style={{ height: 1500, background: "#ff0000" }}>tall</div>' },
    { cwd: host, scale: 1 },
  );
  const png = readPng(shot!.path);
  expect(png.height).toBeGreaterThanOrEqual(1500);
  expect(png.pixel(20, 1400)).toEqual([255, 0, 0, 255]);
});
