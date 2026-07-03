import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RfqFilterPills, RfqsPanel } from "#/credit/Rfqs/RfqsPanel";
import { useCreditRfqs } from "#/credit/useCreditRfqs";
import { mulberry32 } from "#/mock/rng";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RfqsPanel", () => {
  test("renders both seed cards on the 'all' tab; the LIVE pill (rendered externally, P6 headControls) empties them", () => {
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    const view = render(
      <PreferencesProvider>
        <RfqFilterPills
          creditTab={result.current.creditTab}
          liveCount={result.current.liveCount}
          onTab={result.current.onTab}
        />
        <RfqsPanel rfqs={result.current} />
      </PreferencesProvider>,
    );

    expect(view.queryByText("No RFQs to show")).toBeNull();
    expect(view.getByText("ACCEPTED")).toBeTruthy();
    expect(view.getByText("CANCELLED")).toBeTruthy();

    fireEvent.click(view.getByText("LIVE"));
    view.rerender(
      <PreferencesProvider>
        <RfqFilterPills
          creditTab={result.current.creditTab}
          liveCount={result.current.liveCount}
          onTab={result.current.onTab}
        />
        <RfqsPanel rfqs={result.current} />
      </PreferencesProvider>,
    );

    expect(result.current.creditTab).toBe("live");
    expect(view.getByText("No RFQs to show")).toBeTruthy();
  });

  test("RfqsPanel no longer renders its own filter bar (P6: pills live only in Panel.headControls)", () => {
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    const view = render(
      <PreferencesProvider>
        <RfqsPanel rfqs={result.current} />
      </PreferencesProvider>,
    );

    expect(view.queryByText("CLOSED")).toBeNull();
    expect(view.queryByText("ALL")).toBeNull();
  });

  test("switching tabs staggers the surviving cards' entrance via --card-delay (PROTO L1330 ci*45ms)", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    const view = render(
      <PreferencesProvider>
        <RfqsPanel rfqs={result.current} />
      </PreferencesProvider>,
    );

    act(() => {
      result.current.onTab("closed");
    });
    view.rerender(
      <PreferencesProvider>
        <RfqsPanel rfqs={result.current} />
      </PreferencesProvider>,
    );

    const cards = view.container.querySelectorAll('[data-anim="enter"]');
    expect(cards).toHaveLength(2);
    expect(
      (cards[0] as HTMLElement).style.getPropertyValue("--card-delay"),
    ).toBe("0ms");
    expect(
      (cards[1] as HTMLElement).style.getPropertyValue("--card-delay"),
    ).toBe("45ms");
  });
});
