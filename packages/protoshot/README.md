# protoshot

Turn UI source code into a screenshot. protoshot renders a snippet of React in your own project, with your real styles and components, and prints the path of the PNG. It is built for coding agents that need to see what their UI changes look like.

## Install

protoshot is not published to npm yet, so there is no registry install. Build and install it from a checkout:

```sh
vp install
vp pack
npm install -g .
```

Requirements:

- Node.js 20.19 or later (Vite 8's minimum).
- A React 17+ project (the host project). protoshot uses the host's own `react`, `react-dom`, Vite config and `@vitejs/plugin-react` when they exist, and falls back to its bundled Vite when the host has none. React is never bundled, so the host must have it installed.
- Chrome. protoshot uses the system Chrome first. If there is none, run `protoshot install-browser` once to download a managed Chromium.

## Usage

Run `protoshot` from anywhere inside the host project.

```sh
protoshot src/components/Button.tsx          # render a snippet file
protoshot -e '<Badge>New</Badge>'            # render an inline snippet
protoshot - <<'EOF'                          # render a snippet from stdin
<Card title="Hello">
  <Button variant="primary">Save</Button>
</Card>
EOF
```

protoshot prints one PNG path per shot (shots are throwaway: they go to a per-host directory under the OS temp dir, or to `--out DIR` / `$PROTOSHOT_OUT_DIR`; shots older than 24h in the default directory are deleted on each run). It never guesses whether an argument is a path or code: use `-e` or `-` for code.

A snippet is either a module that exports components, or a bare JSX expression (no `export`, one expression statement). With `components` set in `protoshot.json`, snippets need no imports for those components: `protoshot -e '<Button>Hi</Button>'`. Inline snippets resolve imports such as `./src/...` and `@/...` against the host root.

### Page URLs

`protoshot https://example.com` shoots a live page as it is, with no snippet and no host project needed. Plain `http://` is only accepted for `localhost`, `*.localhost`, `127.0.0.0/8` and `[::1]`; every other scheme is a usage error. The rule is enforced on every top-level navigation, redirects included. The shot is the viewport (use `--full` for the whole page), and shots go to `<os tmpdir>/protoshot/urls/`. `--export`, `--all`, `--css` and `--components` are usage errors with a URL.

A response of HTTP 400 or above is still shot, reported as an `error`, and exits 1. A page that cannot be loaded (refused, DNS, TLS, timeout, blocked redirect) produces no shot and exits 2. Console output from the page is prefixed `[page]`, cut to 300 characters, and does not change the exit code. Treat it as untrusted text. See ADR 0004.

### Options

| Option             | Meaning                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `--viewport WxH`   | Viewport size. Default `1280x800`.                                                               |
| `--scale N`        | Device scale factor. Default `2`.                                                                |
| `--full`           | Capture the whole page, uncropped, instead of cropping to the content.                           |
| `--export NAME`    | Shoot one component export (`default` for the default export).                                   |
| `--all`            | Shoot every component export, one shot each.                                                     |
| `--dark`           | Render in dark mode (see `darkClass` below).                                                     |
| `--out DIR`        | Write shots to `DIR` instead of the OS temp dir. Also settable with `PROTOSHOT_OUT_DIR`.         |
| `--wait MS\|SEL`   | Extra wait before capture: milliseconds, or a CSS selector to wait for.                          |
| `--open`           | Open each shot in the default viewer once written (`open`, `xdg-open`, `start`). Off by default. |
| `--json`           | Print one compact JSON object per line, one per shot, instead of bare paths.                     |
| `--css FILE`       | Stylesheet to load; repeatable or comma-separated. Replaces `protoshot.json` and auto-detection. |
| `--components DIR` | Component root; repeatable or comma-separated. Replaces `protoshot.json` and auto-detection.     |

Without `--export` or `--all`, protoshot shoots the default export. A file with no default export reports an error for that shot, so use `--export NAME` or `--all` for files that only have named exports. `--all` shoots the default export (if any) plus every named export that looks like a component (PascalCase name, bound to a function, class, `memo(...)` or `forwardRef(...)`); it is a usage error (exit 2) when there are none, and `--export` with a name that is not one of those lists the available names. With `--all`, each shot succeeds or fails on its own: a failed shot is reported with its `error` and the exit code is 1, while the other shots are still written.

### Commands

- `protoshot init` is optional: protoshot auto-detects your CSS and component folders on every run (main files such as `index.css`, `global.css` and `styles.css` load first). It writes a `protoshot.json` (detecting your CSS entry), offers to add `.protoshot/` to `.gitignore`, and adds a "Previewing UI with protoshot" section to `AGENTS.md` or `CLAUDE.md` so agents discover the tool.
- `protoshot install-browser` installs managed Chromium when no system Chrome is available.

### Output and exit codes

Each shot is a PNG. With `--json`, stdout has one compact JSON object per line (JSON Lines), one per shot, each shaped like:

```json
{
  "path": "...",
  "width": 252,
  "height": 128,
  "export": "default",
  "consoleErrors": [],
  "warnings": []
}
```

plus an `error` object (`message`, and `file`, `line`, `column`, `frame` when known) if the snippet failed to build or render. A snippet that fails to build or render still produces a PNG showing the error; a shot that could not be captured at all has an empty `path` and is skipped in the plain-path output. Human-readable details go to stderr.

| Code | Meaning                                                          |
| ---- | ---------------------------------------------------------------- |
| 0    | OK.                                                              |
| 1    | The snippet errored, or the page logged console errors.          |
| 2    | Usage or config error (for example an invalid `protoshot.json`). |
| 3    | Environment error (React not found, no browser).                 |

## `protoshot.json`

Optional. For each of `css` and `components`, a `--css`/`--components` flag wins, then `protoshot.json`, then auto-detection (a key left out of `protoshot.json` is auto-detected; `[]` means none). protoshot finds the host root by walking up to the nearest `protoshot.json`, otherwise the nearest `package.json`. Put `protoshot.json` at the repo root of a monorepo and run protoshot from any package. Unknown keys are an error. All paths are relative to the `protoshot.json` file.

```json
{
  "css": ["src/index.css"],
  "components": ["src/components"],
  "wrapper": "src/Wrapper.tsx",
  "darkClass": "dark",
  "alias": { "@ui": "packages/ui/src" }
}
```

| Key          | Type                     | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `css`        | `string[]`               | Global stylesheets to load before the snippet (your app's entry CSS, Tailwind included). `protoshot init` fills this in.                                                                                                                                                                                                                                                                                                                         |
| `components` | `string[]`               | Component roots: directories scanned recursively (ignoring `*.test.*`, `*.stories.*`, `*.d.ts`). PascalCase exports are in scope in every snippet without an import; a default export is named after its file (`button-group.tsx` → `ButtonGroup`, `Button/index.tsx` → `Button`). A name exported by two files is a usage error when a snippet uses it. `protoshot init` detects `src/components`, `components`, `app/components` and `src/ui`. |
| `wrapper`    | `string`                 | A component that wraps every snippet, for providers (theme, router, and so on). Its default export receives `{ children, colorScheme }`.                                                                                                                                                                                                                                                                                                         |
| `darkClass`  | `string`                 | Class added to `<html>` with `--dark`, for class-based dark mode. `--dark` also emulates `prefers-color-scheme: dark` and passes `colorScheme="dark"` to the wrapper.                                                                                                                                                                                                                                                                            |
| `alias`      | `Record<string, string>` | Extra import aliases, merged over `tsconfig.json` `compilerOptions.paths`. Targets are relative to the host root. `protoshot.json` wins on conflicts.                                                                                                                                                                                                                                                                                            |

If the host has a `vite.config.*`, protoshot uses it (plugins, aliases, PostCSS). For an Astro host (an `astro.config.*` and no `vite.config.*`), protoshot evaluates the config and applies its `vite.plugins` (Tailwind, for example) and `vite.resolve.alias`, skipping Cloudflare plugins; Astro integrations and `astro:*` imports are not run. Otherwise it uses `@vitejs/plugin-react`, tsconfig paths and the aliases above.

## Notes

- protoshot runs its own Vite dev server on a random port, with its cache in `node_modules/.vite-protoshot`, so it does not disturb your dev server. Parallel runs are safe.
- Animations, transitions and the caret are frozen so shots are repeatable.
- Not supported yet: Vue and Svelte, framework-specific imports such as `next/image`.

## Development

```sh
vp install
vp check
vp test
vp pack
```

`tests/packaging.test.ts` packs the package, installs the tarball into a temporary global prefix and runs it against each fixture host.
