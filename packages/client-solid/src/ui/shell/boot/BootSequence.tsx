import type { Accessor, JSX } from "solid-js";
import { createEffect, createMemo, For, onCleanup } from "solid-js";

import {
  type BootDrawCtx,
  type BootFrameFn,
  createBootCore,
  createBootGeo,
  createBootHologram,
  createBootJarvis,
  createBootLayers,
  createBootTopo,
  drawBootDocking,
  drawBootLaser,
} from "@rtc/boot-splash";
import styles from "@rtc/boot-splash/styles/BootSequence.module.css";
import type { BootVariant } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

export function BootSequence(props: BootSequenceProps): JSX.Element {
  const { useBootSequence, useForceBootAnimation, usePowerSaver } =
    useViewModel();
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const { state, skip } = useBootSequence(props.onDone);
  const { enabled: forced } = useForceBootAnimation();
  const { isFreeze } = usePowerSaver();
  let canvasEl!: HTMLCanvasElement;

  // The machine emits a FRESH state object every 90ms tick (~47 per boot)
  // with only `progress` changing. The canvas effect below must re-run on
  // VARIANT changes only (the React original's dep array `[state.variant]`),
  // so it reads the variant through this memo: createMemo re-evaluates per
  // emission but — default === equality on the string — only notifies its
  // dependents when the variant actually changes. Reading `state().variant`
  // directly inside the effect would subscribe it to every tick, restarting
  // the rAF loop and resetting `d.start` (the elapsed-time origin of every
  // scene's animation math) ~47× per boot.
  const variant = createMemo((): BootVariant => {
    return state().variant;
  });

  createEffect(() => {
    const currentVariant = variant();
    const canvas = canvasEl;

    const prefersReduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Read both signals unconditionally so each is tracked: the effect (a
    // plain createEffect, not `on()`-wrapped) re-runs when either flips
    // mid-boot, tearing the loop down via the onCleanup below. Freeze (an
    // explicit power-saver opt-out of all motion) always skips the boot
    // canvas rAF loop; otherwise honour prefers-reduced-motion unless
    // forceBootAnimation overrides it — it overrides only the accessibility
    // signal, never an explicit Freeze.
    const freeze = isFreeze();
    const forceOn = forced();

    if (freeze || (prefersReduced && !forceOn)) {
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
    const frame = DRAW[currentVariant](d);
    let raf = 0;

    function loop(): void {
      frame();
      raf = requestAnimationFrame(loop);
    }

    loop();

    onCleanup(() => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    });
  });

  const visibleLines = createMemo((): readonly string[] => {
    return BOOT_LOG_LINES.slice(0, visibleLineCount(state().progress));
  });

  return (
    <div
      data-testid="boot-sequence"
      data-done={state().done ? "true" : "false"}
      data-variant={state().variant}
      data-force-anim={forced() ? "true" : "false"}
      class={styles.boot}
    >
      <canvas ref={canvasEl} class={styles.canvas} />
      <div class={styles.panel}>
        <div data-testid="boot-wordmark" class={styles.wordmark}>
          REACTIVE&nbsp;TRADER
        </div>
        <div class={styles.subtitle}>
          TACTICAL TRADING OPERATING SYSTEM · v4.0
        </div>
        <div data-testid="boot-log" class={styles.log}>
          <For each={visibleLines()}>
            {(line: string, index: Accessor<number>) => {
              return (
                <div
                  data-online={
                    index() === BOOT_LOG_LINES.length - 1 ? "true" : "false"
                  }
                  class={styles.logLine}
                >
                  {line}
                </div>
              );
            }}
          </For>
        </div>
        <div data-testid="boot-progress" class={styles.progressRow}>
          <div class={styles.bar}>
            <div
              class={styles.fill}
              // eslint-disable-next-line no-restricted-syntax -- runtime geometry via CSS custom property; static CSS can't express it
              style={{ "--boot-pct": `${state().progress}%` }}
            />
          </div>
          <span data-testid="boot-pct" class={styles.pct}>
            {state().progress}%
          </span>
        </div>
        <button
          type="button"
          data-testid="boot-skip"
          class={styles.skip}
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
