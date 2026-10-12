export interface Viewport {
  width: number;
  height: number;
}

export interface OpenOptions {
  viewport: Viewport;
  scale: number;
  colorScheme: "light" | "dark";
}

export interface PageHandle {
  goto(url: string): Promise<void>;
  /** Resolves once `expression` evaluates truthy in the page. */
  waitFor(expression: string, timeoutMs: number): Promise<void>;
  screenshot(): Promise<Uint8Array>;
  close(): Promise<void>;
}

/** The browser behind a small interface so it can be swapped out (ADR 0002). */
export interface Driver {
  open(options: OpenOptions): Promise<PageHandle>;
  close(): Promise<void>;
}
