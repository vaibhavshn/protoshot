import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync } from "node:fs";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";
import { readPng, runCli } from "./helpers.ts";

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/missing") {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<body style='background:#00ff00'>nope</body>");
    } else if (req.url === "/redirect") {
      res.writeHead(302, { location: "http://redirect-target.test/" });
      res.end();
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        "<body style='margin:0;background:#00ff00'><script>console.error('x'.repeat(1000))</script></body>",
      );
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

test("a loopback page URL is shot at viewport size, with page console text labelled", async () => {
  const { code, stdout, stderr } = await runCli([
    `${base}/`,
    "--viewport",
    "400x300",
    "--scale",
    "1",
  ]);
  expect(code).toBe(0);
  const png = readPng(stdout.trim());
  expect([png.width, png.height]).toEqual([400, 300]);
  expect(png.pixel(10, 10)).toEqual([0, 255, 0, 255]);
  expect(stderr).toContain("console.error: [page] ");
});

test("an HTTP error page is still shot, with exit 1", async () => {
  const { code, stdout, stderr } = await runCli([`${base}/missing`]);
  expect(code).toBe(1);
  expect(existsSync(stdout.trim())).toBe(true);
  expect(stderr).toContain("HTTP 404");
});

test("a redirect to plain http on another host is blocked", async () => {
  const { code, stdout, stderr } = await runCli([`${base}/redirect`]);
  expect(code).toBe(2);
  expect(stdout).toBe("");
  expect(stderr).toContain("Plain http");
});

test("a refused connection fails with exit 2", async () => {
  const closed = createServer();
  await new Promise<void>((done) => closed.listen(0, "127.0.0.1", done));
  const { port } = closed.address() as AddressInfo;
  await new Promise((done) => closed.close(done));
  const { code, stderr } = await runCli([`http://127.0.0.1:${port}/`]);
  expect(code).toBe(2);
  expect(stderr).toContain("ERR_CONNECTION_REFUSED");
});
