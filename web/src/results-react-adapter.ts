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

type LegacyResultsApi = {
  metricIds?: () => string[];
  panelBindings?: () => Array<{ id: number; metricIds: string[] }>;
};

declare global {
  interface Window {
    __vlabResultsUI?: LegacyResultsApi;
  }
}

function legacyApi(): LegacyResultsApi | null {
  return window.__vlabResultsUI ?? null;
}

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

function legacyMetricPresentation(ids: string[]): ResultsMetricPresentation[] {
  const firstPanel = document.querySelector<HTMLElement>('.results-plot-panel');
  const options = firstPanel ? [...firstPanel.querySelectorAll<HTMLElement>('.results-series-option')] : [];
  return ids.map((id, index) => ({
    id,
    label: options[index]?.querySelector<HTMLElement>('.results-series-name')?.textContent?.trim() || id,
    color: options[index]?.querySelector<HTMLElement>('.results-series-swatch')?.style.getPropertyValue('--series-color') || 'currentColor',
  }));
}

export function readResultsPresentation(): ResultsPresentationSnapshot | null {
  const results = document.querySelector<HTMLElement>('#live-results');
  const panelHost = document.querySelector<HTMLElement>('#results-panels');
  const api = legacyApi();
  if (!results || !panelHost || !api) return null;

  const metricIds = api.metricIds?.() ?? [];
  const bindings = api.panelBindings?.() ?? [];
  const panels = bindings.flatMap((binding) => {
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
    statusText: document.querySelector<HTMLElement>('#live-results-status')?.textContent?.trim() || 'Results',
    statusState: document.querySelector<HTMLElement>('#live-results-status')?.dataset.state || 'idle',
    canAdd: !(document.querySelector<HTMLButtonElement>('#results-add-panel')?.disabled ?? true),
    metrics: legacyMetricPresentation(metricIds),
    panels,
  };
}

export function addResultsPanel(): void {
  document.querySelector<HTMLButtonElement>('#results-add-panel')?.click();
}

export function toggleResultsMetric(panelId: number, metricId: string): void {
  const panel = panelElement(panelId);
  const ids = legacyApi()?.metricIds?.() ?? [];
  const index = ids.indexOf(metricId);
  const input = index >= 0
    ? panel?.querySelectorAll<HTMLInputElement>('.results-series-option input[type="checkbox"]')[index]
    : null;
  input?.click();
}

export function removeResultsPanel(panelId: number): void {
  panelElement(panelId)?.querySelector<HTMLButtonElement>('[data-action="remove"]')?.click();
}

export function followLiveResults(panelId: number): void {
  panelElement(panelId)?.querySelector<HTMLButtonElement>('[data-action="reset-view"]')?.click();
}

export function subscribeResultsPresentation(callback: () => void): () => void {
  const panelHost = document.querySelector<HTMLElement>('#results-panels');
  const observer = panelHost ? new MutationObserver(() => callback()) : null;
  // Intentionally watch only direct panel insertion/removal. React portals live inside
  // each panel, so their own rendering cannot retrigger this observer.
  observer?.observe(panelHost!, { childList: true });

  const events = ['vlab:metrics-definition', 'vlab:metric-batch', 'vlab:metric-reset'];
  for (const event of events) document.addEventListener(event, callback);
  return () => {
    observer?.disconnect();
    for (const event of events) document.removeEventListener(event, callback);
  };
}

export function panelIdFromEventTarget(target: EventTarget | null): number | null {
  const element = target instanceof Element ? target : null;
  const canvas = element?.closest<HTMLElement>('.results-plot-canvas');
  if (!canvas) return null;
  const panel = canvas.closest<HTMLElement>('.results-plot-panel');
  const id = Number(panel?.dataset.resultsPanelId);
  return Number.isInteger(id) && id > 0 ? id : null;
}
