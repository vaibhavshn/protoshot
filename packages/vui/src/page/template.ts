export const RENDERER_URL = "/__vui__/renderer.ts";
export const ENTRY_URL = "/__vui__/entry.tsx";
export const PAGE_URL = "/__vui__/index.html";

export function pageHtml(): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
<div id="root"></div>
<script type="module" src="${ENTRY_URL}"></script>
</body>
</html>
`;
}

export interface EntryOptions {
  css: string[];
  wrapper?: string;
  snippet: string;
  darkClass?: string;
}

/** Client entry: loads host CSS, Wrapper and snippet, then hands them to the renderer. */
export function entrySource(options: EntryOptions): string {
  const q = JSON.stringify;
  return `import { mount } from ${q(RENDERER_URL)};
const params = new URLSearchParams(location.search);
const colorScheme = params.get("scheme") === "dark" ? "dark" : "light";
const darkClass = ${q(options.darkClass ?? null)};
if (colorScheme === "dark" && darkClass) document.documentElement.classList.add(darkClass);
${options.css.map((file) => `await import(${q(file)});`).join("\n")}
const Wrapper = ${options.wrapper ? `(await import(${q(options.wrapper)})).default` : "undefined"};
const module = await import(${q(options.snippet)});
await mount({
  module,
  exportName: params.get("export") ?? "default",
  Wrapper,
  colorScheme,
  container: document.getElementById("root"),
});
window.__vuiMounted = true;
`;
}

/** React 17 has no react-dom/client; this maps createRoot onto the legacy API. */
export const REACT17_CLIENT_SHIM = `import ReactDOM from "react-dom";
export function createRoot(container) {
  return {
    render: (element) => ReactDOM.render(element, container),
    unmount: () => ReactDOM.unmountComponentAtNode(container),
  };
}
`;
