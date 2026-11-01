import { notFound } from "next/navigation";
import { PrinterStatusView } from "@/components/printer-status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingScreen } from "@/components/ui/loading-screen";

// Reference page for the base components. Never served in production.
export default function UiDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Composants de base</h1>

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
