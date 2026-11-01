import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  loading?: boolean;
}

const variants = {
  primary: "bg-accent text-on-accent",
  secondary: "border border-border text-foreground",
};

/** 48 px high: comfortable for a thumb, on a phone held in one hand. */
export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading}
      className={`min-h-12 rounded-lg px-6 font-semibold disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {loading ? "Patientez…" : children}
    </button>
  );
}
