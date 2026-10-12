/** A snippet file path, or inline source (a bare expression or a module). */
export type SnippetInput = { file: string } | { code: string };

export interface ShootOptions {
  /** Directory the run starts from; the host root is found by walking up from here. */
  cwd?: string;
  /** Default 1280x800. */
  viewport?: { width: number; height: number };
  /** Device scale factor. Default 2. */
  scale?: number;
  /** Capture the whole viewport instead of cropping to the content. */
  full?: boolean;
  /** Render in dark mode. */
  dark?: boolean;
  /** Extra wait before capture: milliseconds, or a CSS selector. */
  wait?: string;
}

export interface Shot {
  path: string;
  width: number;
  height: number;
  export: string;
}
