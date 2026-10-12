export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface OpenOptions {
  viewport: Viewport;
  scale: number;
  colorScheme: "light" | "dark";
}

export interface PageDiagnostics {
  consoleErrors: string[];
  warnings: string[];
}

export interface PageHandle {
  /** Everything the page has logged or failed to load so far. */
  diagnostics(): PageDiagnostics;
  goto(url: string): Promise<void>;
  /** Resolves once `expression` evaluates truthy in the page. */
  waitFor(expression: string, timeoutMs: number): Promise<void>;
  /** Evaluates `fn` in the page. */
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
  /** Waits for the network to be quiet for 500ms, giving up silently after `capMs`. */
  waitForNetworkIdle(capMs: number): Promise<void>;
  waitForSelector(selector: string, timeoutMs: number): Promise<void>;
  screenshot(options?: { clip?: Rect; fullPage?: boolean }): Promise<Uint8Array>;
  close(): Promise<void>;
}

/** The browser behind a small interface so it can be swapped out (ADR 0002). */
export interface Driver {
  open(options: OpenOptions): Promise<PageHandle>;
  close(): Promise<void>;
}
