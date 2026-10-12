import { useContext } from "react";
import { ThemeContext } from "./theme.ts";

export default function Hello() {
  const theme = useContext(ThemeContext);
  return (
    <div
      className={theme ? "hello" : undefined}
      style={theme ? undefined : { background: "#ff0000", width: 192, height: 96 }}
    />
  );
}
