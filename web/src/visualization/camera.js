const EPSILON = 1e-9;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class ArenaCamera {
  constructor({ minZoom = 1, maxZoom = 40 } = {}) {
    this.minZoom = minZoom;
    this.maxZoom = maxZoom;
    this.zoom = minZoom;
    this.centerX = 0;
    this.centerY = 0;
  }

  reset() {
    this.zoom = this.minZoom;
    this.centerX = 0;
    this.centerY = 0;
  }

  isFit() {
    return Math.abs(this.zoom - this.minZoom) < EPSILON
      && Math.abs(this.centerX) < EPSILON
      && Math.abs(this.centerY) < EPSILON;
  }

  frame({ width, height, arenaSize, padding = 0 }) {
    const arena = Math.max(Number(arenaSize) || 0, EPSILON);
    const side = Math.max(1, Math.min(width, height) - 2 * padding);
    const fitLeft = (width - side) / 2;
    const fitTop = (height - side) / 2;
    const pixelsPerUnit = (side / arena) * this.zoom;
    const viewportCenterX = width / 2;
    const viewportCenterY = height / 2;

    return {
      arena,
      side,
      fitLeft,
      fitTop,
      pixelsPerUnit,
      viewportCenterX,
      viewportCenterY,
      toCanvasX: (x) => viewportCenterX + (x - this.centerX) * pixelsPerUnit,
      toCanvasY: (y) => viewportCenterY - (y - this.centerY) * pixelsPerUnit,
      toWorldX: (x) => this.centerX + (x - viewportCenterX) / pixelsPerUnit,
      toWorldY: (y) => this.centerY - (y - viewportCenterY) / pixelsPerUnit,
    };
  }

  clampToArena(arenaSize) {
    const arena = Math.max(Number(arenaSize) || 0, EPSILON);
    if (this.zoom <= this.minZoom + EPSILON) {
      this.reset();
      return;
    }
    const halfVisible = arena / (2 * this.zoom);
    const maxCenter = Math.max(0, arena / 2 - halfVisible);
    this.centerX = clamp(this.centerX, -maxCenter, maxCenter);
    this.centerY = clamp(this.centerY, -maxCenter, maxCenter);
  }

  panScreen(dx, dy, frame) {
    if (!frame || this.isFit()) return;
    this.centerX -= dx / frame.pixelsPerUnit;
    this.centerY += dy / frame.pixelsPerUnit;
    this.clampToArena(frame.arena);
  }

  zoomAt(factor, screenX, screenY, frame) {
    if (!frame || !Number.isFinite(factor) || factor <= 0) return;
    const anchorX = frame.toWorldX(screenX);
    const anchorY = frame.toWorldY(screenY);
    const oldZoom = this.zoom;
    const nextZoom = clamp(oldZoom * factor, this.minZoom, this.maxZoom);
    if (Math.abs(nextZoom - oldZoom) < EPSILON) return;

    this.zoom = nextZoom;
    const ratio = oldZoom / nextZoom;
    this.centerX = anchorX - (anchorX - this.centerX) * ratio;
    this.centerY = anchorY - (anchorY - this.centerY) * ratio;
    this.clampToArena(frame.arena);
  }

  label() {
    return this.isFit() ? "Fit" : `${this.zoom.toFixed(this.zoom < 10 ? 1 : 0)}×`;
  }
}
