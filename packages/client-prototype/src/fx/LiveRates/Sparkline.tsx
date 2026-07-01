import type { CSSProperties, ReactElement } from "react";

export interface SparklineProps {
  hist: number[];
  mini?: boolean;
  moveUp: boolean;
}

const FULL_VIEW_BOX = "0 0 300 40";
const MINI_VIEW_BOX = "0 0 60 18";

export function Sparkline(props: SparklineProps): ReactElement {
  const { hist, mini = false, moveUp } = props;
  const { mn, rng } = histRange(hist);
  const points = mini ? miniPoints(hist, mn, rng) : fullPoints(hist, mn, rng);
  const colorVar = {
    "--move-color": moveUp ? "var(--buy)" : "var(--sell)",
  } as CSSProperties;

  return (
    <svg
      viewBox={mini ? MINI_VIEW_BOX : FULL_VIEW_BOX}
      preserveAspectRatio="none"
      width={mini ? 60 : "100%"}
      height={mini ? 18 : 34}
      overflow="visible"
      aria-hidden="true"
      display="block"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--move-color)"
        strokeWidth={mini ? 1.4 : 1.5}
        strokeLinejoin="round"
        opacity={mini ? 1 : 0.75}
        style={colorVar}
      />
    </svg>
  );
}

interface HistRange {
  mn: number;
  rng: number;
}

function histRange(hist: number[]): HistRange {
  const mn = Math.min(...hist);
  const mx = Math.max(...hist);
  return { mn, rng: mx - mn || 1 };
}

function fullPoints(hist: number[], mn: number, rng: number): string {
  const len = hist.length;
  return hist
    .map((v, i) => {
      return `${(i / (len - 1)) * 300},${40 - ((v - mn) / rng) * 36}`;
    })
    .join(" ");
}

function miniPoints(hist: number[], mn: number, rng: number): string {
  return hist
    .slice(-12)
    .map((v, i) => {
      return `${(i / 11) * 60},${18 - ((v - mn) / rng) * 16}`;
    })
    .join(" ");
}
