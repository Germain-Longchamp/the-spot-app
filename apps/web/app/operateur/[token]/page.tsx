import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveOperatorPanel } from "@/components/operator/live-operator-panel";
import { findEventForToken } from "@/lib/operator/access";
import { loadSnapshot } from "@/lib/operator/panel";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panneau opérateur · The Spot",
  robots: { index: false, follow: false },
};

function adminClient() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

export default async function OperatorPage({
  params,
}: {
  params: { token: string };
}) {
  const client = adminClient();
  const eventId = client && (await findEventForToken(client, params.token));
  if (!client || !eventId) notFound();

  return (
    <LiveOperatorPanel
      token={params.token}
      snapshot={await loadSnapshot(client, eventId)}
    />
  );
}
