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
import { importFromHost, resolveReact } from "./resolve.ts";

const TAILWIND_V4_IMPORT = /@import\s+["']tailwindcss["']/;
const SHIM_URL = "/__vui__/react-dom-client-shim.js";
const VITE_CONFIGS = ["ts", "mts", "js", "mjs", "cts", "cjs"].map((ext) => `vite.config.${ext}`);

export interface Server {
  /** Page URL for a shot of `exportName`. */
  pageUrl(exportName: string, colorScheme: "light" | "dark"): string;
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

export async function startServer(options: ServerOptions): Promise<Server> {
  const { host } = options;
  const react = resolveReact(host.root);
  const vite = await importFromHost<typeof import("vite")>("vite", host.root);
  const configFile = findViteConfig(host.root) ?? false;

  const server: ViteDevServer = await vite.createServer({
    root: host.root,
    configFile,
    appType: "custom",
    clearScreen: false,
    logLevel: "silent",
    plugins: [vuiPlugin(options, react.major)],
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
  await server.listen();
  const { port } = server.httpServer!.address() as AddressInfo;

  return {
    pageUrl: (exportName, colorScheme) =>
      `http://127.0.0.1:${port}${PAGE_URL}?export=${encodeURIComponent(exportName)}&scheme=${colorScheme}`,
    close: () => server.close(),
  };
}
