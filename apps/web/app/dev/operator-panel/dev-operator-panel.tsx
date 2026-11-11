"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { OperatorPanel } from "@/components/operator/operator-panel";
import type { OperatorAction } from "@/lib/operator/actions";
import { PanelJob, PanelSnapshot, sortJobs } from "@/lib/operator/panel";

const job = (
  id: string,
  status: PanelJob["status"],
  minute: number,
  extra: Partial<PanelJob> = {},
): PanelJob => ({
  id,
  status,
  authorized: false,
  createdAt: `2026-11-01T10:${String(minute).padStart(2, "0")}:00.000Z`,
  lastError: null,
  photoUrl: null,
  ...extra,
});

const jobs = sortJobs([
  job("done", "DONE", 1),
  job("cancelled", "CANCELLED", 2),
  job("second", "PENDING", 6),
  job("first", "PENDING", 5),
  job("failed", "FAILED", 3, { lastError: "Papier épuisé" }),
  job("stuck", "STUCK", 4),
]);

function Panel() {
  const params = useSearchParams();
  const [snapshot, setSnapshot] = useState<PanelSnapshot>({
    eventName: "Salon de démonstration",
    accessPath: "/e/jeton-de-demonstration-0123456789abcdef",
    shortCode: "BQYJ8M",
    printLimit: params.has("limit") ? Number(params.get("limit")) : null,
    paused: params.has("paused"),
    eventOpen: !params.has("closed"),
    galleryEnabled: true,
    galleryVisible: params.has("gallery"),
    printerOnline: !params.has("offline"),
    jobs: params.has("empty") ? [] : jobs,
    gallery: params.has("empty")
      ? []
      : [
          { id: "photo-a", thumbUrl: null },
          { id: "photo-b", thumbUrl: null },
        ],
  });

  async function onAction(action: OperatorAction) {
    if (action.type === "pause" || action.type === "resume") {
      setSnapshot({ ...snapshot, paused: action.type === "pause" });
    }
    if (action.type === "gallery") {
      setSnapshot({
        ...snapshot,
        galleryEnabled: action.enabled,
        galleryVisible: action.visible,
      });
    }
    if (action.type === "print_limit") {
      setSnapshot({ ...snapshot, printLimit: action.limit });
      return `Action de test : print_limit ${action.limit}`;
    }
    if (action.type === "close" || action.type === "reopen") {
      setSnapshot({ ...snapshot, eventOpen: action.type === "reopen" });
    }
    if (action.type === "delete_photo") {
      setSnapshot({
        ...snapshot,
        gallery: snapshot.gallery.filter(
          (photo) => photo.id !== action.photoId,
        ),
      });
      return `Action de test : delete_photo ${action.photoId}`;
    }
    return `Action de test : ${action.type}`;
  }

  return <OperatorPanel snapshot={snapshot} onAction={onAction} />;
}

export function DevOperatorPanel() {
  return (
    <Suspense>
      <Panel />
    </Suspense>
  );
}
