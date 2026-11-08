"use client";

/**
 * A checkbox drawn as a switch: same semantics for screen readers (a
 * checkbox), the look people know from their phone settings.
 */
export function Switch({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-[52px] cursor-pointer items-center justify-between gap-4 rounded-2xl bg-surface p-4 shadow-card">
      <span className="flex flex-col">
        <span className="font-semibold">{label}</span>
        {hint && <span className="text-sm text-muted">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 size-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className="h-8 w-[52px] rounded-full border border-border bg-divider transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:opacity-50"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1 top-1 size-6 rounded-full bg-surface shadow-card transition-transform duration-200 peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}
