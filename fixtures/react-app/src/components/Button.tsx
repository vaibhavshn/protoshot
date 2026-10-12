import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary:
    "bg-indigo-600 text-white shadow-sm shadow-indigo-900/20 hover:bg-indigo-500 focus-visible:outline-indigo-500",
  secondary:
    "bg-slate-200 text-slate-900 shadow-sm shadow-slate-900/10 hover:bg-slate-300 focus-visible:outline-slate-400",
  outline:
    "border border-slate-300 text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-slate-400",
  danger:
    "relative isolate overflow-hidden rounded-xl border border-white/15 bg-gradient-to-br from-rose-500 via-red-600 to-red-800 text-white shadow-lg shadow-red-950/30 before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.38),transparent_32%),linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.2)_45%,transparent_58%)] before:opacity-80 after:absolute after:inset-px after:-z-10 after:rounded-[inherit] after:ring-1 after:ring-white/20 hover:-translate-y-0.5 hover:from-rose-400 hover:via-red-500 hover:to-red-700 hover:shadow-xl hover:shadow-red-950/40 focus-visible:outline-red-500 active:translate-y-0 active:from-red-700 active:via-rose-700 active:to-red-900",
  ghost: "text-slate-700 hover:bg-slate-100 focus-visible:outline-slate-400",
};

const sizes = {
  sm: "px-2.5 py-1 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-6 py-3 text-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}
