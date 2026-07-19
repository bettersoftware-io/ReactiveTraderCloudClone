/** One satellite's resting offset from the FAB centre (px) plus its
 * fan-out stagger delay (ms). Consumed by `RadialCommandDock`. */
export interface SatelliteLayout {
  readonly tx: number;
  readonly ty: number;
  readonly delayMs: number;
}

const RADIUS_PX = 118;
const ARC_START_DEG = 150;
const ARC_END_DEG = 30;
const STAGGER_MS = 45;

/** Fan `count` satellites across the top arc (150°→30°), evenly spaced, at a
 * fixed radius. Mirrors the prototype's `angles = [150,120,90,60,30]; r = 118`
 * for the 5-module dock: `tx = cos(a)·r`, `ty = -sin(a)·r` (screen y is down,
 * so the arc bows upward), each staggered `index · 45ms`. Pure — no RN/Skia. */
export function radialDockLayout(count: number): readonly SatelliteLayout[] {
  const span = count > 1 ? (ARC_START_DEG - ARC_END_DEG) / (count - 1) : 0;
  return Array.from({ length: count }, (_unused, index): SatelliteLayout => {
    const deg = ARC_START_DEG - span * index;
    const a = (deg * Math.PI) / 180;
    return {
      tx: Math.round(Math.cos(a) * RADIUS_PX),
      ty: Math.round(-Math.sin(a) * RADIUS_PX),
      delayMs: index * STAGGER_MS,
    };
  });
}
