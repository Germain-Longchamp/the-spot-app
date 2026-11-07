"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/errors/report";

/** Catches what no screen handled, on every page. Renders nothing. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) =>
      reportError(event.message || "Erreur inconnue");
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      reportError(reason instanceof Error ? reason.message : String(reason));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
