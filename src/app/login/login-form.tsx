"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    setLoading(false);
    if (!res.ok) {
      setError("Contraseña incorrecta.");
      return;
    }
    const next = params.get("next");
    window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  }

  return (
    <Card className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-white">
          <Lock className="h-4 w-4" />
        </span>
        <h1 className="text-lg font-semibold">Mis Finanzas</h1>
        <p className="text-xs text-ink-3">Ingresá tu contraseña para continuar.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-xs text-bad">{error}</p>}
        <Button type="submit" variant="accent" className="w-full" disabled={!password || loading}>
          {loading ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </Card>
  );
}
