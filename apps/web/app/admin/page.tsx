import type { Metadata } from "next";
import { AdminLogin } from "@/components/admin/admin-login";
import { LiveAdminDenied, LiveAdminEvents } from "@/components/admin/live-admin";
import { ErrorMessage } from "@/components/ui/error-message";
import { adminSession } from "@/lib/admin/access";
import { AdminEvent, listEvents } from "@/lib/admin/events";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
// Belt and braces with noStoreFetch: no database read is ever cached here.
export const fetchCache = "force-no-store";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Espace admin · The Spot Memories",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const session = await adminSession();
  if (session.kind === "signed_out") return <AdminLogin />;
  if (session.kind === "not_allowed") return <LiveAdminDenied email={session.email} />;

  let events: AdminEvent[] | null = null;
  try {
    events = await listEvents(createAdminClient());
  } catch {
    events = null;
  }
  if (!events) {
    return (
      <main className="mx-auto max-w-md p-6">
        <ErrorMessage>
          Impossible de lire les événements pour le moment. Rechargez la page dans un instant.
        </ErrorMessage>
      </main>
    );
  }

  return <LiveAdminEvents events={events} email={session.user.email ?? ""} />;
}
