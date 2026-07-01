import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { META } from "#/fx/fxData";
import { TileExecOverlay } from "#/fx/LiveRates/TileExecOverlay";
import type { TileState } from "#/fx/types";

afterEach(cleanup);

describe("TileExecOverlay", () => {
  test("idle stage renders nothing", () => {
    const { container } = render(
      <TileExecOverlay
        tile={{ stage: "idle" }}
        meta={META.EURUSD}
        now={Date.now()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("success stage shows the fill summary and a DISMISS action", () => {
    const { getByText } = render(
      <TileExecOverlay
        tile={makeTile({
          stage: "success",
          trade: {
            id: 1050,
            dir: "Buy",
            notional: "1,000,000",
            rate: "1.09213",
          },
        })}
        meta={META.EURUSD}
        now={Date.now()}
      />,
    );
    expect(getByText("You Bought")).toBeTruthy();
    expect(getByText("DISMISS")).toBeTruthy();
  });

  test("failure stage shows the rejection message", () => {
    const { getByText } = render(
      <TileExecOverlay
        tile={makeTile({ stage: "failure" })}
        meta={META.EURUSD}
        now={Date.now()}
      />,
    );
    expect(getByText("Trade Rejected")).toBeTruthy();
    expect(getByText("DISMISS")).toBeTruthy();
  });
});

function makeTile(overrides: Partial<TileState>): TileState {
  return {
    stage: "idle",
    ...overrides,
  };
}
