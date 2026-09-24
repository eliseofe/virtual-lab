export type ResultsCommands = {
  addPanel(): void;
  // A plot showing exactly these metrics, e.g. from a saved results layout.
  addPanelWithMetrics(metricIds: string[]): void;
  removePanel(panelId: number): void;
  toggleMetric(panelId: number, metricId: string): void;
  followLive(panelId: number): void;
};

export function provideResultsCommands(commands: ResultsCommands): void;
export const resultsCommands: Readonly<ResultsCommands>;
