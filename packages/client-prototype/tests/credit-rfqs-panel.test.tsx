import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RfqsPanel } from "#/credit/Rfqs/RfqsPanel";
import { useCreditRfqs } from "#/credit/useCreditRfqs";
import { mulberry32 } from "#/mock/rng";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RfqsPanel", () => {
  test("renders both seed cards on the 'all' tab; LIVE filter empties them", () => {
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    const view = render(
      <PreferencesProvider>
        <RfqsPanel rfqs={result.current} />
      </PreferencesProvider>,
    );

    expect(view.queryByText("No RFQs to show")).toBeNull();
    expect(view.getByText("ACCEPTED")).toBeTruthy();
    expect(view.getByText("CANCELLED")).toBeTruthy();

    fireEvent.click(view.getByText("LIVE"));
    view.rerender(
      <PreferencesProvider>
        <RfqsPanel rfqs={result.current} />
      </PreferencesProvider>,
    );

    expect(result.current.creditTab).toBe("live");
    expect(view.getByText("No RFQs to show")).toBeTruthy();
  });
});
