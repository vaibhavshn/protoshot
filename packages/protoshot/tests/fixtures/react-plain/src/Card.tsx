import { useContext } from "react";
import { ThemeContext } from "./theme.ts";

export function Card() {
  const theme = useContext(ThemeContext);
  // Blue (from styles.css) only when the Wrapper's provider is active.
  return (
    <div
      className={theme ? "card" : undefined}
      style={theme ? undefined : { background: "#ff0000", width: 192, height: 96 }}
    />
  );
}
