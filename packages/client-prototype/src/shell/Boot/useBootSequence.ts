import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BootVariant } from "#/shell/Boot/bootDraw";
import { drawBoot } from "#/shell/Boot/bootDraw";
import { useTheme } from "#/theme/useTheme";

const VARIANT_KEY = "rt_bootSeq";
const SEQUENCE: BootVariant[] = ["globe", "laser", "docking"];
const DEFAULT_DURATION = 4200;
const BOOT_MESSAGES: string[] = [
  "BOOT> initializing kernel ............ OK",
  "BOOT> mounting secure enclave ........ OK",
  "NET > linking pricing engine ......... OK",
  "NET > credit rfq gateway ............. OK",
  "NET > equities market data ........... OK",
  "SYS > calibrating HUD shaders ........ OK",
  "SYS > all systems nominal ▸ ONLINE",
];

export interface BootOptions {
  onDone(): void;
  durationMs?: number;
}

export interface BootState {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  pct: number;
  lines: string[];
  variant: BootVariant;
  fading: boolean;
  skip(): void;
}

function nextVariant(): BootVariant {
  const last = localStorage.getItem(VARIANT_KEY);
  const idx = last ? SEQUENCE.indexOf(last as BootVariant) : -1;
  const variant = SEQUENCE[(idx + 1) % SEQUENCE.length];
  localStorage.setItem(VARIANT_KEY, variant);
  return variant;
}

export function useBootSequence(opts: BootOptions): BootState {
  const { onDone, durationMs = DEFAULT_DURATION } = opts;
  const { tokens } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [variant] = useState<BootVariant>(nextVariant);
  const [pct, setPct] = useState(0);
  const [lines, setLines] = useState<string[]>([]);
  const [fading, setFading] = useState(false);
  const doneRef = useRef(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    if (doneRef.current) {
      return;
    }

    doneRef.current = true;
    setFading(true);
    fadeTimerRef.current = setTimeout(() => {
      onDone();
    }, 800);
  }, [onDone]);

  useEffect(() => {
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduce) {
      setPct(100);
      setLines(BOOT_MESSAGES);
      finish();
      return;
    }

    const start = performance.now();
    let raf = 0;

    function tick(now: number): void {
      const t = now - start;
      const ratio = Math.min(1, t / durationMs);
      setPct(Math.round(ratio * 100));
      setLines(BOOT_MESSAGES.slice(0, Math.ceil(ratio * BOOT_MESSAGES.length)));

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");

      if (ctx && canvas) {
        drawBoot(ctx, variant, {
          t,
          dur: durationMs,
          w: canvas.width,
          h: canvas.height,
          accent: tokens.accent,
          accent2: tokens.accent2,
          buy: tokens.buy,
          sell: tokens.sell,
        });
      }

      if (ratio >= 1) {
        finish();
        return;
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);

      if (fadeTimerRef.current != null) {
        clearTimeout(fadeTimerRef.current);
      }
    };
  }, [
    durationMs,
    finish,
    tokens.accent,
    tokens.accent2,
    tokens.buy,
    tokens.sell,
    variant,
  ]);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  return { canvasRef, pct, lines, variant, fading, skip };
}
