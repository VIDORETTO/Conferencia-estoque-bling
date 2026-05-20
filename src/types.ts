export interface Product {
  id: number;
  nome: string;
  codigo: string;
  preco: number;
  tipo: string;
  situacao: string;
  formato: string;
  descricaoCurta?: string;
  imagemURL?: string;
}

export interface ConferenceItem {
  product: Product;
  expectedQty: number;
  realQty: number;
  diff: number;
  modified: boolean;
  modifications: string[];
}
