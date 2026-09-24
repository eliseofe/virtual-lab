import type { RuntimeRunState } from './runtime-model.js';

export function formatRunState(runState: RuntimeRunState): string;
export function formatSeed(seed: number): string;
export function formatScientificTime(scientificTime: number): string;
export function formatCount(count: unknown): string;
export function formatActualSpeed(actualSpeed: number | null): string;
