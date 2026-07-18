/**
 * Co-located unit test for the BootSequence canvas path.
 * The contract tier (tests/ui/contract/specs/shell/boot/) covers the DOM chrome
 * (wordmark, progress, SKIP → onDone) in jsdom without a real canvas context.
 * This file covers the rAF loop branch that the contract spec skips because
 * jsdom's getContext("2d") returns null.
 */

import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ViewModel } from "@rtc/solid-bindings";
import { ViewModelContext } from "@rtc/solid-bindings";

import { BootSequence } from "./BootSequence";

describe("BootSequence — canvas rAF loop (mocked context)", () => {
  let rafSpy: ReturnType<typeof vi.spyOn>;
  let cafSpy: ReturnType<typeof vi.spyOn>;
  let getContextSpy: ReturnType<typeof vi.spyOn>;
  let ctxStub: CanvasRenderingContext2D;

  beforeEach(() => {
    ctxStub = makeCtxStub();
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(ctxStub);
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
    render(() => {
      return (
        <ViewModelContext.Provider value={makeHooks()}>
          <BootSequence onDone={onDone} />
        </ViewModelContext.Provider>
      );
    });
    expect(rafSpy).toHaveBeenCalled();
  });

  it("cancels the rAF loop on unmount (cleanup path)", () => {
    const onDone = vi.fn();
    const { unmount } = render(() => {
      return (
        <ViewModelContext.Provider value={makeHooks()}>
          <BootSequence onDone={onDone} />
        </ViewModelContext.Provider>
      );
    });
    unmount();
    expect(cafSpy).toHaveBeenCalledWith(42);
  });

  it("draws using CSS-var fallbacks when custom properties are not set", () => {
    const onDone = vi.fn();
    expect(() => {
      render(() => {
        return (
          <ViewModelContext.Provider value={makeHooks()}>
            <BootSequence onDone={onDone} />
          </ViewModelContext.Provider>
        );
      });
    }).not.toThrow();
    expect(ctxStub.clearRect).toHaveBeenCalled();
  });

  it("runs the laser and docking draws through the same factory loop", () => {
    for (const variant of ["laser", "docking"] as const) {
      const { unmount } = render(() => {
        return (
          <ViewModelContext.Provider
            value={makeHooks({
              useBootSequence: (_onDone: () => void) => {
                return {
                  state: () => {
                    return { variant, progress: 10, done: false };
                  },
                  skip: vi.fn(),
                };
              },
            } as unknown as Partial<ViewModel>)}
          >
            <BootSequence onDone={vi.fn()} />
          </ViewModelContext.Provider>
        );
      });
      unmount();
    }

    expect(ctxStub.clearRect).toHaveBeenCalled();
  });

  it("tracks the cursor into the shared pointer while booting", () => {
    render(() => {
      return (
        <ViewModelContext.Provider value={makeHooks()}>
          <BootSequence onDone={vi.fn()} />
        </ViewModelContext.Provider>
      );
    });
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
    render(() => {
      return (
        <ViewModelContext.Provider value={makeHooks()}>
          <BootSequence onDone={vi.fn()} />
        </ViewModelContext.Provider>
      );
    });
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

  it("draws using CSS-var values when custom properties are set", () => {
    document.documentElement.style.setProperty("--accent-primary", "#c0ffee");
    document.documentElement.style.setProperty("--accent-2", "#facade");
    document.documentElement.style.setProperty("--accent-positive", "#00ff00");
    document.documentElement.style.setProperty("--accent-negative", "#ff0000");

    const onDone = vi.fn();
    expect(() => {
      render(() => {
        return (
          <ViewModelContext.Provider value={makeHooks()}>
            <BootSequence onDone={onDone} />
          </ViewModelContext.Provider>
        );
      });
    }).not.toThrow();

    document.documentElement.style.removeProperty("--accent-primary");
    document.documentElement.style.removeProperty("--accent-2");
    document.documentElement.style.removeProperty("--accent-positive");
    document.documentElement.style.removeProperty("--accent-negative");

    expect(ctxStub.clearRect).toHaveBeenCalled();
  });

  it("runs canvas setup exactly once across progress-only state emissions", () => {
    // The real BootSequenceMachine emits a FRESH state object every 90ms
    // (~47 per boot) with only `progress` changing. The canvas effect must
    // track the VARIANT alone — re-running setup per tick would remove/
    // re-add the mousemove listener, reset d.start (breaking elapsed-time
    // animation math), re-run the DRAW factory, and restart the rAF loop
    // ~47× per boot. getContext is called exactly once per setup run, so
    // its call count IS the setup-execution count.
    const [state, setState] = createSignal<TestBootState>({
      variant: "core",
      progress: 0,
      done: false,
    });

    render(() => {
      return (
        <ViewModelContext.Provider
          value={makeHooks({
            useBootSequence: (_onDone: () => void) => {
              return { state, skip: vi.fn() };
            },
          } as unknown as Partial<ViewModel>)}
        >
          <BootSequence onDone={vi.fn()} />
        </ViewModelContext.Provider>
      );
    });

    expect(getContextSpy).toHaveBeenCalledTimes(1);

    // Simulate the machine's tick stream: fresh object per emission,
    // progress-only changes, same variant throughout.
    for (const progress of [10, 25, 40, 55, 70, 85, 100]) {
      setState({ variant: "core", progress, done: false });
    }

    expect(getContextSpy).toHaveBeenCalledTimes(1);
    // And the rAF loop was started exactly once, not restarted per tick.
    expect(cafSpy).not.toHaveBeenCalled();
  });
});

describe("BootSequence — boot log lines (visibility by progress)", () => {
  it("reveals boot log lines as progress advances and all when done", () => {
    const onDone = vi.fn();
    const [progress, setProgress] = createSignal(0);

    render(() => {
      return (
        <ViewModelContext.Provider
          value={makeHooks({
            useBootSequence: (_onDone: () => void) => {
              return {
                state: () => {
                  return {
                    variant: "core" as const,
                    progress: progress(),
                    done: false,
                  };
                },
                skip: vi.fn(),
              };
            },
          })}
        >
          <BootSequence onDone={onDone} />
        </ViewModelContext.Provider>
      );
    });

    // progress 0 -> 0 lines visible
    expect(screen.queryByText(/BOOT> initializing kernel/)).toBe(null);

    // progress 50 -> lines 0-3 visible (thresholds 9, 20, 32, 43, 55, 66, 77)
    setProgress(50);
    expect(screen.queryByText(/BOOT> initializing kernel/)).not.toBe(null);
    expect(screen.queryByText(/BOOT> mounting secure enclave/)).not.toBe(null);
    expect(screen.queryByText(/NET > linking pricing engine/)).not.toBe(null);
    expect(screen.queryByText(/NET > credit rfq gateway/)).not.toBe(null);
    expect(screen.queryByText(/NET > equities market data/)).toBe(null);

    // progress 100 -> all 7 lines, final line has data-online="true"
    setProgress(100);
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

/** Builds the mocked ViewModel for `ViewModelContext.Provider`. Plain
 * data-returning helper (not a component — returns `ViewModel`, never JSX),
 * so it stays outside the JSX tree. `<BootSequence/>` is always nested
 * directly under `<ViewModelContext.Provider>` at each call site (never
 * pre-built and threaded through a helper), so the Solid compiler defers its
 * construction until the Provider's own render — a plain function taking an
 * already-evaluated JSX.Element argument would run BootSequence's body (and
 * its useViewModel() call) before the Provider exists.
 *
 * The default `state` is a REAL Solid signal (matching the production shape:
 * `toSignal` returns a tracked accessor), NOT a plain closure — a plain
 * function is invisible to Solid's dependency tracking, so effects that
 * over-subscribe to the whole state object would never re-run in tests and
 * the over-tracking bug class stays masked. */
function makeHooks(partialHooks: Partial<ViewModel> = {}): ViewModel {
  const [state] = createSignal<TestBootState>({
    variant: "core",
    progress: 0,
    done: false,
  });

  return {
    useBootSequence: (_onDone: () => void) => {
      return { state, skip: vi.fn() };
    },
    useForceBootAnimation: () => {
      return {
        enabled: () => {
          return false;
        },
        setEnabled: vi.fn(),
        toggle: vi.fn(),
      };
    },
    ...partialHooks,
  } as unknown as ViewModel;
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
  render(() => {
    return (
      <ViewModelContext.Provider
        value={makeHooks({
          useForceBootAnimation: () => {
            return {
              enabled: () => {
                return forceBootAnimation;
              },
              setEnabled: vi.fn(),
              toggle: vi.fn(),
            };
          },
        } as unknown as Partial<ViewModel>)}
      >
        <BootSequence onDone={vi.fn()} />
      </ViewModelContext.Provider>
    );
  });
}

/** The BootSequenceState shape the mocked machine emits (variant pinned to
 * "core" — these tests never rotate it). */
interface TestBootState {
  variant: "core";
  progress: number;
  done: boolean;
}
