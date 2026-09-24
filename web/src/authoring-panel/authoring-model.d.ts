import type { Model } from '../runtime/runtime-model.js';

export type AuthoringArtifact = Readonly<{ id: string; label: string; controls: string }>;
export type AuthoringState = Readonly<{
  artifacts: readonly AuthoringArtifact[];
  active: string;
  dirty: Readonly<Record<string, boolean>>;
  status: Readonly<{ text: string; state: string }>;
  applyDisabled: boolean;
}>;

export const AUTHORING_INITIAL_STATE: AuthoringState;
export const authoringModel: Model<AuthoringState>;
export function setArtifactDirty(id: string, dirty: boolean): void;
