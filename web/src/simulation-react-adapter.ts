import { runtimeModel } from './runtime/runtime-model.js';
import {
  formatActualSpeed,
  formatCount,
  formatRunState,
  formatScientificTime,
  formatSeed,
  formatTargetSpeed,
} from './runtime/runtime-format.js';
import { simulationCommands } from './runtime/simulation-commands.js';

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
  // The panel is placed into the legacy stage and needs the complete page; all
  // values come from the runtime model and actions go to the simulation
  // controller (#560, #562).
  const stage = document.querySelector<HTMLElement>('.stage-panel');
  const legacyHeading = stage?.querySelector<HTMLElement>(':scope > .stage-heading') ?? null;
  const speed = document.querySelector<HTMLInputElement>('#simulation-speed');
  if (!stage || !legacyHeading || !speed) return null;

  const runtime = runtimeModel.get();
  return {
    stage,
    mount: ensureMount(stage, legacyHeading),
    boundaryLabel: legacyHeading.querySelector<HTMLElement>('.badge')?.textContent?.trim() || 'Arena',
    runState: formatRunState(runtime.runState),
    seed: formatSeed(runtime.seed),
    speed: Number.isFinite(runtime.requestedSpeed) ? runtime.requestedSpeed : 1,
    speedMin: numberAttribute(speed, 'min', 1),
    speedMax: numberAttribute(speed, 'max', 100),
    speedStep: numberAttribute(speed, 'step', 1),
    targetSpeed: formatTargetSpeed(runtime.requestedSpeed),
    actualSpeed: formatActualSpeed(runtime.actualSpeed),
    scientificTime: formatScientificTime(runtime.scientificTime),
    physicsTicks: formatCount(runtime.physicsTicks),
    controlUpdates: formatCount(runtime.controlUpdates),
    cameraStatus: runtime.camera.label,
    glyph: runtime.glyph || 'directional',
    runDisabled: !runtime.controls.run,
    pauseDisabled: !runtime.controls.pause,
    restartDisabled: !runtime.controls.restart,
    newSeedDisabled: !runtime.controls.newSeed,
    speedDisabled: !runtime.controls.speed,
    fitDisabled: !runtime.controls.fit,
  };
}

const actions = {
  run: simulationCommands.run,
  pause: simulationCommands.pause,
  restart: simulationCommands.restart,
  newSeed: simulationCommands.restartWithNewSeed,
  fit: simulationCommands.fitArena,
} as const;

export function invokeSimulationAction(action: keyof typeof actions): void {
  actions[action]();
}

export function setSimulationSpeed(value: number): void {
  simulationCommands.setSpeed(value);
}

export function setSimulationGlyph(value: string): void {
  simulationCommands.setGlyph(value);
}

export function subscribeSimulationPresentation(callback: () => void): () => void {
  return runtimeModel.subscribe(() => callback());
}
