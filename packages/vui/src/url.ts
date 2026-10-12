import { isIP } from "node:net";
import { UsageError } from "./errors.ts";

/** Longest page-authored console message passed on to the agent. */
const MAX_PAGE_MESSAGE = 300;

/** Whether a command-line target is a Page URL rather than a snippet path. */
export function isPageUrl(target: string): boolean {
  return /^https?:\/\//i.test(target);
}

/** Loopback hosts, where plain http is allowed (ADR 0004). `0.0.0.0` is deliberately not one. */
function isLoopback(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1") return true;
  return isIP(host) === 4 && host.startsWith("127.");
}

/** Why `url` may not be navigated to, or undefined when it may (ADR 0004). */
export function navigationProblem(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `Not a valid URL: ${url}`;
  }
  if (parsed.protocol === "https:") return undefined;
  if (parsed.protocol === "http:") {
    return isLoopback(parsed.hostname)
      ? undefined
      : `Plain http is only allowed for localhost and 127.0.0.1; use https for ${parsed.host}`;
  }
  return `Only http and https URLs can be shot (got ${parsed.protocol})`;
}

/** Checks the URL given on the command line; throws a usage error when it is not allowed. */
export function assertPageUrl(url: string): void {
  const problem = navigationProblem(url);
  if (problem) throw new UsageError(problem);
}

/** Labels and truncates console text, which the page controls (ADR 0004). */
export function labelPageMessage(message: string): string {
  const text =
    message.length > MAX_PAGE_MESSAGE ? `${message.slice(0, MAX_PAGE_MESSAGE)}…` : message;
  return `[page] ${text}`;
}
