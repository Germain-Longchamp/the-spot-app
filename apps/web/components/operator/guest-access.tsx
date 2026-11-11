"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Props {
  /** "/e/<token>": the full link uses the address the panel is open on. */
  accessPath: string;
  shortCode: string;
  eventOpen: boolean;
}

/**
 * The guests' way in, to print again or share: the QR code, its link and the
 * fallback code. Same settings as the event creation script, so a poster
 * printed from here reads as well (correction H, 1024 px, quiet zone).
 */
export function GuestAccess({ accessPath, shortCode, eventOpen }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setUrl(`${window.location.origin}${accessPath}`);
  }, [accessPath]);

  useEffect(() => {
    if (!url) return;
    let active = true;
    QRCode.toDataURL(url, { errorCorrectionLevel: "H", width: 1024, margin: 4 })
      .then((data) => active && setQr(data))
      .catch(() => active && setQr(null));
    return () => {
      active = false;
    };
  }, [url]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied("Lien copié.");
    } catch {
      // Some browsers refuse: the link stays selectable just below.
      setCopied("Copie impossible ici : sélectionnez le lien ci-dessous.");
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="font-semibold">Accès des invités</h3>
      {!eventOpen && (
        <p className="text-sm text-muted">
          L&apos;événement est fermé : ce QR code n&apos;ouvre plus rien tant
          qu&apos;il n&apos;est pas rouvert.
        </p>
      )}

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        {qr ? (
          // A data URL made here: nothing for an image optimizer to do.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qr}
            alt="QR code d'accès des invités"
            data-testid="guest-qr"
            className="size-44 shrink-0 rounded-xl border border-divider"
          />
        ) : (
          <div className="size-44 shrink-0 animate-soft-pulse rounded-xl bg-background" />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm text-muted">Code de secours</p>
          <p data-testid="short-code" className="font-mono text-2xl font-semibold tracking-widest">
            {shortCode}
          </p>
          <p className="text-sm text-muted">Lien d&apos;accès</p>
          <p
            data-testid="access-url"
            className="select-all break-all rounded-lg bg-background px-3 py-2 font-mono text-sm"
          >
            {url}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={copy} disabled={!url}>
          Copier le lien
        </Button>
        {qr && (
          <a
            href={qr}
            download={`qr-${shortCode}.png`}
            className="inline-flex min-h-[52px] items-center justify-center rounded-2xl border border-border bg-surface px-6 font-semibold transition-transform active:scale-[0.97]"
          >
            Télécharger le QR code
          </a>
        )}
      </div>
      <p role="status" aria-live="polite" className="text-sm empty:hidden">
        {copied}
      </p>
    </Card>
  );
}
