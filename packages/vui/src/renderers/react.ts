// Runs in the browser, served by the dev server as a virtual module so that "react" and
// "react-dom" resolve from the host project (ADR 0001). Keep it free of vui imports.
import { createElement, Fragment, useEffect } from "react";
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

/** Mounts the snippet's export and resolves once React has committed it. */
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
      createElement(Fragment, null, wrapped, createElement(Ready, { onReady: resolve })),
    );
  });
}
