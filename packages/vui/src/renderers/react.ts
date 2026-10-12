// Runs in the browser, served by the dev server as a virtual module so that "react" and
// "react-dom" resolve from the host project (ADR 0001). Keep it free of vui imports.
import { Component, createElement, Fragment, useEffect } from "react";
import type { ComponentType, ReactNode } from "react";
import { createRoot } from "react-dom/client";

export interface MountOptions {
  module: Record<string, unknown>;
  exportName: string;
  Wrapper?: ComponentType<{ children: ReactNode; colorScheme: "light" | "dark" }>;
  colorScheme: "light" | "dark";
  container: HTMLElement;
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(onReady, []);
  return null;
}

/** Plain-DOM error panel, so a failed run still produces a visible shot. */
export function showError(container: HTMLElement, message: string): void {
  const panel = document.createElement("pre");
  panel.setAttribute("data-vui-error", "");
  panel.style.cssText =
    "margin:0;padding:12px;max-width:640px;white-space:pre-wrap;font:13px/1.4 ui-monospace,monospace;color:#7f1d1d;background:#fee2e2;border:1px solid #dc2626";
  panel.textContent = message;
  container.replaceChildren(panel);
}

/** Catches render errors so the error panel is shown and reported instead of a blank page. */
class ErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state: { message: string | null } = { message: null };
  static getDerivedStateFromError(error: unknown) {
    return { message: (error as Error)?.message ?? String(error) };
  }
  componentDidCatch(error: unknown) {
    (window as unknown as { __vuiError?: unknown }).__vuiError = {
      message: (error as Error)?.message ?? String(error),
    };
  }
  render() {
    if (this.state.message === null) return this.props.children;
    return createElement(
      "pre",
      {
        "data-vui-error": "",
        style: {
          margin: 0,
          padding: 12,
          maxWidth: 640,
          whiteSpace: "pre-wrap",
          font: "13px/1.4 ui-monospace,monospace",
          color: "#7f1d1d",
          background: "#fee2e2",
          border: "1px solid #dc2626",
        },
      },
      this.state.message,
    );
  }
}

/** Mounts the snippet's export and resolves once React has committed it (or its error panel). */
export function mount(options: MountOptions): Promise<void> {
  const { module, exportName, Wrapper, colorScheme, container } = options;
  const Snippet = module[exportName] as ComponentType | undefined;
  if (Snippet === undefined) {
    throw new Error(`Snippet has no export named "${exportName}"`);
  }
  return new Promise((resolve) => {
    const content = createElement(Snippet);
    const wrapped = Wrapper ? createElement(Wrapper, { colorScheme, children: content }) : content;
    createRoot(container).render(
      createElement(
        Fragment,
        null,
        createElement(ErrorBoundary, null, wrapped),
        createElement(Ready, { onReady: resolve }),
      ),
    );
  });
}
