export type AuthoringCommands = {
  selectArtifact(id: string): void;
  apply(): void;
};

export function provideAuthoringCommands(commands: AuthoringCommands): void;
export const authoringCommands: Readonly<AuthoringCommands>;
