"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { operatorAction } from "@/app/operateur/[token]/actions";
import { OperatorPanel } from "@/components/operator/operator-panel";
import type { OperatorAction } from "@/lib/operator/actions";
import type { PanelSnapshot } from "@/lib/operator/panel";

const REFRESH_MS = 3000;

export function LiveOperatorPanel({
  token,
  snapshot,
}: {
  token: string;
  snapshot: PanelSnapshot;
}) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  async function act(action: OperatorAction) {
    const message = await operatorAction(token, action);
    router.refresh();
    return message;
  }

  return <OperatorPanel snapshot={snapshot} onAction={act} />;
}
