import { authoringCommands } from './authoring-panel/authoring-commands.js';
import { authoringModel } from './authoring-panel/authoring-model.js';

export type AuthoringArtifactPresentation = {
  id: string;
  label: string;
  controls: string;
  selected: boolean;
  dirty: boolean;
  source: HTMLTextAreaElement | null;
  editorMount: HTMLElement | null;
  format: string;
  language: string;
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

function artifactLanguage(source: HTMLTextAreaElement | null): string {
  return source?.dataset.experimentArtifactLanguage?.trim() || 'plain';
}

// The authoring panel reads the authoring model and acts through the
// authoring controller (#564); the page is used only to place the React mounts
// and the code editors next to their source text areas.
export function readAuthoringPresentation(): AuthoringPresentationSnapshot | null {
  const workbench = document.querySelector<HTMLElement>('#authoring-workbench');
  const legacyHead = workbench?.querySelector<HTMLElement>('.authoring-workbench-head') ?? null;
  const legacyTabs = workbench?.querySelector<HTMLElement>('#authoring-tabs') ?? null;
  if (!workbench || !legacyHead || !legacyTabs) return null;

  const state = authoringModel.get();
  const artifacts = state.artifacts.flatMap(({ id, label, controls }) => {
    if (!id || !controls) return [];
    const pane = document.getElementById(controls);
    const source = pane?.querySelector<HTMLTextAreaElement>('textarea.code-editor') ?? null;
    return [{
      id,
      label,
      controls,
      selected: id === state.active,
      dirty: Boolean(state.dirty[id]),
      source,
      editorMount: source ? ensureEditorMount(source, id) : null,
      format: artifactFormat(id, source),
      language: artifactLanguage(source),
    }];
  });

  return {
    workbench,
    headMount: ensureMount(legacyHead, 'data-vlab-react-authoring-head-root'),
    tabsMount: ensureMount(legacyTabs, 'data-vlab-react-authoring-tabs-root'),
    statusText: state.status.text.trim() || 'Runtime sources applied',
    statusState: state.status.state || 'clean',
    applyDisabled: state.applyDisabled,
    artifacts,
  };
}

export function selectAuthoringArtifact(id: string): void {
  authoringCommands.selectArtifact(id);
}

export function applyAuthoringChanges(): void {
  authoringCommands.apply();
}

export function subscribeAuthoringPresentation(callback: () => void): () => void {
  return authoringModel.subscribe(() => callback());
}
