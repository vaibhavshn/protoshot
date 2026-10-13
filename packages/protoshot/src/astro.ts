import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { ConfigError } from "./errors.ts";
import { flattenPlugins, withoutIgnoredPlugins } from "./plugins.ts";

const ASTRO_CONFIGS = ["mjs", "ts", "mts", "js", "cjs", "cts"].map((ext) => `astro.config.${ext}`);

export function findAstroConfig(root: string): string | undefined {
  return ASTRO_CONFIGS.map((name) => join(root, name)).find((file) => existsSync(file));
}

export interface AstroVite {
  plugins: Plugin[];
  alias: { find: string | RegExp; replacement: string }[];
}

/**
 * Astro keeps the host's Vite settings under `vite` in `astro.config.*`. protoshot can't run Astro
 * itself, so it evaluates the config file and takes those plugins and aliases (Tailwind, usually).
 */
export async function loadAstroVite(
  vite: typeof import("vite"),
  root: string,
  file: string,
  ignorePlugins: string[] = [],
): Promise<AstroVite> {
  let config: { vite?: { plugins?: unknown; resolve?: { alias?: unknown } } } | undefined;
  try {
    const loaded = await vite.loadConfigFromFile(
      { command: "serve", mode: "development" },
      file,
      root,
    );
    config = loaded?.config as typeof config;
  } catch (error) {
    throw new ConfigError(`${file}: could not be loaded (${(error as Error).message})`);
  }
  const plugins = withoutIgnoredPlugins(await flattenPlugins(config?.vite?.plugins), ignorePlugins);
  const alias = config?.vite?.resolve?.alias;
  return {
    plugins,
    alias: Array.isArray(alias)
      ? (alias as AstroVite["alias"])
      : Object.entries((alias ?? {}) as Record<string, string>).map(([find, replacement]) => ({
          find,
          replacement,
        })),
  };
}
