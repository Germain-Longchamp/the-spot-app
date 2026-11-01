import type { ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      {children}
    </div>
  );
}
