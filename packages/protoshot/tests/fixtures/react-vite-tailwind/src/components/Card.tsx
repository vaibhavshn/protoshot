import { useContext } from "react";
import { ThemeContext } from "../theme.ts";

export function Card({ title }: { title: string }) {
  const theme = useContext(ThemeContext);
  // Solid blue only when the Wrapper's provider is active.
  const bg = theme ? "bg-[#0000ff]" : "bg-[#ff0000]";
  return <div className={`${bg} h-24 w-48 p-2 text-white`}>{title}</div>;
}
