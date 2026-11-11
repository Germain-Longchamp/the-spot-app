"use client";

import { useState } from "react";
import { AdminEvents } from "@/components/admin/admin-events";
import type { AdminEvent, CreateEventInput } from "@/lib/admin/events";
import { validateEventInput } from "@/lib/admin/events-input";

const start: AdminEvent[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Salon démo",
    eventDate: "2027-01-15",
    open: true,
    accessPath: "/e/jeton-du-salon-0123456789abcdef0123",
    shortCode: "BQYJ8M",
    createdAt: "2026-11-04T10:00:00Z",
  },
];

/** Records what reached the "server", so tests can count creations. */
export function DevAdmin() {
  const [events, setEvents] = useState(start);
  const [byKey] = useState(() => new Map<string, AdminEvent>());
  const [calls, setCalls] = useState(0);

  async function onCreate(input: CreateEventInput) {
    setCalls((n) => n + 1);
    const message = validateEventInput(input);
    if (message) return { kind: "invalid" as const, message };
    await new Promise((resolve) => setTimeout(resolve, 300));
    const existing = byKey.get(input.creationKey);
    if (existing) {
      return { kind: "existing" as const, event: existing, operatorPath: "/operateur/lien-op-2" };
    }
    const event: AdminEvent = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      eventDate: input.date || null,
      open: true,
      accessPath: `/e/jeton-${byKey.size + 1}-0123456789abcdef0123456789`,
      shortCode: "MARI23",
      createdAt: new Date().toISOString(),
    };
    byKey.set(input.creationKey, event);
    setEvents((list) => [event, ...list]);
    return { kind: "created" as const, event, operatorPath: "/operateur/lien-op-1" };
  }

  return (
    <>
      <p data-testid="create-calls" className="sr-only">
        {calls}
      </p>
      <AdminEvents
        events={events}
        email="equipe@example.com"
        onCreate={onCreate}
        onReset={async () => ({ operatorPath: "/operateur/lien-op-nouveau" })}
        onSignOut={() => undefined}
      />
    </>
  );
}
