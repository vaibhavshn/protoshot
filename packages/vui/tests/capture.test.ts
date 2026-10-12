import { expect, test } from "vite-plus/test";
import { computeCrop } from "../src/capture.ts";

const viewport = { width: 1280, height: 800 };

test("a single rect is padded by 16px and clamped to the viewport origin", () => {
  expect(computeCrop([{ x: 10, y: 20, width: 100, height: 50 }], viewport)).toEqual({
    x: 0,
    y: 4,
    width: 126,
    height: 82,
  });
});

test("the crop is the union of all rects", () => {
  const crop = computeCrop(
    [
      { x: 100, y: 100, width: 50, height: 50 },
      { x: 400, y: 300, width: 100, height: 100 },
    ],
    viewport,
  );
  expect(crop).toEqual({ x: 84, y: 84, width: 432 - 0, height: 332 });
});

test("the crop never extends past the viewport", () => {
  expect(computeCrop([{ x: 1200, y: 780, width: 200, height: 100 }], viewport)).toEqual({
    x: 1184,
    y: 764,
    width: 96,
    height: 36,
  });
});

test("no rects means no crop", () => {
  expect(computeCrop([], viewport)).toBeNull();
});
