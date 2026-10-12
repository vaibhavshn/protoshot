## Previewing UI with vui

Use `vui` to render a UI snippet in the real app styles and get a PNG back to look at. It prints the path of each shot.

```sh
vui src/components/Button.tsx        # render a snippet file
vui - <<'EOF'                        # render a snippet from stdin
<Button variant="primary">Save</Button>
EOF
vui -e '<Badge>New</Badge>'          # render an inline snippet
```

- `--json` prints an array with one object per shot (path, export, error, console errors, warnings) instead of bare paths.
- `--all` renders every variant a snippet file exports, one shot each.
- `--dark` renders in dark mode.
- A non-zero exit code means the build, render or console reported an error; read stderr.
