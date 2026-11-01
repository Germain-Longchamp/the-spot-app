import type { ReactNode } from "react";

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="font-semibold text-danger">
      {children}
    </p>
  );
}
