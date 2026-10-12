/** A snippet file path, or inline source (a bare expression or a module). */
export type SnippetInput = { file: string } | { code: string };

export interface ShootOptions {
  /** Directory the run starts from; the host root is found by walking up from here. */
  cwd?: string;
  /** Stylesheets to load, relative to `cwd`; replaces `vui.json` and auto-detection. */
  css?: string[];
  /** Component roots, relative to `cwd`; replaces `vui.json` and auto-detection. */
  components?: string[];
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
  /** Directory for the PNGs. Default: `$VUI_OUT_DIR`, else a per-host directory in the OS temp dir. */
  outDir?: string;
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
  /** Empty when this shot could not be captured at all (see `error`). */
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
