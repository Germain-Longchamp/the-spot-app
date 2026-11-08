import { Logo } from "@/components/ui/logo";

export function LoadingScreen({ message = "Chargement…" }: { message?: string }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 p-4">
      <Logo variant="icon" width={56} className="animate-soft-pulse" />
      <p role="status" className="text-muted">
        {message}
      </p>
    </main>
  );
}
