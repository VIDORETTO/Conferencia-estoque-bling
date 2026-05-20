import React, { useState } from "react";
import { Layers } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/src/lib/apiFetch";

export function LoginScreen({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch("/api/app-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Server returned non-JSON: ${res.status} ${text.substring(0, 100)}`,
        );
      }

      if (res.ok && data.success) {
        if (data.token) localStorage.setItem("app_auth_token", data.token);
        onLoginSuccess();
      } else {
        toast.error(data.error || "Login falhou");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao fazer login";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <Toaster />
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Layers className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Acesso ao Sistema</CardTitle>
          <CardDescription>
            Insira suas credenciais para continuar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
