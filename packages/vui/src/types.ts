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
  /** Shoot this one component export (`default` for the default export). */
  export?: string;
  /** Shoot every component export. */
  all?: boolean;
  /** Render in dark mode. */
  dark?: boolean;
  /** Extra wait before capture: milliseconds, or a CSS selector. */
  wait?: string;
}

export interface ShotError {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  frame?: string;
}

export interface Shot {
  path: string;
  width: number;
  height: number;
  export: string;
  /** console.error output, uncaught page errors and failed requests. */
  consoleErrors: string[];
  /** console.warn output. */
  warnings: string[];
  /** Set when the snippet failed to build or render; the shot then shows the error. */
  error?: ShotError;
}
