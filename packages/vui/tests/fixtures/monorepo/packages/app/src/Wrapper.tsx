import type { ReactNode } from "react";
import { ThemeContext } from "./theme.ts";

export default function Wrapper({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value="day">{children}</ThemeContext.Provider>;
}
