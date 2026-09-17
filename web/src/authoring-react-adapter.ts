export type AuthoringArtifactPresentation = {
  id: string;
  label: string;
  controls: string;
  selected: boolean;
  dirty: boolean;
};

export type AuthoringPresentationSnapshot = {
  workbench: HTMLElement;
  headMount: HTMLElement;
  tabsMount: HTMLElement;
  statusText: string;
  statusState: string;
  applyDisabled: boolean;
  artifacts: AuthoringArtifactPresentation[];
};

function ensureMount(before: HTMLElement, attribute: string): HTMLElement {
  const parent = before.parentElement;
  if (!parent) throw new Error('Authoring presentation mount parent is missing.');
  const existing = parent.querySelector<HTMLElement>(`:scope > [${attribute}]`);
  if (existing) return existing;
  const mount = document.createElement('div');
  mount.setAttribute(attribute, '');
  parent.insertBefore(mount, before);
  return mount;
}

export function readAuthoringPresentation(): AuthoringPresentationSnapshot | null {
  const workbench = document.querySelector<HTMLElement>('#authoring-workbench');
  const legacyHead = workbench?.querySelector<HTMLElement>('.authoring-workbench-head') ?? null;
  const legacyTabs = workbench?.querySelector<HTMLElement>('#authoring-tabs') ?? null;
  const runtimeState = workbench?.querySelector<HTMLElement>('#authoring-runtime-state') ?? null;
  const apply = workbench?.querySelector<HTMLButtonElement>('#apply-workspace') ?? null;
  if (!workbench || !legacyHead || !legacyTabs || !runtimeState || !apply) return null;

  const artifacts = [...legacyTabs.querySelectorAll<HTMLButtonElement>('.authoring-tab')].flatMap((tab) => {
    const id = tab.dataset.artifactId;
    const controls = tab.getAttribute('aria-controls');
    if (!id || !controls) return [];
    return [{
      id,
      label: tab.textContent?.trim() || id,
      controls,
      selected: tab.getAttribute('aria-selected') === 'true',
      dirty: tab.hasAttribute('data-dirty'),
    }];
  });

  return {
    workbench,
    headMount: ensureMount(legacyHead, 'data-vlab-react-authoring-head-root'),
    tabsMount: ensureMount(legacyTabs, 'data-vlab-react-authoring-tabs-root'),
    statusText: runtimeState.textContent?.trim() || 'Runtime sources applied',
    statusState: runtimeState.dataset.state || 'clean',
    applyDisabled: apply.disabled,
    artifacts,
  };
}

export function selectAuthoringArtifact(id: string): void {
  const escaped = CSS.escape(id);
  document.querySelector<HTMLButtonElement>(`#authoring-tabs .authoring-tab[data-artifact-id="${escaped}"]`)?.click();
}

export function applyAuthoringChanges(): void {
  document.querySelector<HTMLButtonElement>('#apply-workspace')?.click();
}

export function subscribeAuthoringPresentation(callback: () => void): () => void {
  const workbench = document.querySelector<HTMLElement>('#authoring-workbench');
  const legacyHead = workbench?.querySelector<HTMLElement>('.authoring-workbench-head') ?? null;
  const legacyTabs = workbench?.querySelector<HTMLElement>('#authoring-tabs') ?? null;
  const observers: MutationObserver[] = [];

  if (legacyHead) {
    const observer = new MutationObserver(callback);
    observer.observe(legacyHead, {
      attributes: true,
      attributeFilter: ['disabled', 'data-state'],
      childList: true,
      characterData: true,
      subtree: true,
    });
    observers.push(observer);
  }

  if (legacyTabs) {
    const observer = new MutationObserver(callback);
    observer.observe(legacyTabs, {
      attributes: true,
      attributeFilter: ['aria-selected', 'data-dirty'],
      childList: true,
      characterData: true,
      subtree: true,
    });
    observers.push(observer);
  }

  return () => observers.forEach((observer) => observer.disconnect());
}
