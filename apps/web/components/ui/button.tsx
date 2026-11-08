import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  /** Drawn before the label; decorative, the label carries the meaning. */
  icon?: ReactNode;
}

const variants = {
  primary:
    "bg-accent text-on-accent shadow-card hover:bg-accent-pressed active:bg-accent-pressed",
  secondary:
    "border border-border bg-surface text-foreground hover:bg-accent-soft active:bg-accent-soft",
  ghost: "text-foreground hover:bg-accent-soft active:bg-accent-soft",
};

/**
 * 52 px high: comfortable for a thumb, on a phone held in one hand. Pressing
 * shrinks it a little, so a tap always feels answered (UX rule 9).
 */
export function Button({
  variant = "primary",
  loading = false,
  disabled,
  icon,
  className = "",
  children,
  ...props
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-6 text-base font-semibold transition-transform duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${variants[variant]} ${className}`}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        icon
      )}
      {loading ? "Patientez…" : children}
    </button>
  );
}
