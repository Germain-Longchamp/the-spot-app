"use client";

import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";

export default function OperatorError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="flex flex-col gap-3">
        <ErrorMessage>
          Impossible d&apos;afficher le panneau pour le moment.
        </ErrorMessage>
        <Button variant="secondary" onClick={reset}>
          Réessayer
        </Button>
      </div>
    </main>
  );
}
