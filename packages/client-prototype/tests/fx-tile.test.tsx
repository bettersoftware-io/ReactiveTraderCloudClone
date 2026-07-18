import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { META } from "#/fx/fxData";
import { RateTile, type TileVm } from "#/fx/LiveRates/RateTile";

afterEach(cleanup);

describe("RateTile", () => {
  test("renders the pair, a big price segment, and the notional", () => {
    const { getByText, getAllByText, container } = render(
      <RateTile vm={makeVm({})} stage="idle" overlay={null} />,
    );
    expect(getByText("EUR / USD")).toBeTruthy();
    // EURUSD @ 1.09213 with a 1.4-pip spread never crosses a hundredths
    // boundary, so the Sell and Buy blocks share the same "big figure"
    // (matches splitPrice(1.09213, META.EURUSD).big === "1.09" from the
    // Task-1 fx-data test) — both TilePrice instances legitimately render
    // it, so this asserts presence rather than DOM-wide uniqueness.
    expect(getAllByText("1.09").length).toBeGreaterThan(0);
    expect(container.querySelector('[data-tile-sym="EURUSD"]')).toBeTruthy();
  });

  test("shows the RFQ badge when isRfq and MAX when invalid", () => {
    const { getAllByText, getByText } = render(
      <RateTile
        vm={makeVm({ isRfq: true, notionalInvalid: true })}
        stage="idle"
        overlay={null}
      />,
    );
    expect(getAllByText("RFQ").length).toBeGreaterThan(0);
    expect(getByText("MAX")).toBeTruthy();
  });

  test("shows the absolute pip count even on a down move", () => {
    const { getByText } = render(
      <RateTile
        vm={makeVm({ movePips: -7, moveUp: false })}
        stage="idle"
        overlay={null}
      />,
    );
    expect(getByText("▼ 7 pip")).toBeTruthy();
  });

  test("carries data-booked only while the tile's stage is success", () => {
    const { container, rerender } = render(
      <RateTile vm={makeVm({})} stage="idle" overlay={null} />,
    );
    expect(
      container
        .querySelector('[data-tile-sym="EURUSD"]')
        ?.getAttribute("data-booked"),
    ).toBe("false");

    rerender(<RateTile vm={makeVm({})} stage="success" overlay={null} />);
    expect(
      container
        .querySelector('[data-tile-sym="EURUSD"]')
        ?.getAttribute("data-booked"),
    ).toBe("true");
  });

  test("strengthens the border while any exec/RFQ/done overlay is active", () => {
    const { container, rerender } = render(
      <RateTile vm={makeVm({})} stage="idle" overlay={null} />,
    );
    expect(
      container
        .querySelector('[data-tile-sym="EURUSD"]')
        ?.getAttribute("data-overlay-active"),
    ).toBe("false");

    rerender(<RateTile vm={makeVm({})} stage="executing" overlay={null} />);
    expect(
      container
        .querySelector('[data-tile-sym="EURUSD"]')
        ?.getAttribute("data-overlay-active"),
    ).toBe("true");
  });

  test("colors the flash background by the tick's own direction, independent of the daily move", () => {
    const { container } = render(
      <RateTile
        vm={makeVm({ moveUp: true, flashOn: true, flashUp: false })}
        stage="idle"
        overlay={null}
      />,
    );

    const flashed = container.querySelector(
      '[data-flash="true"]',
    ) as HTMLElement | null;

    expect(flashed).toBeTruthy();
    expect(flashed?.style.getPropertyValue("--flash-color")).toBe(
      "var(--sell)",
    );
    expect(flashed?.style.getPropertyValue("--move-color")).toBe("var(--buy)");
  });
});

function makeVm(overrides: Partial<TileVm>): TileVm {
  return {
    sym: "EURUSD",
    meta: META.EURUSD,
    rate: 1.09213,
    movePips: 4,
    moveUp: true,
    flashOn: false,
    flashUp: false,
    hist: Array.from({ length: 30 }, (_v, i) => {
      return 1.09 + i * 1e-4;
    }),
    notional: "1,000,000",
    notionalInvalid: false,
    isRfq: false,
    showCharts: true,
    onNotional: vi.fn(),
    onReset: vi.fn(),
    onSell: vi.fn(),
    onBuy: vi.fn(),
    ...overrides,
  };
}
