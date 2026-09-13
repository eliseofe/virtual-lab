function positiveFinite(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class RuntimePacer {
  constructor(physicsDt, {
    targetWorkMs = 8,
    maxChunkTicks = 512,
    maxBacklogChunks = 2,
    maxDelayMs = 10,
  } = {}) {
    this.physicsDt = positiveFinite(physicsDt, 0.01);
    this.targetWorkMs = positiveFinite(targetWorkMs, 8);
    this.maxChunkTicks = Math.max(1, Math.trunc(positiveFinite(maxChunkTicks, 512)));
    this.maxBacklogChunks = Math.max(1, Math.trunc(positiveFinite(maxBacklogChunks, 2)));
    this.maxDelayMs = positiveFinite(maxDelayMs, 10);
    this.running = false;
    this.targetSpeed = 1;
    this.lastWallMs = 0;
    this.tickCredit = 0;
    this.msPerTickEstimate = null;
  }

  start(nowMs, targetSpeed) {
    this.running = true;
    this.targetSpeed = positiveFinite(targetSpeed, 1);
    this.lastWallMs = Number(nowMs) || 0;
    this.tickCredit = 0;
  }

  pause() {
    this.running = false;
    this.tickCredit = 0;
  }

  setSpeed(nowMs, targetSpeed) {
    this.targetSpeed = positiveFinite(targetSpeed, 1);
    this.lastWallMs = Number(nowMs) || 0;
    // A live speed change starts from "now". Old high-speed backlog must not
    // leak into the new requested rate.
    this.tickCredit = 0;
  }

  adaptiveChunkLimit() {
    if (!(this.msPerTickEstimate > 0)) return 1;
    return clamp(
      Math.floor(this.targetWorkMs / this.msPerTickEstimate),
      1,
      this.maxChunkTicks,
    );
  }

  plan(nowMs) {
    if (!this.running) return { ticks: 0, delayMs: null };

    const now = Number(nowMs) || 0;
    const elapsedMs = Math.max(0, now - this.lastWallMs);
    this.lastWallMs = now;

    this.tickCredit += (elapsedMs / 1000) * (this.targetSpeed / this.physicsDt);

    const chunkLimit = this.adaptiveChunkLimit();
    const backlogCap = chunkLimit * this.maxBacklogChunks;
    this.tickCredit = Math.min(this.tickCredit, backlogCap);

    const availableTicks = Math.floor(this.tickCredit + 1e-12);
    if (availableTicks < 1) {
      const ticksPerMs = this.targetSpeed / (this.physicsDt * 1000);
      const delayMs = ticksPerMs > 0
        ? clamp((1 - this.tickCredit) / ticksPerMs, 0, this.maxDelayMs)
        : this.maxDelayMs;
      return { ticks: 0, delayMs };
    }

    const ticks = Math.min(availableTicks, chunkLimit);
    this.tickCredit -= ticks;
    return { ticks, delayMs: 0 };
  }

  recordWork(ticks, elapsedMs) {
    if (!(ticks > 0) || !(elapsedMs >= 0)) return;
    const sample = Math.max(Number.EPSILON, elapsedMs / ticks);
    this.msPerTickEstimate = this.msPerTickEstimate == null
      ? sample
      : this.msPerTickEstimate * 0.75 + sample * 0.25;
  }
}
