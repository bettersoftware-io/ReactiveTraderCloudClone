import type { CSSProperties, ReactElement } from "react";
import { useEffect, useRef } from "react";

import { useHooks } from "#/ui/hooks/useHooks";

import {
  type BootDrawCtx,
  drawBootCore,
  drawBootDocking,
  drawBootLaser,
} from "./bootCanvas";

import styles from "./BootSequence.module.css";

const DRAW = {
  core: drawBootCore,
  laser: drawBootLaser,
  docking: drawBootDocking,
} as const;

interface BootSequenceProps {
  onDone: () => void;
}

export function BootSequence({ onDone }: BootSequenceProps): ReactElement {
  const { useBootSequence } = useHooks();
  const { state, skip } = useBootSequence(onDone);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) return;
    // Initial resize (mirrors prototype _drawBoot outer resize())
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // jsdom / no-GPU: render chrome only
    const cs = getComputedStyle(document.documentElement);
    const d: BootDrawCtx = {
      canvas,
      ctx,
      start: performance.now(),
      accent: cs.getPropertyValue("--accent-primary").trim() || "#00e5ff",
      accent2: cs.getPropertyValue("--accent-2").trim() || "#00b0ff",
      buy: cs.getPropertyValue("--accent-positive").trim() || "#00e676",
      sell: cs.getPropertyValue("--accent-negative").trim() || "#ff1744",
    };
    const draw = DRAW[state.variant];
    let raf = 0;

    function loop(): void {
      draw(d);
      raf = requestAnimationFrame(loop);
    }

    loop();

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [state.variant]);

  return (
    <div
      data-testid="boot-sequence"
      data-done={state.done ? "true" : "false"}
      data-variant={state.variant}
      className={styles.boot}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.panel}>
        <div data-testid="boot-wordmark" className={styles.wordmark}>
          REACTIVE&nbsp;TRADER
        </div>
        <div className={styles.subtitle}>
          TACTICAL TRADING OPERATING SYSTEM · v4.0
        </div>
        <div data-testid="boot-progress" className={styles.progressRow}>
          <div className={styles.bar}>
            <div
              className={styles.fill}
              style={{ "--boot-pct": `${state.progress}%` } as CSSProperties}
            />
          </div>
          <span data-testid="boot-pct" className={styles.pct}>
            {state.progress}%
          </span>
        </div>
        <button
          type="button"
          data-testid="boot-skip"
          className={styles.skip}
          onClick={skip}
        >
          SKIP ▸
        </button>
      </div>
    </div>
  );
}
