import { expect, test } from "vite-plus/test";
import { openCommand } from "../src/open.ts";
import { isPageUrl, labelPageMessage, navigationProblem } from "../src/url.ts";

test("only http(s) targets are page URLs", () => {
  expect(isPageUrl("https://example.com")).toBe(true);
  expect(isPageUrl("http://localhost:3000")).toBe(true);
  expect(isPageUrl("Button.tsx")).toBe(false);
  expect(isPageUrl("file:///etc/passwd")).toBe(false);
});

test("https is allowed anywhere", () => {
  expect(navigationProblem("https://example.com/a?b=1")).toBeUndefined();
});

test("plain http is allowed on loopback only", () => {
  for (const url of [
    "http://localhost:5173",
    "http://app.localhost",
    "http://127.0.0.1:8080",
    "http://127.0.0.2",
    "http://[::1]:3000",
  ])
    expect(navigationProblem(url), url).toBeUndefined();
  for (const url of [
    "http://example.com",
    "http://0.0.0.0:3000",
    "http://192.168.1.5",
    "http://127.0.0.1.evil.com",
  ])
    expect(navigationProblem(url), url).toContain("https");
});

test("other schemes are rejected", () => {
  for (const url of [
    "file:///etc/passwd",
    "chrome://settings",
    "javascript:alert(1)",
    "data:text/html,hi",
  ])
    expect(navigationProblem(url), url).toContain("Only http and https");
});

test("page console text is labelled and truncated", () => {
  expect(labelPageMessage("boom")).toBe("[page] boom");
  expect(labelPageMessage("x".repeat(1000)).length).toBeLessThan(320);
});

test("--open picks the opener for each OS", () => {
  expect(openCommand("/a.png", "darwin")).toEqual({ command: "open", args: ["/a.png"] });
  expect(openCommand("/a.png", "linux").command).toBe("xdg-open");
  expect(openCommand("C:\\a.png", "win32").command).toBe("cmd");
});
