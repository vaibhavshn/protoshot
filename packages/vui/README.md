# vui

Turn UI source code into a screenshot. vui renders a snippet of React in your own project, with your real styles and components, and prints the path of the PNG. It is built for coding agents that need to see what their UI changes look like.

## Install

vui is not published to npm yet, so there is no registry install. Build and install it from a checkout:

```sh
vp install
vp pack
npm install -g .
```

Requirements:

- Node.js 20.19 or later (Vite 8's minimum).
- A React 17+ project (the host project). vui uses the host's own `react`, `react-dom`, Vite config and `@vitejs/plugin-react` when they exist, and falls back to its bundled Vite when the host has none. React is never bundled, so the host must have it installed.
- Chrome. vui uses the system Chrome first. If there is none, run `vui install-browser` once to download a managed Chromium.

## Usage

Run `vui` from anywhere inside the host project.

```sh
vui src/components/Button.tsx          # render a snippet file
vui -e '<Badge>New</Badge>'            # render an inline snippet
vui - <<'EOF'                          # render a snippet from stdin
<Card title="Hello">
  <Button variant="primary">Save</Button>
</Card>
EOF
```

vui prints one PNG path per shot (shots are written to `<host root>/.vui/shots/`). It never guesses whether an argument is a path or code: use `-e` or `-` for code.

A snippet is either a module that exports components, or a bare JSX expression (no `export`, one expression statement). With `components` set in `vui.json`, snippets need no imports for those components: `vui -e '<Button>Hi</Button>'`. Inline snippets resolve imports such as `./src/...` and `@/...` against the host root.

### Options

| Option           | Meaning                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `--viewport WxH` | Viewport size. Default `1280x800`.                                      |
| `--scale N`      | Device scale factor. Default `2`.                                       |
| `--full`         | Capture the whole page, uncropped, instead of cropping to the content.  |
| `--export NAME`  | Shoot one component export (`default` for the default export).          |
| `--all`          | Shoot every component export, one shot each.                            |
| `--dark`         | Render in dark mode (see `darkClass` below).                            |
| `--wait MS\|SEL` | Extra wait before capture: milliseconds, or a CSS selector to wait for. |
| `--json`         | Print one JSON object per shot instead of bare paths.                   |

Without `--export` or `--all`, vui shoots the default export. A file with no default export reports an error for that shot, so use `--export NAME` or `--all` for files that only have named exports. `--all` shoots the default export (if any) plus every named export that looks like a component (PascalCase name, bound to a function, class, `memo(...)` or `forwardRef(...)`); it is a usage error (exit 2) when there are none, and `--export` with a name that is not one of those lists the available names. With `--all`, each shot succeeds or fails on its own: a failed shot is reported with its `error` and the exit code is 1, while the other shots are still written.

### Commands

- `vui init` writes a `vui.json` (detecting your CSS entry), offers to add `.vui/` to `.gitignore`, and adds a "Previewing UI with vui" section to `AGENTS.md` or `CLAUDE.md` so agents discover the tool.
- `vui install-browser` installs managed Chromium when no system Chrome is available.

### Output and exit codes

Each shot is a PNG. With `--json`, stdout is an array of:

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

| Code | Meaning                                                    |
| ---- | ---------------------------------------------------------- |
| 0    | OK.                                                        |
| 1    | The snippet errored, or the page logged console errors.    |
| 2    | Usage or config error (for example an invalid `vui.json`). |
| 3    | Environment error (React not found, no browser).           |

## `vui.json`

Optional. vui finds the host root by walking up to the nearest `vui.json`, otherwise the nearest `package.json`. Put `vui.json` at the repo root of a monorepo and run vui from any package. Unknown keys are an error. All paths are relative to the `vui.json` file.

```json
{
  "css": ["src/index.css"],
  "components": ["src/components"],
  "wrapper": "src/Wrapper.tsx",
  "darkClass": "dark",
  "alias": { "@ui": "packages/ui/src" }
}
```

| Key          | Type                     | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `css`        | `string[]`               | Global stylesheets to load before the snippet (your app's entry CSS, Tailwind included). `vui init` fills this in.                                                                                                                                                                                                                                                                                                                         |
| `components` | `string[]`               | Component roots: directories scanned recursively (ignoring `*.test.*`, `*.stories.*`, `*.d.ts`). PascalCase exports are in scope in every snippet without an import; a default export is named after its file (`button-group.tsx` → `ButtonGroup`, `Button/index.tsx` → `Button`). A name exported by two files is a usage error when a snippet uses it. `vui init` detects `src/components`, `components`, `app/components` and `src/ui`. |
| `wrapper`    | `string`                 | A component that wraps every snippet, for providers (theme, router, and so on). Its default export receives `{ children, colorScheme }`.                                                                                                                                                                                                                                                                                                   |
| `darkClass`  | `string`                 | Class added to `<html>` with `--dark`, for class-based dark mode. `--dark` also emulates `prefers-color-scheme: dark` and passes `colorScheme="dark"` to the wrapper.                                                                                                                                                                                                                                                                      |
| `alias`      | `Record<string, string>` | Extra import aliases, merged over `tsconfig.json` `compilerOptions.paths`. Targets are relative to the host root. `vui.json` wins on conflicts.                                                                                                                                                                                                                                                                                            |

If the host has a `vite.config.*`, vui uses it (plugins, aliases, PostCSS). For an Astro host (an `astro.config.*` and no `vite.config.*`), vui evaluates the config and applies its `vite.plugins` (Tailwind, for example) and `vite.resolve.alias`, skipping Cloudflare plugins; Astro integrations and `astro:*` imports are not run. Otherwise it uses `@vitejs/plugin-react`, tsconfig paths and the aliases above.

## Notes

- vui runs its own Vite dev server on a random port, with its cache in `node_modules/.vite-vui`, so it does not disturb your dev server. Parallel runs are safe.
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
