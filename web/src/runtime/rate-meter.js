export class RuntimeRateMeter {
  constructor({ minElapsedMs = 250 } = {}) {
    this.minElapsedMs = minElapsedMs;
    this.reset();
  }

  reset() {
    this.startWallMs = null;
    this.startModelSeconds = null;
  }

  start(wallMs, modelSeconds) {
    if (!Number.isFinite(wallMs) || !Number.isFinite(modelSeconds)) {
      this.reset();
      return;
    }
    this.startWallMs = wallMs;
    this.startModelSeconds = modelSeconds;
  }

  sample(wallMs, modelSeconds) {
    if (!Number.isFinite(wallMs) || !Number.isFinite(modelSeconds)) return null;
    if (this.startWallMs === null || this.startModelSeconds === null) {
      this.start(wallMs, modelSeconds);
      return null;
    }

    if (modelSeconds < this.startModelSeconds || wallMs < this.startWallMs) {
      this.start(wallMs, modelSeconds);
      return null;
    }

    const elapsedMs = wallMs - this.startWallMs;
    if (elapsedMs < this.minElapsedMs || elapsedMs <= 0) return null;

    return (modelSeconds - this.startModelSeconds) / (elapsedMs / 1000);
  }
}

export function formatRuntimeFactor(factor) {
  if (!Number.isFinite(factor) || factor < 0) return "—";
  return `${factor.toFixed(factor >= 10 ? 1 : 2)}×`;
}
