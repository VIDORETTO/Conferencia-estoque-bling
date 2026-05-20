import React, { useState, useEffect, useRef } from "react";
import { Camera, Check, X, ScanLine, Trash, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "../lib/apiFetch";
import type { Product, ConferenceItem } from "../types";
import { BarcodeScanner } from "./BarcodeScanner";

export function ProductDetailsEditor({
  product,
  onCancel,
  onConfirm,
  onExternalScannerOpen,
}: {
  product: Product;
  onCancel: () => void;
  onConfirm: (item: ConferenceItem) => void;
  onExternalScannerOpen?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expectedQty, setExpectedQty] = useState<number>(0);
  const [depositoId, setDepositoId] = useState<number | null>(null);
  const [realQty, setRealQty] = useState<number | "">("");

  const [barcodeScan, setBarcodeScan] = useState<string>("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const [nome, setNome] = useState(product.nome || "");
  const [codigo, setCodigo] = useState(product.codigo || "");
  const [imagens, setImagens] = useState<string[]>(
    product.imagemURL ? [product.imagemURL] : [],
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isPostingBalance, setIsPostingBalance] = useState(false);
  const [isStockLoading, setIsStockLoading] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  const modifications = useRef<string[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [codigoBarras, setCodigoBarras] = useState<string>("");

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new AudioCtx();
    }
    return audioContextRef.current;
  };

  const playBeep = (frequency: number, duration: number, type: OscillatorType) => {
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      oscillator.start();
      oscillator.stop(ctx.currentTime + duration);
    } catch (e) {}
  };

  useEffect(() => {
    return () => {
      audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    modifications.current = [];
  }, [product.id]);

  useEffect(() => {
    fetchStock();
    fetchFullProduct();
  }, [product.id]);

  const fetchFullProduct = async () => {
    try {
      const res = await apiFetch(`/api/products/${product.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.codigoBarras) setCodigoBarras(data.codigoBarras);
        else if (data.gtin) setCodigoBarras(data.gtin);

        let allImages: string[] = [];
        if (data.midia?.imagens) {
          const { imagensURL, externas, internas } = data.midia.imagens;
          if (imagensURL) allImages.push(...imagensURL.map((i: { link: string }) => i.link));
          if (externas) allImages.push(...externas.map((i: { link: string }) => i.link));
          if (internas) allImages.push(...internas.map((i: { link: string }) => i.link));
        }
        allImages = Array.from(new Set(allImages)).filter(Boolean);
        if (allImages.length > 0) setImagens(allImages);
      }
    } catch (e) {
      console.error("Product full fetch error", e);
    }
  };

  const fetchStock = async () => {
    setIsStockLoading(true);
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
    } finally {
      setIsStockLoading(false);
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
    const cleanScannedCode = /^\s*[\d\s]+\s*$/.test(scannedCode) ? scannedCode.replace(/\s+/g, "") : scannedCode.trim();
    const cleanCodigo = /^\s*[\d\s]+\s*$/.test(codigo) ? codigo.replace(/\s+/g, "") : codigo.trim();
    const cleanCodigoBarras = /^\s*[\d\s]+\s*$/.test(codigoBarras) ? codigoBarras.replace(/\s+/g, "") : codigoBarras.trim();

    const normalizeCode = (code: string) => code.replace(/^0+/, "").toUpperCase();

    const isValid = normalizeCode(cleanScannedCode) === normalizeCode(cleanCodigo) || 
                    (cleanCodigoBarras && normalizeCode(cleanScannedCode) === normalizeCode(cleanCodigoBarras));

    if (isValid) {
      setRealQty((prev) => (prev === "" ? 1 : Number(prev) + 1));
      playBeep(800, 0.1, "sine");
      toast.success("+1 unidade adicionada!", { position: "top-center" });
    } else {
      playBeep(300, 0.3, "sawtooth");
      toast.error("Código lido não confere com o produto atual!", { position: "top-center" });
    }
  };

  const saveToBling = async () => {
    setIsSavingDetails(true);
    try {
      if (nome !== product.nome) modifications.current.push("Nome alterado");
      if (codigo !== product.codigo)
        modifications.current.push("Código alterado");

      const payload: {
        nome: string;
        codigo: string;
        situacao: string;
        formato: string;
        tipo: string;
        preco: number;
        midia?: {
          imagens: {
            imagensURL: Array<{ link: string }>;
          };
        };
      } = {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao salvar no Bling", { description: message });
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

    if (diff !== 0) {
      setIsPostingBalance(true);
      try {
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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error("Erro ao registrar balanço no Bling", {
          description: message,
        });
      } finally {
        setIsPostingBalance(false);
      }
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
                <img src={imagens[0]} alt="Produto" className="h-full w-full object-cover" />
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
              {isStockLoading ? (
                <span className="text-sm font-normal text-zinc-400 animate-pulse">Carregando...</span>
              ) : (
                <>{expectedQty}{" "}
                <span className="text-sm font-normal text-zinc-500">cx/un</span></>
              )}
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
                onClick={() => {
                  onExternalScannerOpen?.();
                  setIsScannerOpen(true);
                }}
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
        <Button onClick={handleConfirm} size="lg" className="w-[200px]" disabled={isSavingDetails || isPostingBalance}>
          {isPostingBalance ? "Registrando balanço..." : <><Check className="mr-2 h-5 w-5" /> Confirmar Saldo</>}
        </Button>
      </CardFooter>
      {isScannerOpen && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setIsScannerOpen(false)}
        />
      )}

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
                <img src={img} alt={`imagem ${idx}`} className="w-full h-full object-cover" />
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
