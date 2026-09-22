export type AuthoringArtifactPresentation = {
  id: string;
  label: string;
  controls: string;
  selected: boolean;
  dirty: boolean;
  source: HTMLTextAreaElement | null;
  editorMount: HTMLElement | null;
  format: string;
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

function ensureEditorMount(source: HTMLTextAreaElement, id: string): HTMLElement {
  const parent = source.parentElement;
  if (!parent) throw new Error(`Authoring editor '${id}' has no mount parent.`);
  const existing = [...parent.children].find(
    (child) => child instanceof HTMLElement && child.dataset.vlabCodeEditorRoot === id,
  );
  if (existing instanceof HTMLElement) return existing;
  const mount = document.createElement('div');
  mount.dataset.vlabCodeEditorRoot = id;
  source.insertAdjacentElement('afterend', mount);
  return mount;
}

function artifactFormat(id: string, source: HTMLTextAreaElement | null): string {
  const declared = source?.dataset.experimentArtifactFormat?.trim();
  if (declared) return declared;
  return id === 'metrics' ? 'python-vlab-metrics/0.1' : 'python-vlab';
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
    const pane = document.getElementById(controls);
    const source = pane?.querySelector<HTMLTextAreaElement>('textarea.code-editor') ?? null;
    return [{
      id,
      label: tab.textContent?.trim() || id,
      controls,
      selected: tab.getAttribute('aria-selected') === 'true',
      dirty: tab.hasAttribute('data-dirty'),
      source,
      editorMount: source ? ensureEditorMount(source, id) : null,
      format: artifactFormat(id, source),
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
  const additionalArtifacts = workbench?.querySelector<HTMLElement>('#additional-experiment-artifacts') ?? null;
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

  if (additionalArtifacts) {
    const observer = new MutationObserver(callback);
    observer.observe(additionalArtifacts, { childList: true });
    observers.push(observer);
  }

  return () => observers.forEach((observer) => observer.disconnect());
}
