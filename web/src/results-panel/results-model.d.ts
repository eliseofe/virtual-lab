import type { Model } from '../runtime/runtime-model.js';

export type ResultsMetric = Readonly<{ id: string; label: string; color: string }>;
export type ResultsPanel = Readonly<{ id: number; metricIds: readonly string[] }>;
export type ResultsState = Readonly<{
  status: Readonly<{ text: string; state: string }>;
  canAdd: boolean;
  metrics: readonly ResultsMetric[];
  panels: readonly ResultsPanel[];
}>;

export const RESULTS_INITIAL_STATE: ResultsState;
export const resultsModel: Model<ResultsState>;
