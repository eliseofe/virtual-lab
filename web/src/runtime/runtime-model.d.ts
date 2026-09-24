export type RuntimeRunState = 'initializing' | 'running' | 'paused';

export type RuntimeState = Readonly<{
  simulatorStatus: Readonly<{ state: string; text: string }>;
  runState: RuntimeRunState;
  seed: number;
  scientificTime: number;
  physicsTicks: unknown;
  controlUpdates: unknown;
  actualSpeed: number | null;
  requestedSpeed: number;
  glyph: string;
  camera: Readonly<{ label: string; fit: boolean }>;
  controls: Readonly<{ run: boolean; pause: boolean; restart: boolean; newSeed: boolean; speed: boolean; fit: boolean; applySources: boolean }>;
  sourceStatus: Readonly<{
    setup: Readonly<{ state: string; text: string }>;
    controller: Readonly<{ state: string; text: string }>;
  }>;
  sourceApplyRequest: Readonly<{ kind: 'setup' | 'controller' }> | null;
}>;

export type RuntimeModel = {
  get(): RuntimeState;
  set(patch: Partial<RuntimeState>): void;
  subscribe(listener: (state: RuntimeState, written: string[]) => void): () => void;
};

export const RUNTIME_INITIAL_STATE: RuntimeState;
export function createRuntimeModel(initialState?: RuntimeState): RuntimeModel;
export const runtimeModel: RuntimeModel;

export type Model<State> = {
  get(): State;
  set(patch: Partial<State>): void;
  subscribe(listener: (state: State, written: string[]) => void): () => void;
};
export function createModel<State extends object>(initialState: State): Model<State>;
