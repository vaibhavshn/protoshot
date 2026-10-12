import { relative, sep } from "node:path";
import type { ShotError } from "./types.ts";

/**
 * Picks the error to report for one shot. The browser only knows that a module failed to load
 * (and which URL); Vite knows the file and line. Shots that rendered fine get no server error,
 * and a failing shot gets the Vite error whose file the browser's message names, else the first.
 */
export function attributeError(
  pageError: ShotError | undefined,
  serverErrors: ShotError[],
  hostRoot: string,
): ShotError | undefined {
  if (!pageError) return undefined;
  const named = serverErrors.find((error) => {
    if (!error.file) return false;
    const relativePath = relative(hostRoot, error.file).split(sep).join("/");
    return pageError.message.includes(error.file) || pageError.message.includes(relativePath);
  });
  return named ?? serverErrors[0] ?? pageError;
}
