export type AuthoringDiagnostic = {
  artifact: string;
  severity: "error" | "warning";
  message: string;
  line: number | null;
  column: number | null;
  category: string | null;
};

export type AuthoringCompletionItem = {
  value: string;
  caption: string;
  score: number;
  meta: string;
};

export function normalizeAuthoringDiagnostic(error: unknown, fallbackArtifact: string): AuthoringDiagnostic;
export function collectArtifactDiagnostics(
  sources: Record<string, string>,
  options?: { seed?: number },
): Record<string, AuthoringDiagnostic[]>;
export function artifactCompletionItems(
  id: string,
  sources: Record<string, string>,
): AuthoringCompletionItem[];
