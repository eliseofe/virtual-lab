export type SimulationCommands = {
  run(): void;
  pause(): void;
  restart(): void;
  restartWithNewSeed(): void;
  fitArena(): void;
  setSpeed(value: number): void;
  setGlyph(value: string): void;
};

export function provideSimulationCommands(commands: SimulationCommands): void;
export const simulationCommands: Readonly<SimulationCommands>;
