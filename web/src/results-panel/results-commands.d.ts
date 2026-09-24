export type ResultsCommands = {
  addPanel(): void;
  removePanel(panelId: number): void;
  toggleMetric(panelId: number, metricId: string): void;
  followLive(panelId: number): void;
};

export function provideResultsCommands(commands: ResultsCommands): void;
export const resultsCommands: Readonly<ResultsCommands>;
