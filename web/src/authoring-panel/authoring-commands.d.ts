export type AuthoringCommands = {
  selectArtifact(id: string): void;
  apply(): void;
};

export function provideAuthoringCommands(commands: Partial<AuthoringCommands>): void;
export const authoringCommands: Readonly<AuthoringCommands>;
