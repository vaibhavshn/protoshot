import { existsSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { acquireLock } from "../src/lock.ts";

const lockPath = () => join(mkdtempSync(join(tmpdir(), "protoshot-lock-")), "nested", "lock");

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

test("an empty lock file left by a crash is recovered once it is old", async () => {
  const file = lockPath();
  (await acquireLock(file))();
  writeFileSync(file, "");
  const old = new Date(Date.now() - 60_000);
  utimesSync(file, old, old);
  const release = await acquireLock(file, { pollMs: 10, timeoutMs: 2000 });
  release();
});

test("a just-created empty lock file counts as live", async () => {
  const file = lockPath();
  (await acquireLock(file))();
  writeFileSync(file, "");
  await expect(acquireLock(file, { pollMs: 10, timeoutMs: 150 })).rejects.toThrow(/lock/i);
});

test("release leaves a lock that now belongs to someone else", async () => {
  const file = lockPath();
  const release = await acquireLock(file);
  writeFileSync(file, "424242:other");
  release();
  expect(existsSync(file)).toBe(true);
});

test("racing takeovers of a stale lock never overlap", async () => {
  const file = lockPath();
  (await acquireLock(file))();
  writeFileSync(file, "99999999");
  let holders = 0;
  let overlap = false;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      const release = await acquireLock(file, { pollMs: 2, timeoutMs: 5000 });
      holders++;
      if (holders > 1) overlap = true;
      await new Promise((r) => setTimeout(r, 15));
      holders--;
      release();
    }),
  );
  expect(overlap).toBe(false);
});
