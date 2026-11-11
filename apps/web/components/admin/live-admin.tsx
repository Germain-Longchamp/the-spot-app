"use client";

import { useRouter } from "next/navigation";
import { createEventAction, resetOperatorLinkAction } from "@/app/admin/actions";
import { AdminEvents } from "@/components/admin/admin-events";
import { AdminDenied } from "@/components/admin/admin-login";
import type { AdminEvent } from "@/lib/admin/events";
import { createClient } from "@/lib/supabase/client";

function useSignOut() {
  const router = useRouter();
  return async () => {
    await createClient().auth.signOut();
    router.refresh();
  };
}

export function LiveAdminEvents({ events, email }: { events: AdminEvent[]; email: string }) {
  const router = useRouter();
  const signOut = useSignOut();

  return (
    <AdminEvents
      events={events}
      email={email}
      onCreate={async (input) => {
        const outcome = await createEventAction(input);
        router.refresh();
        return outcome;
      }}
      onReset={resetOperatorLinkAction}
      onSignOut={signOut}
    />
  );
}

export function LiveAdminDenied({ email }: { email: string | null }) {
  return <AdminDenied email={email} onSignOut={useSignOut()} />;
}
