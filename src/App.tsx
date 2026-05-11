import { apiFetch } from "./lib/apiFetch";
import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Camera,
  Upload,
  Check,
  FileDown,
  Layers,
  CheckCircle2,
  ChevronRight,
  X,
  ScanLine,
  Trash,
  Maximize2,
  SwitchCamera,
} from "lucide-react";
import * as xlsx from "xlsx";
import { Toaster, toast } from "sonner";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Product {
  id: number;
  nome: string;
  codigo: string;
  preco: number;
  tipo: string;
  situacao: string;
  formato: string;
  descricaoCurta: string;
  imagemURL?: string;
}

interface ConferenceItem {
  product: Product;
  expectedQty: number;
  realQty: number;
  diff: number;
  modified: boolean;
  modifications: string[];
}

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

    window.addEventListener("auth_error", handleAuthError);
    return () => window.removeEventListener("auth_error", handleAuthError);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        if (event.data?.access_token) {
          localStorage.setItem("bling_access_token", event.data.access_token);
        }
        if (event.data?.refresh_token) {
          localStorage.setItem("bling_refresh_token", event.data.refresh_token);
        }
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

  const handleConnect = async () => {
    try {
      const response = await apiFetch("/api/auth/url");
      if (!response.ok) throw new Error("Failed to get auth URL");
      const { url } = await response.json();

      const authWindow = window.open(
        url,
        "oauth_popup",
        "width=600,height=700",
      );
      if (!authWindow) {
        toast.error("Por favor, permita popups para este site.");
      }
    } catch (error) {
      console.error("OAuth error:", error);
      toast.error("Erro ao conectar com o Bling.");
    }
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
          <CardContent>
            <Button onClick={handleConnect} className="w-full" size="lg">
              Conectar ao Bling
            </Button>
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
              localStorage.removeItem("bling_access_token");
              localStorage.removeItem("bling_refresh_token");
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

function LoginScreen({ onLoginSuccess }: { onLoginSuccess: () => void }) {
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

      let data;
      try {
        data = await res.json();
      } catch (err) {
        const text = await res.text();
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
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer login");
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

function ConferenceBoard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sessionItems, setSessionItems] = useState<ConferenceItem[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchProduct = async (term: string) => {
    if (!term.trim()) return;
    
    // If the term is only numbers and spaces (e.g. from OCR or barcode with spaces), remove the spaces
    const cleanTerm = /^\s*[\d\s]+\s*$/.test(term) ? term.replace(/\s+/g, "") : term.trim();
    
    setIsSearching(true);
    try {
      // First try exactly by code/ean
      const res = await apiFetch(
        `/api/products/search?q=${encodeURIComponent(cleanTerm)}`,
      );
      const data = await res.json();

      if (!res.ok) {
        toast.error("Erro na busca", { description: data.error });
        setSearchResults([]);
        return;
      }

      if (Array.isArray(data)) {
        const mappedData = data.map((item: any) => ({
          ...item,
          imagemURL:
            item.midia?.imagens?.imagensURL?.[0]?.link ||
            item.midia?.imagens?.externas?.[0]?.link ||
            item.midia?.imagens?.internas?.[0]?.link ||
            "",
        }));
        setSearchResults(mappedData);
        if (mappedData.length === 1) {
          // Auto-select if exact one outcome by code
          // To make it smooth, let's assume if it is an exact match we pass true
          handleSelectProduct(mappedData[0], true);
        }
      } else {
        toast.error("Nenhum produto encontrado");
        setSearchResults([]);
      }
    } catch (err) {
      toast.error("Erro ao buscar produto");
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchProduct(searchTerm);
    }
  };

  const handleSelectProduct = (
    product: Product,
    isExactMatch: boolean = false,
  ) => {
    setSelectedProduct(product);
    setSearchResults([]);
    setSearchTerm("");
    // We will use a hack to pass isExactMatch to the editor if we want, or adjust it there
  };

  const handleConfirmItem = (item: ConferenceItem) => {
    setSessionItems((prev) => {
      const existing = prev.findIndex((p) => p.product.id === item.product.id);
      if (existing >= 0) {
        const newArr = [...prev];
        newArr[existing] = item;
        return newArr;
      }
      return [...prev, item];
    });
    setSelectedProduct(null);
    toast.success(`Conferido: ${item.product.nome}`);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  const clearSession = () => {
    if (confirm("Tem certeza que deseja limpar a conferência atual?")) {
      setSessionItems([]);
    }
  };

  return (
    <Tabs defaultValue="conferencia" className="w-full">
      <TabsList className="mb-4 grid w-full max-w-sm grid-cols-2">
        <TabsTrigger value="conferencia">Conferência</TabsTrigger>
        <TabsTrigger value="relatorio">
          Relatório ({sessionItems.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="conferencia" className="animate-in fade-in-50">
        <div className="grid gap-6 md:grid-cols-[1fr_400px]">
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                    <Input
                      ref={searchInputRef}
                      type="search"
                      placeholder="Bipe o código ou digite..."
                      className="pl-9"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={handleKeyDown}
                      autoFocus
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsScannerOpen(true)}
                  >
                    <ScanLine className="h-5 w-5" />
                  </Button>
                  <Button
                    onClick={() => searchProduct(searchTerm)}
                    disabled={isSearching}
                  >
                    {isSearching ? "Buscando..." : "Buscar"}
                  </Button>
                </div>
                {isScannerOpen && (
                  <BarcodeScanner
                    onScan={(code) => {
                      setSearchTerm(code);
                      searchProduct(code);
                      setIsScannerOpen(false);
                    }}
                    onClose={() => setIsScannerOpen(false)}
                  />
                )}

                {searchResults.length > 0 && !selectedProduct && (
                  <div className="mt-4 rounded-md border">
                    <ScrollArea className="h-[300px]">
                      <div className="p-2 space-y-1">
                        {searchResults.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => handleSelectProduct(p)}
                            className="flex cursor-pointer items-center justify-between rounded-md p-3 hover:bg-muted"
                          >
                            <div>
                              <div className="font-medium">{p.nome}</div>
                              <div className="text-sm text-zinc-500">
                                Código: {p.codigo}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-zinc-400" />
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedProduct && (
              <ProductDetailsEditor
                product={selectedProduct}
                onCancel={() => setSelectedProduct(null)}
                onConfirm={handleConfirmItem}
              />
            )}
          </div>

          <div className="hidden md:block">
            <Card className="sticky top-6 h-[calc(100vh-120px)] overflow-hidden flex flex-col">
              <CardHeader className="border-b bg-muted/40 py-4">
                <CardTitle className="text-lg flex justify-between items-center">
                  Itens Conferidos
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs">
                    {sessionItems.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {sessionItems.length === 0 ? (
                    <p className="text-sm text-center text-zinc-500 py-8">
                      Nenhum item conferido ainda.
                    </p>
                  ) : (
                    sessionItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex gap-3 justify-between items-start rounded-md border bg-card p-3 shadow-sm"
                      >
                        <div>
                          <p
                            className="text-sm font-medium line-clamp-1"
                            title={item.product.nome}
                          >
                            {item.product.nome}
                          </p>
                          <p className="text-xs text-zinc-500">
                            Cód: {item.product.codigo}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold">
                            {item.realQty}{" "}
                            <span className="text-zinc-500 font-normal">
                              cx/un
                            </span>
                          </div>
                          {item.diff !== 0 && (
                            <div
                              className={`text-xs ${item.diff > 0 ? "text-green-600" : "text-red-600"}`}
                            >
                              {item.diff > 0 ? "+" : ""}
                              {item.diff} diverg.
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </Card>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="relatorio" className="animate-in fade-in-50">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Relatório de Divergências</CardTitle>
              <CardDescription>
                Resumo de tudo que foi conferido na sessão
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={clearSession}
                disabled={sessionItems.length === 0}
              >
                Limpar
              </Button>
              <ExportExcelButton
                data={sessionItems}
                disabled={sessionItems.length === 0}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome Produto</TableHead>
                    <TableHead className="text-right">Est. Bling</TableHead>
                    <TableHead className="text-right">Físico</TableHead>
                    <TableHead className="text-right">Diverg.</TableHead>
                    <TableHead>Modificações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessionItems.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-24 text-center text-zinc-500"
                      >
                        Sem dados para relatório.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sessionItems.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {item.product.codigo}
                        </TableCell>
                        <TableCell>{item.product.nome}</TableCell>
                        <TableCell className="text-right text-zinc-500">
                          {item.expectedQty || 0}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {item.realQty}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.diff === 0 ? (
                            <span className="text-green-500">Ok</span>
                          ) : (
                            <span
                              className={
                                item.diff > 0
                                  ? "text-green-600"
                                  : "text-red-600"
                              }
                            >
                              {item.diff > 0 ? "+" : ""}
                              {item.diff}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.modifications.length > 0 ? (
                            <span className="text-xs text-blue-600 border border-blue-200 bg-blue-50 px-2 py-1 rounded">
                              {item.modifications.join(", ")}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">
                              Nenhuma
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function ProductDetailsEditor({
  product,
  onCancel,
  onConfirm,
}: {
  product: Product;
  onCancel: () => void;
  onConfirm: (item: ConferenceItem) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real quantities (assumed default from product if available or 0)
  // Bling V3 brings stock in a separate endpoint usually,
  // but let's assume we allow user to type it purely for conference
  const [expectedQty, setExpectedQty] = useState<number>(0);
  const [depositoId, setDepositoId] = useState<number | null>(null);
  const [realQty, setRealQty] = useState<number | "">("");

  const [barcodeScan, setBarcodeScan] = useState<string>("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Editable fields
  const [nome, setNome] = useState(product.nome || "");
  const [codigo, setCodigo] = useState(product.codigo || "");
  const [imagens, setImagens] = useState<string[]>(
    product.imagemURL ? [product.imagemURL] : [],
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  const modifications = useRef<string[]>([]);

  // Fetch actual stock if needed - Bling v3 /estoques
  useEffect(() => {
    fetchStock();
    fetchFullProduct();
  }, [product.id]);

  const fetchFullProduct = async () => {
    try {
      const res = await apiFetch(`/api/products/${product.id}`);
      if (res.ok) {
        const data = await res.json();
        let allImages: string[] = [];
        if (data.midia?.imagens) {
          const { imagensURL, externas, internas } = data.midia.imagens;
          if (imagensURL) allImages.push(...imagensURL.map((i: any) => i.link));
          if (externas) allImages.push(...externas.map((i: any) => i.link));
          if (internas) allImages.push(...internas.map((i: any) => i.link));
        }
        allImages = Array.from(new Set(allImages)).filter(Boolean);
        if (allImages.length > 0) setImagens(allImages);
      }
    } catch (e) {
      console.error("Product full fetch error", e);
    }
  };

  const fetchStock = async () => {
    try {
      const res = await apiFetch(`/api/products/stock/${product.id}`);
      if (res.ok) {
        const data = await res.json();
        setExpectedQty(data.saldoFisicoTotal || data.saldoVirtualTotal || 0);
        if (data.depositoId) {
          setDepositoId(data.depositoId);
        }
      } else {
        setExpectedQty(0);
      }
    } catch (e) {
      console.error("Estoque fetch error", e);
      setExpectedQty(0);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    modifications.current.push("Foto Atualizada");

    const newImagens = [...imagens];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64Str = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve((reader.result as string).split(",")[1]);
          };
          reader.readAsDataURL(file);
        });

        const res = await apiFetch("/api/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64Str }),
        });

        if (!res.ok) throw new Error("Upload falhou");

        const data = await res.json();
        newImagens.push(data.url);
      }
      setImagens(newImagens);
      toast.success("Imagem(ns) enviada(s) com sucesso!");
    } catch (err) {
      toast.error("Erro ao subir imagem.");
      console.error(err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleBarcodeScan = (scannedCode: string) => {
    // If the scanned code is numbers with spaces, remove spaces
    const cleanScannedCode = /^\s*[\d\s]+\s*$/.test(scannedCode) ? scannedCode.replace(/\s+/g, "") : scannedCode.trim();
    
    const cleanCodigo = /^\s*[\d\s]+\s*$/.test(codigo) ? codigo.replace(/\s+/g, "") : codigo.trim();
    
    if (cleanScannedCode.toUpperCase() === cleanCodigo.toUpperCase()) {
      setRealQty((prev) => (prev === "" ? 1 : Number(prev) + 1));

      // Play a short bip sound
      try {
        const audioContext = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // 800Hz beep
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1); // 100ms duration
      } catch (e) {
        console.warn("Audio not supported");
      }

      toast.success("+1 unidade adicionada!", {
        position: "top-center",
      });
    } else {
      // Play a low error sound
      try {
        const audioContext = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.type = "sawtooth";
        oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (e) {}

      toast.error("Código lido não confere com o produto atual!", {
        position: "top-center",
      });
    }
  };

  const saveToBling = async () => {
    setIsSavingDetails(true);
    try {
      if (nome !== product.nome) modifications.current.push("Nome alterado");
      if (codigo !== product.codigo)
        modifications.current.push("Código alterado");

      // Format for Bling V3
      const payload: any = {
        nome,
        codigo,
        situacao: product.situacao || "A",
        formato: product.formato || "S",
        tipo: product.tipo || "P",
        preco: product.preco || 0,
      };

      if (imagens.length > 0) {
        payload.midia = {
          imagens: {
            imagensURL: imagens.map((link) => ({ link })),
          },
        };
      } else {
        payload.midia = {
          imagens: {
            imagensURL: [],
          },
        };
      }

      const res = await apiFetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update");
      }

      toast.success("Detalhes salvos no Bling");
    } catch (err: any) {
      toast.error("Erro ao salvar no Bling", { description: err.message });
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleConfirm = async () => {
    if (realQty === "" || Number.isNaN(realQty)) {
      toast.error("Informe a quantidade real apurada.");
      return;
    }

    const hasImageChanges =
      JSON.stringify(imagens) !==
      JSON.stringify(product.imagemURL ? [product.imagemURL] : []);
    let modificationsArr = [...modifications.current];

    if (nome !== product.nome || codigo !== product.codigo || hasImageChanges) {
      await saveToBling();
      if (hasImageChanges && !modificationsArr.includes("Foto Atualizada")) {
        modificationsArr.push("Foto Atualizada");
      }
    }

    const diff = Number(realQty) - expectedQty;

    setIsSavingDetails(true);
    try {
      if (diff !== 0) {
        // Enviar balanço do estoque local
        const res = await apiFetch(`/api/products/stock/${product.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantidade: Number(realQty), depositoId }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to update stock");
        }
        modificationsArr.push("Balanço de estoque via app");
        toast.success("Balanço de estoque registrado no Bling!");
      }
    } catch (err: any) {
      toast.error("Erro ao registrar balanço no Bling", {
        description: err.message,
      });
    } finally {
      setIsSavingDetails(false);
    }

    onConfirm({
      product: { ...product, nome, codigo, imagemURL: imagens[0] || "" },
      expectedQty,
      realQty: Number(realQty),
      diff,
      modified: modificationsArr.length > 0 || hasImageChanges,
      modifications: Array.from(new Set(modificationsArr)),
    });
  };

  return (
    <Card className="animate-in slide-in-from-bottom-4">
      <CardHeader className="flex flex-row items-start justify-between pb-4">
        <div>
          <CardTitle>{product.nome}</CardTitle>
          <CardDescription>Confirme as informações e o estoque</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="flex flex-col items-center gap-3">
            <div
              className="relative flex h-40 w-40 overflow-hidden rounded-lg border bg-zinc-100 dark:bg-zinc-800 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
              onClick={() => setIsGalleryOpen(true)}
            >
              {imagens.length > 0 ? (
                <img
                  src={imagens[0]}
                  alt="Produto"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-400">
                  Sem Foto
                </div>
              )}
              {imagens.length > 1 && (
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded shadow">
                  +{imagens.length - 1}
                </div>
              )}
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                  <span className="animate-pulse">Enviando...</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 w-full justify-center">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                ref={fileInputRef}
                onChange={handleImageUpload}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full max-w-[160px]"
              >
                <Camera className="mr-2 h-4 w-4" /> Foto
              </Button>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <Label>Nome do Produto</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Código / EAN</Label>
              <Input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={saveToBling}
                disabled={isSavingDetails}
              >
                Salvar Alterações
              </Button>
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4 border border-zinc-200 dark:border-zinc-800">
          <div>
            <Label className="text-zinc-500">Qtd Sistema (Bling)</Label>
            <div className="text-2xl font-semibold mt-1">
              {expectedQty}{" "}
              <span className="text-sm font-normal text-zinc-500">cx/un</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-bold text-primary">
                Leitor de Código (Soma +1)
              </Label>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setIsScannerOpen(true)}
              >
                <ScanLine className="h-3 w-3 mr-1" /> Câmera
              </Button>
            </div>
            <Input
              autoFocus
              placeholder="Bipe para adicionar +1..."
              className="border-primary"
              value={barcodeScan}
              onChange={(e) => setBarcodeScan(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleBarcodeScan(barcodeScan);
                  setBarcodeScan("");
                }
              }}
            />
          </div>
          <div className="space-y-2 col-span-2 mt-2">
            <Label className="font-bold">Quantidade Real Encontrada</Label>
            <Input
              type="number"
              className="text-lg bg-background font-bold"
              value={realQty}
              onChange={(e) =>
                setRealQty(e.target.value ? Number(e.target.value) : "")
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
              }}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between bg-zinc-50/50 py-4 dark:bg-zinc-900/50 rounded-b-lg border-t">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={handleConfirm} size="lg" className="w-[200px]">
          <Check className="mr-2 h-5 w-5" />
          Confirmar Saldo
        </Button>
      </CardFooter>
      {isScannerOpen && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setIsScannerOpen(false)}
        />
      )}

      {/* Gallery Dialog */}
      <Dialog open={isGalleryOpen} onOpenChange={setIsGalleryOpen}>
        <DialogContent className="max-w-2xl sm:max-w-4xl p-4 md:p-6 w-[95vw]">
          <DialogHeader>
            <DialogTitle>Galeria de Imagens ({imagens.length})</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mt-4 max-h-[70vh] overflow-y-auto w-full">
            {imagens.map((img, idx) => (
              <div
                key={idx}
                className="relative group rounded-lg overflow-hidden border bg-zinc-100 aspect-square"
              >
                <img
                  src={img}
                  alt={`imagem ${idx}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => {
                      const newImgs = [...imagens];
                      newImgs.splice(idx, 1);
                      setImagens(newImgs);
                      modifications.current.push("Foto Removida");
                    }}
                  >
                    <Trash className="w-4 h-4" />
                  </Button>
                  <a href={img} target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" size="icon">
                      <Maximize2 className="w-4 h-4" />
                    </Button>
                  </a>
                </div>
              </div>
            ))}
            <div
              className="border border-dashed aspect-square rounded-lg flex flex-col items-center justify-center text-zinc-500 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="w-8 h-8 mb-2 opacity-50" />
              <span className="text-sm font-medium">Adicionar Foto</span>
              <span className="text-xs mt-1 opacity-70">Toque aqui</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ExportExcelButton({
  data,
  disabled,
}: {
  data: ConferenceItem[];
  disabled: boolean;
}) {
  const handleExport = () => {
    try {
      const rows = data.map((item) => ({
        CÓDIGO: item.product.codigo,
        "NOME DO PRODUTO": item.product.nome,
        SISTEMA: item.expectedQty,
        FÍSICO: item.realQty,
        DIVERGÊNCIA: item.diff,
        MODIFICAÇÕES: item.modifications.join(", "),
        "LINK FOTO": item.product.imagemURL || "",
      }));

      const worksheet = xlsx.utils.json_to_sheet(rows);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, "Conferência");

      const now = new Date().toISOString().slice(0, 10);
      xlsx.writeFile(workbook, `Conferencia_Bling_${now}.xlsx`);
      toast.success("Relatório gerado!");
    } catch (err) {
      toast.error("Erro ao gerar relatório");
      console.error(err);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={disabled}
      className="bg-green-600 hover:bg-green-700 text-white"
    >
      <FileDown className="mr-2 h-4 w-4" /> Exportar (xlsx)
    </Button>
  );
}

function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment",
  );
  const isScanning = useRef(false);

  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let html5QrCode: Html5Qrcode;
    let unmounted = false;
    let startPromise: Promise<void> | null = null;

    setError("");

    const timer = setTimeout(() => {
      if (unmounted) return;
      html5QrCode = new Html5Qrcode("reader");
      startPromise = html5QrCode.start(
        { facingMode },
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.0,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
          useBarCodeDetectorIfSupported: true,
        } as any,
        (decodedText) => {
          // Prevent duplicate fast scans
          if (isScanning.current) return;
          isScanning.current = true;
          // Clean up the code by removing any spaces
          const sanitizedText = decodedText.replace(/\s+/g, "");
          onScanRef.current(sanitizedText);
          setTimeout(() => {
            isScanning.current = false;
          }, 1500); // 1.5s delay between scans
        },
        () => {
          // ignore errors during scan
        },
      );

      startPromise
        .then(() => {
          if (unmounted) {
            html5QrCode.stop().catch(console.error);
          }
        })
        .catch((err) => {
          if (unmounted) return;
          setError(err.message || "Cannot start camera");
        });
    }, 100);

    return () => {
      unmounted = true;
      clearTimeout(timer);
      if (startPromise) {
        startPromise
          .then(() => {
            if (html5QrCode && html5QrCode.isScanning) {
              html5QrCode.stop().catch(console.error);
            }
          })
          .catch(() => {
            // Ignore start errors as they are handled in the startPromise.catch
          });
      } else if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
      }
    };
  }, [facingMode]); // Run when facingMode changes

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex p-4 justify-between items-center text-white bg-zinc-900 border-b border-zinc-800">
        <span className="font-bold">Scanner</span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              setFacingMode((prev) =>
                prev === "environment" ? "user" : "environment",
              )
            }
            size="icon"
            title="Mudar câmera"
            className="text-white hover:bg-zinc-800"
          >
            <SwitchCamera className="h-6 w-6" />
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            size="icon"
            className="text-white hover:bg-zinc-800"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center relative bg-black px-4">
        {error && (
          <div className="text-red-500 bg-red-100 p-4 rounded mb-4">
            {error}
          </div>
        )}
        <div
          id="reader"
          className="w-full max-w-sm rounded-lg overflow-hidden bg-zinc-900"
        ></div>
        <div className="mt-8 text-center text-zinc-400 text-sm">
          Aponte a câmera para o código de barras.
          <br />O bip ocorre automaticamente.
        </div>
      </div>
      <div className="p-6 pb-36 md:pb-6 bg-zinc-900 border-t border-zinc-800">
        <Button
          onClick={onClose}
          variant="secondary"
          size="lg"
          className="w-full rounded-xl"
        >
          Parar de Bipar e Voltar
        </Button>
      </div>
    </div>
  );
}
