import type { Plugin } from "vite";

/**
 * Host Vite plugins protoshot drops, by `plugin.name`. An entry also drops its sub-plugins
 * (`name:*`). Plugins with `apply: "build"` need no entry: Vite skips them when serving.
 */
const IGNORED_PLUGINS = [
  // Platform emulators and server takeovers: they start runtimes or route every request.
  "vite-plugin-cloudflare", // @cloudflare/vite-plugin
  "vite-plugin-netlify", // @netlify/vite-plugin
  "@hono/vite-dev-server",
  "vite-plugin-electron", // launches the Electron app
  // Full-stack frameworks that own routing, SSR and the HTML.
  "react-router", // @react-router/dev
  "tanstack-react-start", // @tanstack/react-start
  "tanstack:router-generator", // @tanstack/router-plugin; writes routeTree.gen.ts
  "vike",
  // Serve over https or move the origin; protoshot loads http://127.0.0.1.
  "vite:basic-ssl", // @vitejs/plugin-basic-ssl
  "vite:plugin:mkcert", // vite-plugin-mkcert
  "laravel", // laravel-vite-plugin; also writes public/hot
  // Inject overlays into the page, which would end up in the shot.
  "@tanstack/devtools", // @tanstack/devtools-vite
  "react-scan",
  "vite-plugin-checker", // also spawns tsc/eslint workers
  // Slow side work, or a dev service worker that can serve stale pages.
  "vite:eslint2", // vite-plugin-eslint2
  "vite-plugin-pwa",
];

/** Flattens a config's `plugins` value (nested arrays, promises, falsy entries) into plugins. */
export async function flattenPlugins(value: unknown): Promise<Plugin[]> {
  const resolved = await value;
  if (Array.isArray(resolved)) return (await Promise.all(resolved.map(flattenPlugins))).flat();
  return resolved && typeof resolved === "object" ? [resolved as Plugin] : [];
}

/** `plugins` without the ones protoshot drops by default and the ones named in `extra`. */
export function withoutIgnoredPlugins(plugins: Plugin[], extra: string[] = []): Plugin[] {
  const ignored = [...IGNORED_PLUGINS, ...extra];
  return plugins.filter(
    ({ name }) => !ignored.some((entry) => name === entry || name.startsWith(`${entry}:`)),
  );
}

/** True when `plugins` already bring their own JSX transform (e.g. a hand-written Vite config). */
export const hasReactPlugin = (plugins: Plugin[]) =>
  plugins.some((plugin) => /^vite:react|^@vitejs\/plugin-react/.test(plugin.name));
