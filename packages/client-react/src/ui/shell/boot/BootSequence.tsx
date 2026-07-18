import type { CSSProperties, ReactElement } from "react";
import { useEffect, useRef } from "react";

import type { BootVariant } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import {
  type BootDrawCtx,
  type BootFrameFn,
  drawBootDocking,
  drawBootLaser,
} from "./bootCanvas";
import { createBootCore } from "./variants/bootCore";
import { createBootGeo } from "./variants/bootGeo";
import { createBootHologram } from "./variants/bootHologram";
import { createBootJarvis } from "./variants/bootJarvis";
import { createBootLayers } from "./variants/bootLayers";
import { createBootTopo } from "./variants/bootTopo";

import styles from "./BootSequence.module.css";

export function BootSequence({ onDone }: BootSequenceProps): ReactElement {
  const { useBootSequence, useForceBootAnimation, usePowerSaver } =
    useViewModel();
  const { state, skip } = useBootSequence(onDone);
  const forced = useForceBootAnimation().enabled;
  const { isFreeze } = usePowerSaver();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const prefersReduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
      false;

    // Freeze (a persisted power-saver opt-out of all motion) always skips the
    // boot canvas rAF loop. Otherwise honour prefers-reduced-motion — unless
    // forceBootAnimation is on, which overrides only the accessibility signal,
    // never an explicit Freeze.
    if (isFreeze || (prefersReduced && !forced)) {
      return;
    }

    // Initial resize (mirrors prototype _drawBoot outer resize())
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return; // jsdom / no-GPU: render chrome only
    }

    const cs = getComputedStyle(document.documentElement);
    const d: BootDrawCtx = {
      canvas,
      ctx,
      start: performance.now(),
      accent: cs.getPropertyValue("--accent-primary").trim() || "#00e5ff",
      accent2: cs.getPropertyValue("--accent-2").trim() || "#00b0ff",
      buy: cs.getPropertyValue("--accent-positive").trim() || "#00e676",
      sell: cs.getPropertyValue("--accent-negative").trim() || "#ff1744",
      pointer: { mx: 0, my: 0 },
    };

    // PROTO: the cursor-tracked variants (layers/jarvis/topo) listen on
    // window mousemove and normalize to -1..1. One listener here feeds the
    // shared pointer for whichever variant reads it; removed with the loop.
    function onMove(e: MouseEvent): void {
      d.pointer.mx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      d.pointer.my = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    }

    window.addEventListener("mousemove", onMove);

    // Factories run once per boot (geo/topo precompute geometry here); the
    // returned closure draws one frame.
    const frame = DRAW[state.variant](d);
    let raf = 0;

    function loop(): void {
      frame();
      raf = requestAnimationFrame(loop);
    }

    loop();

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [state.variant, forced, isFreeze]);

  return (
    <div
      data-testid="boot-sequence"
      data-done={state.done ? "true" : "false"}
      data-variant={state.variant}
      data-force-anim={forced ? "true" : "false"}
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
        <div data-testid="boot-log" className={styles.log}>
          {BOOT_LOG_LINES.slice(0, visibleLineCount(state.progress)).map(
            (line, i) => {
              return (
                <div
                  key={line}
                  data-online={
                    i === BOOT_LOG_LINES.length - 1 ? "true" : "false"
                  }
                  className={styles.logLine}
                >
                  {line}
                </div>
              );
            },
          )}
        </div>
        <div data-testid="boot-progress" className={styles.progressRow}>
          <div className={styles.bar}>
            <div
              className={styles.fill}
              // eslint-disable-next-line no-restricted-syntax -- runtime geometry via CSS custom property; static CSS can't express it
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

/** PROTO bootMessages (dc.html L785-788), verbatim. */
const BOOT_LOG_LINES = [
  "BOOT> initializing kernel ............ OK",
  "BOOT> mounting secure enclave ........ OK",
  "NET > linking pricing engine ......... OK",
  "NET > credit rfq gateway ............. OK",
  "NET > equities market data ........... OK",
  "SYS > calibrating HUD shaders ........ OK",
  "SYS > all systems nominal ▸ ONLINE",
] as const;

/** PROTO staggering (L908: 350 + i*480 ms over DUR 4200) expressed as progress
 * thresholds, so visibility derives from the existing ramp — no new timers. */
function visibleLineCount(progress: number): number {
  let count = 0;

  for (let i = 0; i < BOOT_LOG_LINES.length; i++) {
    if (progress >= ((350 + i * 480) / 4200) * 100) {
      count++;
    }
  }

  return count;
}

// v2 draws are stateless per-frame functions; wrap them into the v3 factory
// shape (factory-per-boot → frame closure) so one map drives the loop.
const DRAW: Record<BootVariant, (d: BootDrawCtx) => BootFrameFn> = {
  core: createBootCore,
  laser: (d: BootDrawCtx): BootFrameFn => {
    return (): void => {
      drawBootLaser(d);
    };
  },
  docking: (d: BootDrawCtx): BootFrameFn => {
    return (): void => {
      drawBootDocking(d);
    };
  },
  hologram: createBootHologram,
  geo: createBootGeo,
  layers: createBootLayers,
  jarvis: createBootJarvis,
  topo: createBootTopo,
};

interface BootSequenceProps {
  onDone: () => void;
}
