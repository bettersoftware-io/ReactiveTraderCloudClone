/**
 * Co-located unit test for the BootSequence canvas path.
 * The contract tier (tests/ui/contract/specs/shell/boot/) covers the DOM chrome
 * (wordmark, progress, SKIP → onDone) in jsdom without a real canvas context.
 * This file covers the rAF loop branch (lines 42-63) that the contract spec
 * skips because jsdom's getContext("2d") returns null.
 */
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { BootSequence } from "./BootSequence";

describe("BootSequence — canvas rAF loop (mocked context)", () => {
  let rafSpy: ReturnType<typeof vi.spyOn>;
  let cafSpy: ReturnType<typeof vi.spyOn>;
  let ctxStub: CanvasRenderingContext2D;

  beforeEach(() => {
    ctxStub = makeCtxStub();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctxStub,
    );
    rafSpy = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
    cafSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts the rAF loop when the canvas context is available", () => {
    const onDone = vi.fn();
    render(wrap(<BootSequence onDone={onDone} />));
    expect(rafSpy).toHaveBeenCalled();
  });

  it("cancels the rAF loop on unmount (cleanup path)", () => {
    const onDone = vi.fn();
    const { unmount } = render(wrap(<BootSequence onDone={onDone} />));
    unmount();
    expect(cafSpy).toHaveBeenCalledWith(42);
  });

  it("draws using CSS-var fallbacks when custom properties are not set", () => {
    const onDone = vi.fn();
    expect(() => {
      render(wrap(<BootSequence onDone={onDone} />));
    }).not.toThrow();
    expect(ctxStub.clearRect).toHaveBeenCalled();
  });

  it("runs the laser and docking draws through the same factory loop", () => {
    for (const variant of ["laser", "docking"] as const) {
      const { unmount } = render(
        wrap(<BootSequence onDone={vi.fn()} />, {
          useBootSequence: (_onDone: () => void) => {
            return {
              state: { variant, progress: 10, done: false },
              skip: vi.fn(),
            };
          },
        } as unknown as Partial<ViewModel>),
      );
      unmount();
    }

    expect(ctxStub.clearRect).toHaveBeenCalled();
  });

  it("tracks the cursor into the shared pointer while booting", () => {
    render(wrap(<BootSequence onDone={vi.fn()} />));
    // The listener normalizes clientX/Y to -1..1; it must not throw and the
    // canvas keeps drawing afterwards (the pointer feeds the v3 variants).
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 5 }));
    expect(ctxStub.clearRect).toHaveBeenCalled();
  });

  it("skips the canvas loop entirely under prefers-reduced-motion", () => {
    // jsdom has no matchMedia at all (the component optional-chains it), so
    // stub one on the window rather than spying.
    const original = window.matchMedia;
    window.matchMedia = (() => {
      return { matches: true };
    }) as unknown as typeof window.matchMedia;
    render(wrap(<BootSequence onDone={vi.fn()} />));
    expect(rafSpy).not.toHaveBeenCalled();
    window.matchMedia = original;
  });

  it("runs the rAF loop under reduced motion when forced", () => {
    // jsdom has no matchMedia at all (the component optional-chains it), so
    // stub one on the window rather than spying. Restore via `finally` so a
    // failing assertion here can't leak the stub into later tests.
    const original = window.matchMedia;
    window.matchMedia = (() => {
      return { matches: true }; // prefers-reduced-motion: reduce
    }) as unknown as typeof window.matchMedia;

    try {
      renderBootSequence({ forceBootAnimation: true });
      expect(rafSpy).toHaveBeenCalled();
    } finally {
      window.matchMedia = original;
    }
  });

  it("does NOT run the rAF loop under reduced motion when not forced", () => {
    const original = window.matchMedia;
    window.matchMedia = (() => {
      return { matches: true };
    }) as unknown as typeof window.matchMedia;

    try {
      renderBootSequence({ forceBootAnimation: false });
      expect(rafSpy).not.toHaveBeenCalled();
    } finally {
      window.matchMedia = original;
    }
  });

  // A persisted power-saver "freeze" preference must skip the boot splash's
  // canvas rAF the same way prefers-reduced-motion does — a Freeze box
  // should never run the boot animation, even on first paint. Freeze wins
  // even over forceBootAnimation (which overrides only prefers-reduced-motion).
  it("skips the canvas loop entirely under power-saver freeze", () => {
    render(
      wrap(<BootSequence onDone={vi.fn()} />, {
        usePowerSaver: () => {
          return {
            level: "freeze" as const,
            isCalm: true,
            isFreeze: true,
            setLevel: vi.fn(),
            cycle: vi.fn(),
          };
        },
      } as unknown as Partial<ViewModel>),
    );
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it("draws using CSS-var values when custom properties are set", () => {
    document.documentElement.style.setProperty("--accent-primary", "#c0ffee");
    document.documentElement.style.setProperty("--accent-2", "#facade");
    document.documentElement.style.setProperty("--accent-positive", "#00ff00");
    document.documentElement.style.setProperty("--accent-negative", "#ff0000");

    const onDone = vi.fn();
    expect(() => {
      render(wrap(<BootSequence onDone={onDone} />));
    }).not.toThrow();

    document.documentElement.style.removeProperty("--accent-primary");
    document.documentElement.style.removeProperty("--accent-2");
    document.documentElement.style.removeProperty("--accent-positive");
    document.documentElement.style.removeProperty("--accent-negative");

    expect(ctxStub.clearRect).toHaveBeenCalled();
  });
});

