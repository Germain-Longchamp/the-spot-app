import type { ReactNode } from "react";
import { AlertIcon } from "@/components/ui/icons";

/** Never colour alone: an icon and a sentence (UX rule 5). */
export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-surface p-4 font-semibold text-danger"
    >
      <AlertIcon size={20} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
