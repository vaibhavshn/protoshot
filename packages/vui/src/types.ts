/** A snippet file path, or inline source (a bare expression or a module). */
export type SnippetInput = { file: string } | { code: string };

export interface ShootOptions {
  /** Directory the run starts from; the host root is found by walking up from here. */
  cwd?: string;
}

export interface Shot {
  path: string;
  width: number;
  height: number;
  export: string;
}
