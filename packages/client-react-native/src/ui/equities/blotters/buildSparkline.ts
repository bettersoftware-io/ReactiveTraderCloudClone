export const SPARK_WIDTH = 80;
export const SPARK_HEIGHT = 16;
export const SPARK_PAD = 2;
export const SPARK_HALF_W: number = (SPARK_WIDTH - SPARK_PAD * 2) / 2;
const CENTER_Y: number = SPARK_HEIGHT / 2;

/** SVG bar-path for a single P&L value centred on a zero line. Verbatim port of
 * web `buildSparkPath`: positive extends right, negative left; scaled by maxAbsPnl. */
export function buildSparkPath(pnl: number, maxAbsPnl: number): string {
  const safe = maxAbsPnl > 0 ? maxAbsPnl : 1;
  const fraction = Math.min(1, Math.abs(pnl) / safe);
  const barLen = fraction * SPARK_HALF_W;
  const cx = SPARK_PAD + SPARK_HALF_W;
  const barTop = CENTER_Y - 4;
  const barH = 8;

  if (pnl >= 0) {
    return `M${cx},${barTop} h${barLen} v${barH} h-${barLen} Z`;
  }

  return `M${cx},${barTop} h-${barLen} v${barH} h${barLen} Z`;
}
