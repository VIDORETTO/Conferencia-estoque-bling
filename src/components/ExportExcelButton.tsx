import { FileDown } from "lucide-react";
import * as xlsx from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ConferenceItem } from "@/src/types";

export function ExportExcelButton({
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
