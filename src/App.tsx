import { apiFetch } from "./lib/apiFetch";
import { useState, useEffect } from "react";
import { Layers } from "lucide-react";
import { Toaster, toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoginScreen } from "./components/LoginScreen";
import { ConferenceBoard } from "./components/ConferenceBoard";

export default function App() {
  const [isAppAuthenticated, setIsAppAuthenticated] = useState<boolean | null>(
    null,
  );
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    checkAppAuth();
  }, []);

  const checkAppAuth = async () => {
    try {
      const res = await apiFetch("/api/app-session");
      const data = await res.json();
      setIsAppAuthenticated(!!data.authenticated);
      if (data.authenticated) {
        checkBlingAuth();
      }
    } catch {
      setIsAppAuthenticated(false);
    }
  };

  useEffect(() => {
    const handleAuthError = () => {
      setIsAppAuthenticated(false);
      localStorage.removeItem("app_auth_token");
      toast.error("Sua sessão expirou. Por favor, faça login novamente.");
    };

    const handleBlingAuthError = () => {
      setIsConnected(false);
      toast.error("Sua sessão no Bling expirou. Por favor, conecte novamente.");
    };

    window.addEventListener("auth_error", handleAuthError);
    window.addEventListener("bling_auth_error", handleBlingAuthError);
    return () => {
      window.removeEventListener("auth_error", handleAuthError);
      window.removeEventListener("bling_auth_error", handleBlingAuthError);
    };
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        checkBlingAuth();
        toast.success("Conectado ao Bling com sucesso!");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const checkBlingAuth = async () => {
    try {
      const res = await apiFetch("/api/me");
      const data = await res.json();
      setIsConnected(!!data.connected);
    } catch {
      setIsConnected(false);
    }
  };

  const [manualAuthUrl, setManualAuthUrl] = useState<string | null>(null);

  const handleConnect = async () => {
    try {
      const response = await apiFetch("/api/auth/url");
      if (!response.ok) throw new Error("Failed to get auth URL");
      const { url, state } = await response.json();

      // Store the state locally as a fallback for CSRF verification
      // in case the oauth_state cookie is not sent by the browser
      if (state) {
        localStorage.setItem("oauth_state", state);
      }

      const authWindow = window.open(
        url,
        "oauth_popup",
        "width=600,height=700",
      );
      if (!authWindow) {
        setManualAuthUrl(url);
        toast.error("Popup bloqueado. Use o link manual abaixo.");
      }
    } catch (error) {
      console.error("OAuth error:", error);
      toast.error("Erro ao conectar com o Bling.");
    }
  };

  const handleRetryPopup = () => {
    setManualAuthUrl(null);
    handleConnect();
  };

  if (isAppAuthenticated === null)
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        Carregando...
      </div>
    );

  if (!isAppAuthenticated) {
    return <LoginScreen onLoginSuccess={checkAppAuth} />;
  }

  if (isConnected === null)
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        Carregando Bling...
      </div>
    );

  if (!isConnected) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
        <Toaster />
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Layers className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Conferência de Estoque</CardTitle>
            <CardDescription>
              Conecte seu sistema Bling para iniciar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleConnect} className="w-full" size="lg">
              Conectar ao Bling
            </Button>
            {manualAuthUrl && (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
                <p className="text-amber-800 dark:text-amber-200">
                  Popup bloqueado. Clique no link abaixo ou permita popups e tente novamente:
                </p>
                <a
                  href={manualAuthUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block break-all text-blue-600 underline dark:text-blue-400"
                >
                  {manualAuthUrl}
                </a>
                <Button variant="outline" size="sm" onClick={handleRetryPopup} className="mt-2">
                  Tentar novamente
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] bg-zinc-50 dark:bg-zinc-950 px-4 pt-8 pb-32 md:pb-8">
      <Toaster />
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Conferência via Bling
            </h1>
            <p className="text-zinc-500">
              Bipe ou procure produtos para conferir o estoque.
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={async () => {
              localStorage.removeItem("app_auth_token");
              await apiFetch("/api/app-logout", { method: "POST" });
              checkAppAuth();
            }}
          >
            Sair
          </Button>
        </div>

        <ConferenceBoard />
      </div>
    </div>
  );
}

