import { runtimeModel } from './runtime/runtime-model.js';
import {
  formatActualSpeed,
  formatCount,
  formatRunState,
  formatScientificTime,
  formatSeed,
} from './runtime/runtime-format.js';

export type SimulationPresentationSnapshot = {
  stage: HTMLElement;
  mount: HTMLElement;
  boundaryLabel: string;
  runState: string;
  seed: string;
  speed: number;
  speedMin: number;
  speedMax: number;
  speedStep: number;
  targetSpeed: string;
  actualSpeed: string;
  scientificTime: string;
  physicsTicks: string;
  controlUpdates: string;
  cameraStatus: string;
  glyph: string;
  runDisabled: boolean;
  pauseDisabled: boolean;
  restartDisabled: boolean;
  newSeedDisabled: boolean;
  speedDisabled: boolean;
  fitDisabled: boolean;
};

function ensureMount(stage: HTMLElement, before: HTMLElement): HTMLElement {
  const existing = stage.querySelector<HTMLElement>(':scope > [data-vlab-react-simulation-root]');
  if (existing) return existing;
  const mount = document.createElement('div');
  mount.setAttribute('data-vlab-react-simulation-root', '');
  stage.insertBefore(mount, before);
  return mount;
}

function numberAttribute(element: HTMLInputElement, name: 'min' | 'max' | 'step', fallback: number) {
  const value = Number(element[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function readSimulationPresentation(): SimulationPresentationSnapshot | null {
  const stage = document.querySelector<HTMLElement>('.stage-panel');
  const legacyHeading = stage?.querySelector<HTMLElement>(':scope > .stage-heading') ?? null;
  const runState = document.querySelector<HTMLElement>('#run-state');
  const seed = document.querySelector<HTMLElement>('#run-seed');
  const speed = document.querySelector<HTMLInputElement>('#simulation-speed');
  const targetSpeed = document.querySelector<HTMLElement>('#simulation-speed-value');
  const actualSpeed = document.querySelector<HTMLElement>('#actual-simulation-speed');
  const scientificTime = document.querySelector<HTMLElement>('#scientific-time');
  const physicsTicks = document.querySelector<HTMLElement>('#physics-ticks');
  const controlUpdates = document.querySelector<HTMLElement>('#control-updates');
  const cameraStatus = document.querySelector<HTMLElement>('#camera-status');
  const glyph = document.querySelector<HTMLSelectElement>('#agent-glyph');
  const run = document.querySelector<HTMLButtonElement>('#run');
  const pause = document.querySelector<HTMLButtonElement>('#pause');
  const restart = document.querySelector<HTMLButtonElement>('#restart');
  const newSeed = document.querySelector<HTMLButtonElement>('#restart-new-seed');
  const fit = document.querySelector<HTMLButtonElement>('#fit-arena');

  if (!stage || !legacyHeading || !runState || !seed || !speed || !targetSpeed || !actualSpeed
    || !scientificTime || !physicsTicks || !controlUpdates || !cameraStatus || !glyph
    || !run || !pause || !restart || !newSeed || !fit) return null;

  // Runtime values come from the runtime model (#560); the legacy elements are
  // still required above so the panel appears only on the complete page.
  const runtime = runtimeModel.get();
  const numericSpeed = Number(speed.value);
  return {
    stage,
    mount: ensureMount(stage, legacyHeading),
    boundaryLabel: legacyHeading.querySelector<HTMLElement>('.badge')?.textContent?.trim() || 'Arena',
    runState: formatRunState(runtime.runState),
    seed: formatSeed(runtime.seed),
    speed: Number.isFinite(numericSpeed) ? numericSpeed : 1,
    speedMin: numberAttribute(speed, 'min', 1),
    speedMax: numberAttribute(speed, 'max', 100),
    speedStep: numberAttribute(speed, 'step', 1),
    targetSpeed: targetSpeed.textContent?.trim() || '—',
    actualSpeed: formatActualSpeed(runtime.actualSpeed),
    scientificTime: formatScientificTime(runtime.scientificTime),
    physicsTicks: formatCount(runtime.physicsTicks),
    controlUpdates: formatCount(runtime.controlUpdates),
    cameraStatus: cameraStatus.textContent?.trim() || 'Fit',
    glyph: glyph.value || 'directional',
    runDisabled: run.disabled,
    pauseDisabled: pause.disabled,
    restartDisabled: restart.disabled,
    newSeedDisabled: newSeed.disabled,
    speedDisabled: speed.disabled,
    fitDisabled: fit.disabled,
  };
}

const actionSelectors = {
  run: '#run',
  pause: '#pause',
  restart: '#restart',
  newSeed: '#restart-new-seed',
  fit: '#fit-arena',
} as const;

export function invokeSimulationAction(action: keyof typeof actionSelectors): void {
  document.querySelector<HTMLButtonElement>(actionSelectors[action])?.click();
}

export function setSimulationSpeed(value: number): void {
  const speed = document.querySelector<HTMLInputElement>('#simulation-speed');
  if (!speed) return;
  speed.value = String(value);
  speed.dispatchEvent(new Event('input', { bubbles: true }));
}

export function setSimulationGlyph(value: string): void {
  const glyph = document.querySelector<HTMLSelectElement>('#agent-glyph');
  if (!glyph) return;
  glyph.value = value;
  glyph.dispatchEvent(new Event('change', { bubbles: true }));
}

export function subscribeSimulationPresentation(callback: () => void): () => void {
  // Runtime values notify through the runtime model; the remaining controls are
  // still legacy elements until their own stage of #560's plan.
  const unsubscribeRuntime = runtimeModel.subscribe(() => callback());
  const observed = [
    '#simulation-speed-value', '#camera-status',
    '#run', '#pause', '#restart', '#restart-new-seed', '#simulation-speed', '#fit-arena',
  ].map((selector) => document.querySelector(selector)).filter(Boolean) as Element[];

  const observers = observed.map((element) => {
    const observer = new MutationObserver(callback);
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['disabled', 'data-fit'],
      childList: true,
      characterData: true,
      subtree: true,
    });
    return observer;
  });

  const speed = document.querySelector<HTMLInputElement>('#simulation-speed');
  const glyph = document.querySelector<HTMLSelectElement>('#agent-glyph');
  speed?.addEventListener('input', callback);
  glyph?.addEventListener('change', callback);

  return () => {
    unsubscribeRuntime();
    observers.forEach((observer) => observer.disconnect());
    speed?.removeEventListener('input', callback);
    glyph?.removeEventListener('change', callback);
  };
}
