"use client";

import { useCallback, useEffect, useState } from "react";
import { GuestFlow } from "@/components/guest/guest-flow";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Logo } from "@/components/ui/logo";
import { EntryOutcome, enterEvent } from "@/lib/guest/enter-event";
import { createClient } from "@/lib/supabase/client";

const messages = {
  invalid: "Ce lien n'est pas valide. Demandez le QR code à l'équipe sur place.",
  closed: "Cet événement est terminé. Merci de votre visite !",
  connection_lost:
    "Nous n'arrivons pas à ouvrir l'événement. Vérifiez votre connexion, puis réessayez.",
  storage_blocked:
    "Votre navigateur bloque l'accès à cette page. Quittez la navigation privée, ou ouvrez ce lien dans Safari ou Chrome.",
};

function Message({
  children,
  action,
}: {
  children: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-4">
      <Logo width={256} className="self-center" />
      <p className="text-lg">{children}</p>
      {action}
    </main>
  );
}

export function GuestApp({ token }: { token: string }) {
  const [entry, setEntry] = useState<EntryOutcome | null>(null);

  const enter = useCallback(async () => {
    setEntry(null);
    setEntry(await enterEvent(createClient(), token));
  }, [token]);

  useEffect(() => {
    enter();
  }, [enter]);

  if (!entry) return <LoadingScreen message="Ouverture de l'événement…" />;

  if (entry.kind === "connection_lost") {
    return (
      <Message action={<Button onClick={enter}>Réessayer</Button>}>
        {messages.connection_lost}
      </Message>
    );
  }

  if (entry.kind !== "joined") return <Message>{messages[entry.kind]}</Message>;

  return <GuestFlow event={entry.event} guestId={entry.guestId} token={token} />;
}
