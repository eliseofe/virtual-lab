import { resultsCommands } from './results/results-commands.js';
import { resultsModel } from './results/results-model.js';

export type ResultsMetricPresentation = {
  id: string;
  label: string;
  color: string;
};

export type ResultsPanelPresentation = {
  id: number;
  metricIds: string[];
  mount: HTMLElement;
};

export type ResultsPresentationSnapshot = {
  mount: HTMLElement;
  statusText: string;
  statusState: string;
  canAdd: boolean;
  metrics: ResultsMetricPresentation[];
  panels: ResultsPanelPresentation[];
};

// The results panel reads the results model and acts through the results
// controller (#564); the page is used only to place the React mounts.
function panelElement(id: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.results-plot-panel[data-results-panel-id="${id}"]`);
}

function ensureMount(parent: HTMLElement, attribute: string): HTMLElement {
  const existing = parent.querySelector<HTMLElement>(`:scope > [${attribute}]`);
  if (existing) return existing;
  const mount = document.createElement('div');
  mount.setAttribute(attribute, '');
  parent.prepend(mount);
  return mount;
}

export function readResultsPresentation(): ResultsPresentationSnapshot | null {
  const results = document.querySelector<HTMLElement>('#live-results');
  const panelHost = document.querySelector<HTMLElement>('#results-panels');
  if (!results || !panelHost) return null;

  const state = resultsModel.get();
  const panels = state.panels.flatMap((binding) => {
    const panel = panelElement(binding.id);
    if (!panel) return [];
    return [{
      id: binding.id,
      metricIds: [...binding.metricIds],
      mount: ensureMount(panel, 'data-vlab-react-results-panel-root'),
    }];
  });

  return {
    mount: ensureMount(results, 'data-vlab-react-results-header-root'),
    statusText: state.status.text.trim() || 'Results',
    statusState: state.status.state || 'idle',
    canAdd: state.canAdd,
    metrics: state.metrics.map((metric) => ({ ...metric })),
    panels,
  };
}

export function addResultsPanel(): void {
  resultsCommands.addPanel();
}

export function toggleResultsMetric(panelId: number, metricId: string): void {
  resultsCommands.toggleMetric(panelId, metricId);
}

export function removeResultsPanel(panelId: number): void {
  resultsCommands.removePanel(panelId);
}

export function followLiveResults(panelId: number): void {
  resultsCommands.followLive(panelId);
}

export function subscribeResultsPresentation(callback: () => void): () => void {
  return resultsModel.subscribe(() => callback());
}

export function panelIdFromEventTarget(target: EventTarget | null): number | null {
  const element = target instanceof Element ? target : null;
  const canvas = element?.closest<HTMLElement>('.results-plot-canvas');
  if (!canvas) return null;
  const panel = canvas.closest<HTMLElement>('.results-plot-panel');
  const id = Number(panel?.dataset.resultsPanelId);
  return Number.isInteger(id) && id > 0 ? id : null;
}
