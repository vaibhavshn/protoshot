import { expect, test } from "vite-plus/test";
import { attributeError } from "../src/attribute.ts";

const a = { message: "bad a", file: "/host/src/a.tsx", line: 1 };
const b = { message: "bad b", file: "/host/src/b.tsx", line: 2 };

test("a shot that rendered fine gets no build error", () => {
  expect(attributeError(undefined, [a, b], "/host")).toBeUndefined();
});

test("a failing shot gets the build error for the module the browser names", () => {
  const page = { message: "Failed to fetch dynamically imported module: http://x/src/b.tsx" };
  expect(attributeError(page, [a, b], "/host")).toBe(b);
});

test("with no module named, the first build error is used; with none, the page error", () => {
  const page = { message: "boom" };
  expect(attributeError(page, [a, b], "/host")).toBe(a);
  expect(attributeError(page, [], "/host")).toBe(page);
});
