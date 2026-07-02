import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ThroughputChart } from "#/admin/Throughput/ThroughputChart";

afterEach(cleanup);

describe("ThroughputChart", () => {
  test("renders the heading, a filled area path and the line polyline", () => {
    const { getByText, container } = render(
      <ThroughputChart line="0,10 300,20" area="M0,96 0,10 300,20 L300,96 Z" />,
    );
    expect(getByText("MESSAGE THROUGHPUT")).toBeTruthy();
    expect(container.querySelector("path")?.getAttribute("d")).toContain("Z");
    expect(container.querySelector("polyline")?.getAttribute("points")).toBe(
      "0,10 300,20",
    );
  });
});
