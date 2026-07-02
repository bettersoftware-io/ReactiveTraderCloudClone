import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { KpiRow } from "#/admin/Kpis/KpiRow";
import type { AdminKpi } from "#/admin/types";

afterEach(cleanup);

const KPIS: AdminKpi[] = [
  {
    key: "tput",
    label: "Throughput",
    value: "1.20",
    unit: "k msg/s",
    delta: "▲ +0.03",
    deltaUp: true,
    warn: false,
    spark: "0,10 100,5",
  },
  {
    key: "lat",
    label: "P99 Latency",
    value: "72",
    unit: "ms",
    delta: "▼ 3",
    deltaUp: false,
    warn: true,
    spark: "0,10 100,5",
  },
];

describe("KpiRow", () => {
  test("renders a card per kpi with label and value", () => {
    const { getByText, container } = render(<KpiRow kpis={KPIS} />);
    expect(getByText("Throughput")).toBeTruthy();
    expect(getByText("1.20")).toBeTruthy();
    expect(
      container.querySelectorAll("[data-kpi]").length,
    ).toBeGreaterThanOrEqual(2);
  });

  test("marks the latency value as warn and the delta as down", () => {
    const { container } = render(<KpiRow kpis={KPIS} />);
    const latValue = container.querySelector('[data-kpi="lat"]');
    expect(latValue?.getAttribute("data-warn")).toBe("true");
    const latDelta = container.querySelector('[data-delta-up="false"]');
    expect(latDelta).toBeTruthy();
  });
});
