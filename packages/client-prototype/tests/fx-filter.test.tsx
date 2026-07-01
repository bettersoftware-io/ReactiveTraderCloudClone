import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { FilterChips } from "#/fx/LiveRates/FilterChips";

afterEach(cleanup);

describe("FilterChips", () => {
  test("clicking a chip reports it; clicking the active chip is a no-op", () => {
    const onChange = vi.fn();
    const { getByText, rerender } = render(
      <FilterChips value="All" onChange={onChange} />,
    );
    getByText("EUR").click();
    expect(onChange).toHaveBeenCalledWith("EUR");

    onChange.mockClear();
    rerender(<FilterChips value="EUR" onChange={onChange} />);
    getByText("EUR").click();
    expect(onChange).not.toHaveBeenCalled();
  });
});
