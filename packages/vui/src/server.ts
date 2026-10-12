import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import type { Host } from "./host.ts";
import {
  ENTRY_URL,
  PAGE_URL,
  REACT17_CLIENT_SHIM,
  RENDERER_URL,
  entrySource,
  pageHtml,
} from "./page/template.ts";
import rendererSource from "./renderers/react.ts?raw";
import { buildAliases } from "./aliases.ts";
import { acquireLock } from "./lock.ts";
import { importFromHost, resolveReact } from "./resolve.ts";
import type { ShotError } from "./types.ts";

const TAILWIND_V4_IMPORT = /@import\s+["']tailwindcss["']/;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
const SHIM_URL = "/__vui__/react-dom-client-shim.js";
const VITE_CONFIGS = ["ts", "mts", "js", "mjs", "cts", "cjs"].map((ext) => `vite.config.${ext}`);

export interface Server {
  /** Page URL for a shot of `exportName`. */
  pageUrl(exportName: string, colorScheme: "light" | "dark"): string;
  /** Build errors (transform, resolve, syntax) Vite has reported so far, oldest first. */
  errors(): ShotError[];
  /** Releases the cold-start lock once the first page has loaded (the first optimize is done). */
  warmed(): void;
  close(): Promise<void>;
}

export interface ServerOptions {
  host: Host;
  /** Absolute path of the snippet module to render. */
  snippet: string;
}

function findViteConfig(root: string): string | undefined {
  return VITE_CONFIGS.map((name) => join(root, name)).find((file) => existsSync(file));
}

function vuiPlugin(options: ServerOptions, reactMajor: number): Plugin {
  const { host, snippet } = options;
  const resolveConfigPath = (file: string) => join(host.root, file);
  const virtual = new Map<string, string>([
    [RENDERER_URL, rendererSource],
    [
      ENTRY_URL,
      entrySource({
        css: host.config.css.map(resolveConfigPath),
        wrapper: host.config.wrapper ? resolveConfigPath(host.config.wrapper) : undefined,
        snippet,
        darkClass: host.config.darkClass,
      }),
    ],
    [SHIM_URL, REACT17_CLIENT_SHIM],
  ]);
  return {
    name: "vui",
    enforce: "pre",
    resolveId(id) {
      if (reactMajor < 18 && id === "react-dom/client") return SHIM_URL;
      if (virtual.has(id)) return id;
    },
    load(id) {
      return virtual.get(id);
    },
    configResolved(config) {
      // Host plugins come first; the CSS tooling has to see our @source before it generates.
      const plugins = config.plugins as Plugin[];
      const self = plugins.findIndex((plugin) => plugin.name === "vui");
      plugins.unshift(...plugins.splice(self, 1));
    },
    transform(code, id) {
      // Tailwind v4 skips gitignored directories, and .vui/ is one; point it at our snippets.
      if (!id.split("?")[0]!.endsWith(".css") || !TAILWIND_V4_IMPORT.test(code)) return;
      return `${code}\n@source ${JSON.stringify(join(host.root, ".vui", "snippets"))};\n`;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(PAGE_URL)) return next();
        const html = await server.transformIndexHtml(req.url, pageHtml());
        res.setHeader("Content-Type", "text/html");
        res.end(html);
      });
    },
  };
}

interface ViteError extends Error {
  loc?: { file?: string; line?: number; column?: number };
  id?: string;
  frame?: string;
}

/**
 * Vite's esbuild-style errors carry `loc` and `frame`; Rolldown's carry neither and only embed a
 * rendered `╭─[ file:line:col ]` frame in the message, so that is parsed as a fallback.
 */
function toShotError(logged: string, error: ViteError | undefined): ShotError {
  const text = (error?.message ?? logged).replace(ANSI, "");
  const rendered = /^.*╭─\[ (.+?):(\d+):(\d+) \][\s\S]*?╯/m.exec(text);
  const summary = /^\[[A-Z_]+\] (.+)$/m.exec(text)?.[1];
  return {
    message: summary ?? text,
    file: error?.loc?.file ?? error?.id ?? rendered?.[1],
    line: error?.loc?.line ?? (rendered ? Number(rendered[2]) : undefined),
    column: error?.loc?.column ?? (rendered ? Number(rendered[3]) : undefined),
    frame: error?.frame?.replace(ANSI, "") ?? rendered?.[0],
  };
}

export async function startServer(options: ServerOptions): Promise<Server> {
  const { host } = options;
  const react = resolveReact(host.root);
  const vite = await importFromHost<typeof import("vite")>("vite", host.root);
  const hostConfigFile = findViteConfig(host.root);
  // Without a Vite config of its own, the host needs React's JSX transform and its tsconfig aliases.
  const hostPlugins = hostConfigFile
    ? []
    : [
        (
          await importFromHost<{ default: () => Plugin }>("@vitejs/plugin-react", host.root)
        ).default(),
      ];

  const errors: ShotError[] = [];
  const logger = vite.createLogger("error", { allowClearScreen: false });
  logger.error = (message, options) => {
    // The dependency scan reports the same parse error without a location; skip it.
    if (message.includes("Failed to run dependency scan")) return;
    errors.push(toShotError(message, options?.error as ViteError | undefined));
  };

  // Parallel cold runs would race to write the same optimized-deps cache; take turns instead.
  const releaseLock = await acquireLock(join(host.root, ".vui", "lock"));
  let server: ViteDevServer;
  try {
    server = await createViteServer();
    await server.listen();
  } catch (error) {
    releaseLock();
    throw error;
  }
  const { port } = server.httpServer!.address() as AddressInfo;

  return {
    pageUrl: (exportName, colorScheme) =>
      `http://127.0.0.1:${port}${PAGE_URL}?export=${encodeURIComponent(exportName)}&scheme=${colorScheme}`,
    errors: () => errors,
    warmed: releaseLock,
    close: async () => {
      releaseLock();
      await server.close();
    },
  };

  function createViteServer(): Promise<ViteDevServer> {
    return vite.createServer({
      // Private to vui, so the host's own dev server cache is never disturbed.
      cacheDir: join(host.root, "node_modules", ".vite-vui"),
      customLogger: logger,
      root: host.root,
      configFile: hostConfigFile ?? false,
      appType: "custom",
      clearScreen: false,
      logLevel: "silent",
      plugins: [...hostPlugins, vuiPlugin(options, react.major)],
      resolve: { alias: buildAliases(host, !hostConfigFile) },
      server: {
        host: "127.0.0.1",
        port: 0,
        strictPort: true,
        hmr: false,
        watch: null,
        fs: { strict: false },
      },
      optimizeDeps: {
        entries: [options.snippet],
        include: [
          "react",
          "react/jsx-dev-runtime",
          react.major >= 18 ? "react-dom/client" : "react-dom",
        ],
      },
    });
  }
}
