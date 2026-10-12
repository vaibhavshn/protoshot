import type { ReactNode } from "react";

const variants = {
  neutral: "bg-slate-100 text-slate-700",
  brand: "bg-indigo-100 text-indigo-700",
  success: "bg-green-100 text-green-700",
  danger: "bg-red-100 text-red-700",
};

export function Badge({
  variant = "neutral",
  children,
}: {
  variant?: keyof typeof variants;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
