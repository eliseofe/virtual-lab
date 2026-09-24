// The live-results controller's commands (#564), provided by results-ui.js and
// called by every view: the React results panel, the legacy plot buttons and
// modules that manage plots. One instance in the page.

let provided = null;

export function provideResultsCommands(commands) {
  provided = commands;
}

export const resultsCommands = Object.freeze({
  addPanel: () => provided?.addPanel(),
  addPanelWithMetrics: (metricIds) => provided?.addPanelWithMetrics(metricIds),
  removePanel: (panelId) => provided?.removePanel(panelId),
  toggleMetric: (panelId, metricId) => provided?.toggleMetric(panelId, metricId),
  followLive: (panelId) => provided?.followLive(panelId),
});
