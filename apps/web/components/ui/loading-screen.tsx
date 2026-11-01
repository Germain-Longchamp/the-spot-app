export function LoadingScreen({ message = "Chargement…" }: { message?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <p role="status" className="text-muted">
        {message}
      </p>
    </main>
  );
}
