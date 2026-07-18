import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ActivityView } from "#/fx/Blotter/ActivityView";
import { FxBlotterPanel } from "#/fx/Blotter/FxBlotterPanel";
import { SEED_TRADES } from "#/fx/fxData";
import type { ActivityEvent } from "#/fx/types";
import { useFxBlotter } from "#/fx/useFxBlotter";

afterEach(cleanup);

describe("ActivityView", () => {
  test("shows the empty-state copy when there are no events", () => {
    const { getByText } = render(<ActivityView events={[]} />);

    expect(
      getByText("No activity yet — execute a trade to populate the feed"),
    ).toBeTruthy();
  });

  test("renders each event's tag and message", () => {
    const { getByText } = render(<ActivityView events={[makeEvent({})]} />);

    expect(getByText("EXEC")).toBeTruthy();
    expect(getByText("EURUSD 1M bought @ 1.09213")).toBeTruthy();
  });

  test("does not warn about duplicate keys when two events share the same t/tag/msg", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow — asserted on below
    });
    // Same t/tag/msg/color (same-second collision), but makeEvent hands
    // out a fresh id per call — real same-second events get sequential
    // ids, so ActivityView must key by id, not the collidable composite.
    const first = makeEvent({});
    const second = makeEvent({});
    expect(second.id).not.toBe(first.id);

    render(<ActivityView events={[first, second]} />);

    const sameKeyWarning = spy.mock.calls.some((args) => {
      return String(args[0]).includes("same key");
    });
    expect(sameKeyWarning).toBe(false);

    spy.mockRestore();
  });
});

describe("FxBlotterPanel", () => {
  test("in activity view shows the feed, not the blotter column header", () => {
    const { result } = renderHook(() => {
      return useFxBlotter(SEED_TRADES);
    });

    const { getByText, queryAllByText } = render(
      <FxBlotterPanel
        api={result.current}
        activity={[makeEvent({})]}
        view="activity"
      />,
    );

    expect(getByText("EURUSD 1M bought @ 1.09213")).toBeTruthy();
    expect(
      queryAllByText((text) => {
        return text.startsWith("ID");
      }),
    ).toHaveLength(0);
  });
});

let eventIdSeq = 0;

function makeEvent(overrides: Partial<ActivityEvent>): ActivityEvent {
  return {
    id: eventIdSeq++,
    t: "09:41:02",
    tag: "EXEC",
    msg: "EURUSD 1M bought @ 1.09213",
    color: "var(--buy)",
    ...overrides,
  };
}
