import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AdminScreen } from "#/admin/AdminScreen";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AdminScreen", () => {
  test("composes the observability panel with all five regions", () => {
    const { getByTestId, getByText } = render(<AdminScreen />);
    expect(getByTestId("admin-screen")).toBeTruthy();
    expect(getByText("◈ Observability")).toBeTruthy();
    expect(getByText("Throughput")).toBeTruthy();
    expect(getByText("MESSAGE THROUGHPUT")).toBeTruthy();
    expect(getByText("LATENCY DISTRIBUTION")).toBeTruthy();
    expect(getByText("SERVICE HEALTH")).toBeTruthy();
    expect(getByText("REFERENCE DATA")).toBeTruthy();
    expect(getByText("LIVE EVENTS")).toBeTruthy();
  });

  test("renders the four KPI labels and six latency buckets", () => {
    const { getByText } = render(<AdminScreen />);

    for (const label of [
      "Throughput",
      "P99 Latency",
      "Error Rate",
      "Active Sessions",
    ]) {
      expect(getByText(label)).toBeTruthy();
    }

    for (const bucket of ["<10", "10-25", "25-50", "50-80", "80-150", "150+"]) {
      expect(getByText(bucket)).toBeTruthy();
    }
  });
});
