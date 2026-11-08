import { notFound } from "next/navigation";
import { PrinterStatusView } from "@/components/printer-status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { colors } from "@/lib/ui/tokens";

const palette: { name: string; value: string; className: string }[] = [
  { name: "Fond (crème)", value: colors.background, className: "bg-background" },
  { name: "Cartes", value: colors.surface, className: "bg-surface" },
  { name: "Texte", value: colors.foreground, className: "bg-foreground" },
  { name: "Texte secondaire", value: colors.muted, className: "bg-muted" },
  { name: "Framboise : actions", value: colors.accent, className: "bg-accent" },
  { name: "Pêche : décor", value: colors.brand, className: "bg-brand" },
  { name: "Succès", value: colors.success, className: "bg-success" },
  { name: "Erreur", value: colors.danger, className: "bg-danger" },
];

// Reference page for the base components. Never served in production.
export default function UiDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Composants de base</h1>

      <Card>
        <h2 className="mb-3 font-semibold">Palette</h2>
        <ul className="grid grid-cols-2 gap-3">
          {palette.map((swatch) => (
            <li key={swatch.name} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className={`size-6 shrink-0 rounded border border-border ${swatch.className}`}
              />
              <span>
                {swatch.name}
                <span className="block text-muted">{swatch.value}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg bg-brand-soft p-3 text-on-brand">
          Bandeau doux : texte foncé sur Pêche clair.
        </p>
      </Card>

      <Card>
        <div className="flex flex-col gap-3">
          <Button>Action principale</Button>
          <Button disabled>Action désactivée</Button>
          <Button loading>Action en cours</Button>
          <Button variant="secondary">Action secondaire</Button>
        </div>
      </Card>

      <Card>
        <PrinterStatusView state="online" />
        <PrinterStatusView state="offline" />
        <PrinterStatusView state="checking" />
      </Card>

      <ErrorMessage>Un souci est survenu. Réessayez dans un instant.</ErrorMessage>

      <div className="-m-4 [&>main]:min-h-0">
        <LoadingScreen />
      </div>
    </main>
  );
}
