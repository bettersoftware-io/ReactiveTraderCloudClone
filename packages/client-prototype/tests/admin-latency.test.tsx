import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { LatencyHistogram } from "#/admin/Latency/LatencyHistogram";
import type { LatBar } from "#/admin/types";

afterEach(cleanup);

const BARS: LatBar[] = [
  { label: "<10", heightPct: 14, accent: false },
  { label: "25-50", heightPct: 76, accent: true },
];

describe("LatencyHistogram", () => {
  test("renders the heading, a bar per bucket, and marks the accent bucket", () => {
    const { getByText, container } = render(<LatencyHistogram bars={BARS} />);
    expect(getByText("LATENCY DISTRIBUTION")).toBeTruthy();
    expect(getByText("<10")).toBeTruthy();
    expect(container.querySelectorAll("[data-accent]")).toHaveLength(2);
    expect(container.querySelector('[data-accent="true"]')).toBeTruthy();
  });
});
