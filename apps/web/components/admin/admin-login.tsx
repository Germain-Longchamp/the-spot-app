"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { createClient } from "@/lib/supabase/client";

/** Email and password, checked by Supabase. Never says whether an email exists. */
export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: failure } = await createClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (failure) {
        setError(
          failure.status === 400
            ? "Email ou mot de passe incorrect."
            : "Connexion impossible pour le moment. Vérifiez le réseau, puis réessayez.",
        );
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Connexion impossible pour le moment. Vérifiez le réseau, puis réessayez.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo variant="short" width={160} />
        <h1 className="text-2xl font-semibold">Espace admin</h1>
        <p className="text-muted">Réservé à l&apos;équipe The Spot.</p>
      </div>

      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <label className="flex flex-col gap-1 font-semibold">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-[52px] rounded-2xl border border-border bg-background px-4 font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            Mot de passe
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-[52px] rounded-2xl border border-border bg-background px-4 font-normal"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" loading={busy} disabled={!email || !password}>
            Se connecter
          </Button>
        </form>
      </Card>
    </main>
  );
}

/** Signed in, but this account is not on the list. */
export function AdminDenied({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-4 px-4 py-10 text-center">
      <h1 className="text-2xl font-semibold">Accès refusé</h1>
      <p className="text-muted">
        Le compte {email ? <strong>{email}</strong> : "utilisé"} n&apos;a pas accès à
        l&apos;espace admin.
      </p>
      <Button variant="secondary" onClick={onSignOut}>
        Changer de compte
      </Button>
    </main>
  );
}
