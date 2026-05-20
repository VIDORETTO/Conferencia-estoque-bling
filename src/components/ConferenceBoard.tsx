import React, { useState, useRef } from "react";
import { Search, ScanLine, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "../lib/apiFetch";
import type { Product, ConferenceItem } from "../types";
import { BarcodeScanner } from "./BarcodeScanner";
import { ExportExcelButton } from "./ExportExcelButton";
import { ProductDetailsEditor } from "./ProductDetailsEditor";

interface BlingSearchItem {
  id: number;
  nome: string;
  codigo: string;
  preco: number;
  tipo: string;
  situacao: string;
  formato: string;
  descricaoCurta?: string;
  midia?: {
    imagens?: {
      imagensURL?: Array<{ link: string }>;
      externas?: Array<{ link: string }>;
      internas?: Array<{ link: string }>;
    };
  };
}

export function ConferenceBoard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sessionItems, setSessionItems] = useState<ConferenceItem[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchProduct = async (term: string) => {
    if (!term.trim()) return;

    const cleanTerm = /^\s*[\d\s]+\s*$/.test(term) ? term.replace(/\s+/g, "") : term.trim();

    setIsSearching(true);
    try {
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
        const mappedData = data.map((item: BlingSearchItem) => ({
          ...item,
          imagemURL:
            item.midia?.imagens?.imagensURL?.[0]?.link ||
            item.midia?.imagens?.externas?.[0]?.link ||
            item.midia?.imagens?.internas?.[0]?.link ||
            "",
        }));
        setSearchResults(mappedData);
        if (mappedData.length === 1) {
          handleSelectProduct(mappedData[0]);
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
  ) => {
    setSelectedProduct(product);
    setSearchTerm("");
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

  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);

  const confirmClearSession = () => {
    setSessionItems([]);
    setIsClearDialogOpen(false);
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
                    disabled={!!selectedProduct}
                    title={selectedProduct ? "Feche o editor de produto primeiro" : "Abrir scanner"}
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
                onExternalScannerOpen={() => setIsScannerOpen(false)}
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
                            {item.realQty}
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
                onClick={() => setIsClearDialogOpen(true)}
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
                    <TableHead>Link Foto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessionItems.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
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
                        <TableCell>
                          {item.product.imagemURL ? (
                            <a
                              href={item.product.imagemURL}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 underline hover:text-blue-800"
                            >
                              Ver Foto
                            </a>
                          ) : (
                            <span className="text-xs text-zinc-400">
                              -
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

      <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Limpar Conferência</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja limpar todos os itens conferidos da sessão atual?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsClearDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmClearSession}>
              Limpar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