describe("BootSequence — boot log lines (visibility by progress)", () => {
  it("reveals boot log lines as progress advances and all when done", () => {
    const onDone = vi.fn();
    const { rerender } = render(
      wrap(<BootSequence onDone={onDone} />, {
        useBootSequence: (_onDone: () => void) => {
          return {
            state: { variant: "core" as const, progress: 0, done: false },
            skip: vi.fn(),
          };
        },
      }),
    );

    // progress 0 -> 0 lines visible
    expect(screen.queryByText(/BOOT> initializing kernel/)).toBe(null);

    // progress 50 -> lines 0-3 visible (thresholds 9, 20, 32, 43, 55, 66, 77)
    rerender(
      wrap(<BootSequence onDone={onDone} />, {
        useBootSequence: (_onDone: () => void) => {
          return {
            state: { variant: "core" as const, progress: 50, done: false },
            skip: vi.fn(),
          };
        },
      }),
    );
    expect(screen.queryByText(/BOOT> initializing kernel/)).not.toBe(null);
    expect(screen.queryByText(/BOOT> mounting secure enclave/)).not.toBe(null);
    expect(screen.queryByText(/NET > linking pricing engine/)).not.toBe(null);
    expect(screen.queryByText(/NET > credit rfq gateway/)).not.toBe(null);
    expect(screen.queryByText(/NET > equities market data/)).toBe(null);

    // progress 100 -> all 7 lines, final line has data-online="true"
    rerender(
      wrap(<BootSequence onDone={onDone} />, {
        useBootSequence: (_onDone: () => void) => {
          return {
            state: { variant: "core" as const, progress: 100, done: false },
            skip: vi.fn(),
          };
        },
      }),
    );
    expect(screen.queryByText(/BOOT> initializing kernel/)).not.toBe(null);
    expect(screen.queryByText(/BOOT> mounting secure enclave/)).not.toBe(null);
    expect(screen.queryByText(/NET > linking pricing engine/)).not.toBe(null);
    expect(screen.queryByText(/NET > credit rfq gateway/)).not.toBe(null);
    expect(screen.queryByText(/NET > equities market data/)).not.toBe(null);
    expect(screen.queryByText(/SYS > calibrating HUD shaders/)).not.toBe(null);
    expect(screen.queryByText(/SYS > all systems nominal/)).not.toBe(null);

    // Verify the final line is marked as online
    const finalLine = screen.getByText(/SYS > all systems nominal/);
    expect(finalLine.getAttribute("data-online")).toBe("true");
  });
});

/**
 * Minimal 2D context stub — every method the draw functions call is a no-op.
 * Properties are writable so the draw functions can set fillStyle etc. without
 * throwing. createLinearGradient / createRadialGradient return a minimal stub.
 */
function makeCtxStub(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() };
  return {
    // Properties (writable)
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    shadowBlur: 0,
    shadowColor: "",
    lineJoin: "miter",
    // Methods (no-ops)
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => {
      return gradient;
    }),
    createRadialGradient: vi.fn(() => {
      return gradient;
    }),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function wrap(
  el: ReactElement,
  partialHooks: Partial<ViewModel> = {},
): ReactElement {
  const defaultHooks = {
    useBootSequence: (_onDone: () => void) => {
      return {
        state: { variant: "core" as const, progress: 0, done: false },
        skip: vi.fn(),
      };
    },
    useForceBootAnimation: () => {
      return { enabled: false, setEnabled: vi.fn(), toggle: vi.fn() };
    },
    usePowerSaver: () => {
      return {
        level: "off" as const,
        isCalm: false,
        isFreeze: false,
        setLevel: vi.fn(),
        cycle: vi.fn(),
      };
    },
    ...partialHooks,
  } as unknown as ViewModel;

  return (
    <ViewModelContext.Provider value={defaultHooks}>
      {el}
    </ViewModelContext.Provider>
  );
}

interface RenderBootSequenceOpts {
  forceBootAnimation: boolean;
}

/** Renders `<BootSequence>` with `useForceBootAnimation().enabled` stubbed to
 * the given flag — the seam Task 4 wires into the effective reduced-motion
 * decision. */
function renderBootSequence({
  forceBootAnimation,
}: RenderBootSequenceOpts): void {
  render(
    wrap(<BootSequence onDone={vi.fn()} />, {
      useForceBootAnimation: () => {
        return {
          enabled: forceBootAnimation,
          setEnabled: vi.fn(),
          toggle: vi.fn(),
        };
      },
    } as unknown as Partial<ViewModel>),
  );
}
