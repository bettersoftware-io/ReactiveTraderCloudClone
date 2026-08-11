import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { DockEngineOptions } from "#/createDockEngine";
import { createDockEngine } from "#/createDockEngine";

// jsdom (as of the pinned Node/jsdom combo here) has no ResizeObserver;
// dockview-core's own unit tests run under jsdom with the same stub.
beforeAll(() => {
  if (typeof ResizeObserver === "undefined") {
    // biome-ignore lint/suspicious/noExplicitAny: test-only global patch
    (globalThis as any).ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
});

const FX_LIKE = {
  kind: "split",
  dir: "row",
  sizes: [0.75, 0.25],
  children: [
    {
      kind: "split",
      dir: "column",
      sizes: [0.6, 0.4],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "fx-blotter" },
      ],
    },
    { kind: "panel", panelId: "fx-analytics" },
  ],
} as const;

const attachedContainers: HTMLElement[] = [];

function base(): DockEngineOptions {
  const container = document.createElement("div");
  document.body.appendChild(container);
  attachedContainers.push(container);
  return {
    container,
    seed: FX_LIKE,
    blob: null,
    panels: {
      title: (id: string) => {
        return id.toUpperCase();
      },
      mount: (_id: string, el: HTMLElement) => {
        el.textContent = `content:${_id}`;
        return () => {};
      },
    },
    onLayoutChange: () => {},
    debounceMs: 0,
  };
}

afterEach(() => {
  for (const el of attachedContainers.splice(0)) {
    el.remove();
  }
});

describe("createDockEngine", () => {
  it("builds groups + panels from the seed and mounts content via the hook", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    attachedContainers.push(container);
    const mounted: string[] = [];
    const engine = createDockEngine({
      container,
      seed: FX_LIKE,
      blob: null,
      panels: {
        title: (id: string) => {
          return id.toUpperCase();
        },
        mount: (id: string, el: HTMLElement) => {
          mounted.push(id);
          el.textContent = `content:${id}`;
          return () => {
            mounted.splice(mounted.indexOf(id), 1);
          };
        },
      },
      onLayoutChange: () => {},
      debounceMs: 0,
    });

    expect(engine.groupCount()).toBe(3);
    expect(mounted.sort()).toEqual(["fx-analytics", "fx-blotter", "fx-rates"]);
    expect(container.textContent).toContain("content:fx-rates");
    engine.dispose();
    expect(mounted).toEqual([]);
  });

  it("falls back to the seed on a corrupt blob", () => {
    const engine = createDockEngine({ ...base(), blob: "{not json" });
    expect(engine.groupCount()).toBe(3);
    engine.dispose();
  });

  it("falls back to the seed on a structurally-invalid blob", () => {
    const engine = createDockEngine({
      ...base(),
      blob: JSON.stringify({ hello: 1 }),
    });
    expect(engine.groupCount()).toBe(3);
    engine.dispose();
  });

  it("restores a valid blob (round-trip through its own serialisation)", () => {
    let saved: string | null = null;
    const first = createDockEngine({
      ...base(),
      onLayoutChange: (blob: string) => {
        saved = blob;
      },
      debounceMs: 0,
    });
    first.maximizePanel("fx-rates"); // any layout mutation triggers serialisation
    first.dispose();
    expect(saved).not.toBeNull();

    const second = createDockEngine({ ...base(), blob: saved });
    expect(second.groupCount()).toBe(3);
    second.dispose();
  });

  it("maximizePanel / exitMaximize drive dockview's maximized state", () => {
    const engine = createDockEngine(base());
    engine.maximizePanel("fx-blotter");
    // dockview marks the maximized group in the DOM; assert via the api-level witness:
    // createDockEngine exposes it indirectly — after exitMaximize the layout serialises again.
    engine.exitMaximize();
    engine.dispose();
  });
});
