import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  FxBlotterHeadControls,
  FxBlotterPanel,
} from "#/fx/Blotter/FxBlotterPanel";
import { SEED_TRADES } from "#/fx/fxData";
import { useFxBlotter } from "#/fx/useFxBlotter";

afterEach(cleanup);

describe("FxBlotterHeadControls", () => {
  test("renders the view tabs and, in blotter view, the filter/CSV tools", () => {
    const { result } = renderHook(() => {
      return useFxBlotter(SEED_TRADES);
    });
    const onView = vi.fn();
    const { getByText, getByPlaceholderText } = render(
      <FxBlotterHeadControls
        api={result.current}
        view="blotter"
        onView={onView}
      />,
    );

    expect(getByPlaceholderText("Filter…")).toBeTruthy();
    expect(getByText("⤓ CSV")).toBeTruthy();

    getByText("⚡ Activity").click();
    expect(onView).toHaveBeenCalledWith("activity");
  });

  test("hides the blotter-only tools in activity view", () => {
    const { result } = renderHook(() => {
      return useFxBlotter(SEED_TRADES);
    });
    const { queryByPlaceholderText } = render(
      <FxBlotterHeadControls
        api={result.current}
        view="activity"
        onView={vi.fn()}
      />,
    );

    expect(queryByPlaceholderText("Filter…")).toBeNull();
  });
});

describe("FxBlotterPanel", () => {
  test("no longer renders its own tabs — that's Panel's headControls now", () => {
    const { result } = renderHook(() => {
      return useFxBlotter(SEED_TRADES);
    });
    const { queryByText } = render(
      <FxBlotterPanel
        api={result.current}
        activity={[]}
        view="blotter"
        newRowId={null}
      />,
    );

    expect(queryByText("▤ FX Blotter")).toBeNull();
    expect(queryByText("⚡ Activity")).toBeNull();
  });
});
