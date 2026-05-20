import { useState, useEffect, useRef } from "react";
import { SwitchCamera, X } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeCameraScanConfig } from "html5-qrcode";
import { Button } from "@/components/ui/button";

export function BarcodeScanner({
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
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const abortRef = useRef(false);

  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    abortRef.current = false;
    isScanning.current = false;
    setError("");

    const el = document.getElementById("reader");
    if (!el) {
      setError("Elemento leitor não encontrado");
      return;
    }

    const qrCode = new Html5Qrcode("reader");
    scannerRef.current = qrCode;

    const startPromise = qrCode.start(
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
      } as Html5QrcodeCameraScanConfig & { formatsToSupport: Html5QrcodeSupportedFormats[]; useBarCodeDetectorIfSupported: boolean },
      (decodedText) => {
        if (isScanning.current) return;
        isScanning.current = true;
        const sanitizedText = decodedText.replace(/\s+/g, "");
        onScanRef.current(sanitizedText);
        setTimeout(() => {
          isScanning.current = false;
        }, 1500);
      },
      () => {},
    );

    startPromise.catch((err) => {
      if (abortRef.current) return;
      setError(err.message || "Não foi possível iniciar a câmera");
    });

    return () => {
      abortRef.current = true;
      qrCode.stop().catch(() => {});
      scannerRef.current = null;
    };
  }, [facingMode]);

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
