# protoshot monorepo

Source for [protoshot](packages/protoshot/README.md), a CLI that turns React UI source code into a screenshot, built for coding agents that need to see their UI changes.

Built with [Vite+](https://viteplus.dev/guide/) (`vp`) and pnpm workspaces.

## Layout

| Path                                       | What it is                                                            |
| ------------------------------------------ | --------------------------------------------------------------------- |
| [`packages/protoshot`](packages/protoshot) | The published `protoshot` CLI and library. Usage docs live here.      |
| [`fixtures/react-app`](fixtures/react-app) | Vite + React + Tailwind app used to try protoshot against a real app. |

The package's own test fixtures live in `packages/protoshot/tests/fixtures`. They are standalone projects, not workspace members.

## Development

Requires Node.js 22.18+ and the global [`vp`](https://viteplus.dev/guide/) CLI.

```bash
vp install          # install dependencies
vp run ready        # check, test and build everything
vp run -r test      # run all tests
vp run -r build     # build all packages
```

Working on protoshot:

```bash
cd packages/protoshot
vp run dev          # rebuild dist/ on change
vp test             # run the test suite
vp check            # format, lint and type check
```

To try the built CLI in the fixture app (it depends on `protoshot` via `workspace:*`):

```bash
cd fixtures/react-app
npx protoshot -e '<button>Hello</button>'
```

## Releasing

From `packages/protoshot`, bump the version with `bumpp`. `prepublishOnly` builds `dist/` before publishing.
