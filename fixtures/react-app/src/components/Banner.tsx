import type { ReactNode } from "react";

const variants = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  success: "border-green-200 bg-green-50 text-green-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};

export interface BannerProps {
  variant?: keyof typeof variants;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Banner({ variant = "info", title, children, className = "" }: BannerProps) {
  return (
    <div role="alert" className={`rounded-md border p-4 ${variants[variant]} ${className}`}>
      {title && <p className="font-semibold">{title}</p>}
      <div className="text-sm">{children}</div>
    </div>
  );
}
