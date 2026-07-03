export const GAUGE_R = 40;
export const GAUGE_CX = 52;
export const GAUGE_CY = 50;
export const GAUGE_PAD = 8;

export interface GaugePaths {
  readonly track: string;
  readonly fill: string | null;
  readonly needleX: number;
  readonly needleY: number;
}

function arcPt(a: number): [number, number] {
  return [GAUGE_CX + GAUGE_R * Math.cos(a), GAUGE_CY + GAUGE_R * Math.sin(a)];
}

/** SVG paths for the lower-arc desk-P&L speedometer. Verbatim port of web
 * `buildGaugePaths`: θ=π left (max negative), θ=π/2 bottom (zero), θ=0 right
 * (max positive); angle = (π/2)(1−fraction); fill null when |fraction|<0.001. */
export function buildGaugePaths(
  totalPnl: number,
  maxAbsPnl: number,
): GaugePaths {
  const safe = maxAbsPnl > 0 ? maxAbsPnl : 1;
  const fraction = Math.max(-1, Math.min(1, totalPnl / safe));
  const angle = (Math.PI / 2) * (1 - fraction);

  const [x0, y0] = arcPt(Math.PI);
  const [x1, y1] = arcPt(0);
  const track = `M${x0.toFixed(1)},${y0.toFixed(1)} A${GAUGE_R},${GAUGE_R} 0 0 0 ${x1.toFixed(1)},${y1.toFixed(1)}`;

  const [nx, ny] = arcPt(angle);

  if (Math.abs(fraction) < 0.001) {
    return { track, fill: null, needleX: nx, needleY: ny };
  }

  const [xFs, yFs] = arcPt(Math.PI / 2);
  const [xFe, yFe] = arcPt(angle);
  const fillSweep = fraction >= 0 ? 0 : 1;
  const fill = `M${xFs.toFixed(1)},${yFs.toFixed(1)} A${GAUGE_R},${GAUGE_R} 0 0 ${fillSweep} ${xFe.toFixed(1)},${yFe.toFixed(1)}`;

  return { track, fill, needleX: nx, needleY: ny };
}
