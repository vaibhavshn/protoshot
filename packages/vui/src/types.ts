export type SnippetInput = { file: string };

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
