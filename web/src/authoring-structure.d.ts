export type AuthoringSymbol = {
  kind: "parameter" | "function" | "class" | "state" | "method" | "metric" | string;
  name: string;
  line: number;
  id?: string;
  function?: string;
  metadataLine?: number;
  params?: string[];
};

export type AuthoringStructure = {
  language: string;
  symbols: AuthoringSymbol[];
  error: string | null;
};

export function artifactStructure(id: string, source: string): Omit<AuthoringStructure, "error">;
export function artifactStructureSafe(id: string, source: string): AuthoringStructure;
export function symbolLabel(symbol: AuthoringSymbol): string;
