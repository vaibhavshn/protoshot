import { expect, test } from "vite-plus/test";
import { computeCrop } from "../src/capture.ts";

const page = { width: 1280, height: 800 };
const none = { top: 0, right: 0, bottom: 0, left: 0 };

test("content in the middle is padded by 16px on every side, all of it inside the page", () => {
  expect(computeCrop([{ x: 100, y: 100, width: 50, height: 50 }], page)).toEqual({
    clip: { x: 84, y: 84, width: 82, height: 82 },
    pad: none,
  });
});

test("padding that would fall before the page origin is synthesized, not dropped", () => {
  // Whatever the host's body margin: at 0, 8 or 16 the content ends up with the same 16px around it.
  for (const margin of [0, 8, 16]) {
    const crop = computeCrop([{ x: margin, y: margin, width: 100, height: 50 }], page)!;
    expect(crop.clip.width + crop.pad.left + crop.pad.right).toBe(132);
    expect(crop.clip.height + crop.pad.top + crop.pad.bottom).toBe(82);
    // Where the content lands in the output: padding before the clip, then its offset inside it.
    expect(crop.pad.left + (margin - crop.clip.x)).toBe(16);
    expect(crop.pad.top + (margin - crop.clip.y)).toBe(16);
  }
});

test("the crop is the union of all rects", () => {
  expect(
    computeCrop(
      [
        { x: 100, y: 100, width: 50, height: 50 },
        { x: 400, y: 300, width: 100, height: 100 },
      ],
      page,
    ),
  ).toEqual({ clip: { x: 84, y: 84, width: 432, height: 332 }, pad: none });
});

test("content flush with the far edges gets padding there too", () => {
  expect(computeCrop([{ x: 1180, y: 700, width: 100, height: 100 }], page)).toEqual({
    clip: { x: 1164, y: 684, width: 116, height: 116 },
    pad: { top: 0, right: 16, bottom: 16, left: 0 },
  });
});

test("content running past the page is cut at the edge, not padded", () => {
  expect(computeCrop([{ x: 1200, y: 100, width: 200, height: 50 }], page)).toEqual({
    clip: { x: 1184, y: 84, width: 96, height: 82 },
    pad: none,
  });
  expect(computeCrop([{ x: -50, y: 100, width: 100, height: 50 }], page)).toEqual({
    clip: { x: 0, y: 84, width: 66, height: 82 },
    pad: none,
  });
});

test("content taller than the viewport is not cut off", () => {
  expect(
    computeCrop([{ x: 32, y: 32, width: 900, height: 1500 }], { width: 1280, height: 1600 }),
  ).toEqual({ clip: { x: 16, y: 16, width: 932, height: 1532 }, pad: none });
});

test("absurdly tall content is capped, without bottom padding", () => {
  const crop = computeCrop([{ x: 0, y: 0, width: 100, height: 50_000 }], {
    width: 1280,
    height: 60_000,
  })!;
  expect(crop.clip.height).toBe(10_000);
  expect(crop.pad.bottom).toBe(0);
});

test("content entirely outside the page means no crop", () => {
  expect(computeCrop([{ x: 2000, y: 100, width: 50, height: 50 }], page)).toBeNull();
});

test("no rects means no crop", () => {
  expect(computeCrop([], page)).toBeNull();
});
