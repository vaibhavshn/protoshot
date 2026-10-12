import type { ReactNode } from "react";
import { ThemeContext } from "./theme.ts";

export default function Wrapper({
  children,
  colorScheme,
}: {
  children: ReactNode;
  colorScheme: "light" | "dark";
}) {
  return (
    <ThemeContext.Provider value={colorScheme === "dark" ? "night" : "day"}>
      {children}
    </ThemeContext.Provider>
  );
}
