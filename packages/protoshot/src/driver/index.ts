export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** CSS pixels of blank space to add around a screenshot, filled with `color` (any CSS color). */
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
  color: string;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface OpenOptions {
  viewport: Viewport;
  scale: number;
  colorScheme: "light" | "dark";
  /**
   * Called for every top-level navigation, redirects included. Returning true aborts it; subresource
   * requests are never asked about.
   */
  blockNavigation?: (url: string) => boolean;
}

/** The main document's response. */
export interface NavigationResult {
  status: number;
  statusText: string;
}

export interface PageDiagnostics {
  consoleErrors: string[];
  warnings: string[];
}

export interface PageHandle {
  /** Everything the page has logged or failed to load so far. */
  diagnostics(): PageDiagnostics;
  /** Resolves after the `load` event; null when there was no response (e.g. about:blank). */
  goto(url: string): Promise<NavigationResult | null>;
  /** Resolves once `expression` evaluates truthy in the page. */
  waitFor(expression: string, timeoutMs: number): Promise<void>;
  /** Evaluates `fn` in the page. */
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
  /** Waits for the network to be quiet for 500ms, giving up silently after `capMs`. */
  waitForNetworkIdle(capMs: number): Promise<void>;
  waitForSelector(selector: string, timeoutMs: number): Promise<void>;
  /** `pad` grows the shot beyond the page's edges, which a clip cannot reach. */
  screenshot(options?: { clip?: Rect; fullPage?: boolean; pad?: Padding }): Promise<Uint8Array>;
  close(): Promise<void>;
}

/** The browser behind a small interface so it can be swapped out (ADR 0002). */
export interface Driver {
  open(options: OpenOptions): Promise<PageHandle>;
  close(): Promise<void>;
}
