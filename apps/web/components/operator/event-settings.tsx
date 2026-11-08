"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { OperatorAction } from "@/lib/operator/actions";
import type { PanelSnapshot } from "@/lib/operator/panel";

interface Props {
  snapshot: PanelSnapshot;
  disabled: boolean;
  onAction: (action: OperatorAction) => void;
}

/** What is set once or twice a day: gallery access, print limit, closing. */
export function EventSettings({ snapshot, disabled, onAction }: Props) {
  const [limit, setLimit] = useState(
    snapshot.printLimit === null ? "" : String(snapshot.printLimit),
  );
  const [limitError, setLimitError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const { galleryEnabled: enabled, galleryVisible: visible } = snapshot;

  function saveLimit() {
    const text = limit.trim();
    if (text === "") {
      setLimitError(null);
      onAction({ type: "print_limit", limit: null });
      return;
    }
    const value = Number(text);
    if (!Number.isInteger(value) || value < 0) {
      setLimitError(
        "Indiquez un nombre entier, ou laissez vide pour ne pas limiter.",
      );
      return;
    }
    setLimitError(null);
    onAction({ type: "print_limit", limit: value });
  }

  return (
    <section aria-labelledby="settings-title" className="flex flex-col gap-4">
      <h2 id="settings-title" className="text-lg font-semibold">
        Paramètres
      </h2>

      <Card className="flex flex-col gap-3">
        <h3 className="font-semibold">Accès à la galerie</h3>
        <p data-testid="gallery-state" className="text-sm">
          {!enabled
            ? "Pas de galerie : les invités ne peuvent pas publier."
            : visible
              ? "Galerie ouverte : les invités la voient."
              : "Galerie cachée : les invités peuvent publier, elle s'ouvrira plus tard."}
        </p>
        <div className="flex flex-wrap gap-2">
          {enabled && (
            <Button
              disabled={disabled}
              onClick={() =>
                onAction({ type: "gallery", enabled: true, visible: !visible })
              }
            >
              {visible ? "Cacher la galerie" : "Ouvrir la galerie aux invités"}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() =>
              onAction({
                type: "gallery",
                enabled: !enabled,
                visible: enabled ? false : visible,
              })
            }
          >
            {enabled ? "Désactiver la galerie" : "Activer la galerie"}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <label htmlFor="print-limit" className="font-semibold">
          Nombre maximal d&apos;impressions
        </label>
        <p className="text-sm text-muted">
          Laissez vide pour ne pas limiter. La limite vaut pour les prochaines
          demandes ; celles déjà faites ne changent pas.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            id="print-limit"
            inputMode="numeric"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            className="min-h-[52px] w-32 rounded-2xl border border-border bg-background px-4 text-base"
          />
          <Button disabled={disabled} onClick={saveLimit}>
            Enregistrer la limite
          </Button>
        </div>
        {limitError && (
          <p role="alert" className="text-sm text-danger">
            {limitError}
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h3 className="font-semibold">Événement</h3>
        <p className="text-sm text-muted">
          {snapshot.eventOpen
            ? "Ouvert : les invités peuvent entrer, envoyer des photos et imprimer."
            : "Fermé : plus personne ne peut entrer, envoyer de photo ni imprimer."}
        </p>
        {snapshot.eventOpen ? (
          confirmClose ? (
            <div
              role="alertdialog"
              aria-label="Confirmer la fermeture"
              className="flex flex-col gap-2 rounded-xl bg-accent-soft p-3"
            >
              <p className="text-sm">
                Fermer l&apos;événement ? Les invités ne pourront plus entrer,
                envoyer de photo ni imprimer. Vous pourrez le rouvrir.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={disabled}
                  onClick={() => {
                    setConfirmClose(false);
                    onAction({ type: "close" });
                  }}
                >
                  Fermer l&apos;événement
                </Button>
                <Button variant="secondary" onClick={() => setConfirmClose(false)}>
                  Laisser ouvert
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => setConfirmClose(true)}
              className="self-start"
            >
              Fermer l&apos;événement…
            </Button>
          )
        ) : (
          <Button
            disabled={disabled}
            onClick={() => onAction({ type: "reopen" })}
            className="self-start"
          >
            Rouvrir l&apos;événement
          </Button>
        )}
      </Card>
    </section>
  );
}
