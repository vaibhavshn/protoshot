import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { acquireLock } from "../src/lock.ts";

const lockPath = () => join(mkdtempSync(join(tmpdir(), "vui-lock-")), "nested", "lock");

test("a second acquirer waits until the first releases", async () => {
  const file = lockPath();
  const release = await acquireLock(file);
  const events: string[] = [];
  const second = acquireLock(file, { pollMs: 10 }).then((r) => {
    events.push("second");
    return r;
  });
  await new Promise((r) => setTimeout(r, 100));
  expect(events).toEqual([]);
  release();
  (await second)();
  expect(events).toEqual(["second"]);
  expect(existsSync(file)).toBe(false);
});

test("a lock left behind by a dead process is recovered", async () => {
  const file = lockPath();
  (await acquireLock(file))();
  // Beyond any real pid on supported platforms.
  writeFileSync(file, "99999999");
  const release = await acquireLock(file, { pollMs: 10, timeoutMs: 2000 });
  release();
});

test("a lock held by a live process is not stolen, and waiting times out", async () => {
  const file = lockPath();
  const release = await acquireLock(file);
  await expect(acquireLock(file, { pollMs: 10, timeoutMs: 100 })).rejects.toThrow(/lock/i);
  release();
});
