import { Logo, LOGO_NAME } from "@/components/ui/logo";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <Logo width={256} />
      <h1 className="sr-only">{LOGO_NAME}</h1>
    </main>
  );
}
