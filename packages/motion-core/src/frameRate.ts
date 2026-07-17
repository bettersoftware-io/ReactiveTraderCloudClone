// Pure frame-rate + heap math for the HUD status-bar readouts (react-scan-style
// FPS meter). Zero-dependency, DOM-free: the caller/shell holds the frame
// counters and injects the elapsed window + heap bytes. See ADR-005 §②.

/** Traffic-light tone for a live FPS reading — maps 1:1 to the status-bar CSS
 *  accent vars `--accent-positive` / `--accent-aware` / `--accent-negative`. */
export type MetricTone = "positive" | "aware" | "negative";

/** Frames-per-second thresholds, react-scan-style: green ≥55, amber ≥30, red below. */
export const FPS_GOOD = 55;
export const FPS_WARN = 30;

/** Integer fps = frames counted over the elapsed window (react-scan's 1s bucket).
 *  Guards a non-positive window by returning 0. */
export function computeFps(frameCount: number, elapsedMs: number): number {
  if (elapsedMs <= 0) {
    return 0;
  }

  return Math.round((frameCount * 1000) / elapsedMs);
}

/** Traffic-light tone for an fps value. */
export function fpsTone(fps: number): MetricTone {
  if (fps >= FPS_GOOD) {
    return "positive";
  }

  if (fps >= FPS_WARN) {
    return "aware";
  }

  return "negative";
}

const BYTES_PER_MB = 1024 * 1024;

/** Used JS-heap bytes → the footer's "248MB" value shape (integer MB). */
export function formatHeapMb(usedBytes: number): string {
  return `${Math.round(usedBytes / BYTES_PER_MB)}MB`;
}
