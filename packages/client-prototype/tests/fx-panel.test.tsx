import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { Panel } from "#/fx/layout/Panel";
import type { PanelId } from "#/fx/layout/useDockState";
import { useDockState } from "#/fx/layout/useDockState";

afterEach(cleanup);

describe("useDockState", () => {
  test("toggleMax sets and clears maxPanel; toggleAside flips asideCollapsed", () => {
    const { result } = renderHook(useDockState);

    expect(result.current.maxPanel).toBeNull();
    expect(result.current.asideCollapsed).toBe(false);

    act(() => {
      result.current.toggleMax("tiles");
    });
    expect(result.current.maxPanel).toBe("tiles");

    act(() => {
      result.current.toggleMax("tiles");
    });
    expect(result.current.maxPanel).toBeNull();

    act(() => {
      result.current.toggleAside();
    });
    expect(result.current.asideCollapsed).toBe(true);
  });

  test("persists maxPanel and asideCollapsed to localStorage and restores on init", () => {
    const { result } = renderHook(useDockState);

    act(() => {
      result.current.toggleMax("ana");
      result.current.toggleAside();
    });

    const { result: restored } = renderHook(useDockState);
    expect(restored.current.maxPanel).toBe("ana");
    expect(restored.current.asideCollapsed).toBe(true);
  });
});

describe("Panel", () => {
  test("root carries data-max when maxPanel matches id; clicking maximize reports the id", () => {
    const onToggleMax = vi.fn();
    const { container, getByRole } = render(
      <Panel
        id={TILES_ID}
        head={<span>TILES</span>}
        maxPanel={TILES_ID}
        onToggleMax={onToggleMax}
      >
        <div>body</div>
      </Panel>,
    );

    const root = container.firstElementChild;
    expect(root?.getAttribute("data-max")).toBe("true");

    getByRole("button", { name: /maximize/i }).click();
    expect(onToggleMax).toHaveBeenCalledWith(TILES_ID);
  });

  test("root carries data-max=false when maxPanel is a different panel", () => {
    const { container } = render(
      <Panel
        id={TILES_ID}
        head={<span>TILES</span>}
        maxPanel="pos"
        onToggleMax={vi.fn()}
      >
        <div>body</div>
      </Panel>,
    );

    expect(container.firstElementChild?.getAttribute("data-max")).toBe("false");
  });
});

const TILES_ID: PanelId = "tiles";
