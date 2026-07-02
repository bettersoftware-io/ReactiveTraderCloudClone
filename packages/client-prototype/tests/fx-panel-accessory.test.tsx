import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import type { PanelId } from "#/fx/layout/useDockState";
import { Panel } from "#/layout/Panel";

afterEach(cleanup);

describe("Panel headAccessory", () => {
  test("renders the accessory node when provided", () => {
    const { getByText, getByLabelText } = render(
      <Panel
        id={ANA_ID}
        head={<span>Analytics</span>}
        maxPanel={null}
        onToggleMax={noop}
        headAccessory="⊕"
      >
        <div>body</div>
      </Panel>,
    );
    expect(getByText("⊕")).toBeTruthy();
    expect(getByLabelText("Maximize")).toBeTruthy();
  });

  test("omits the accessory when not provided", () => {
    const { queryByText, getByLabelText } = render(
      <Panel
        id={ANA_ID}
        head={<span>Analytics</span>}
        maxPanel={null}
        onToggleMax={noop}
      >
        <div>body</div>
      </Panel>,
    );
    expect(queryByText("⊕")).toBeNull();
    expect(getByLabelText("Maximize")).toBeTruthy();
  });

  test("omits the maximize button when maximizable is false", () => {
    const { queryByTitle, queryByLabelText } = render(
      <Panel
        id={ANA_ID}
        head={<span>Analytics</span>}
        maxPanel={null}
        onToggleMax={noop}
        maximizable={false}
      >
        <div>body</div>
      </Panel>,
    );
    expect(queryByLabelText("Maximize")).toBeNull();
    expect(queryByTitle("Maximize")).toBeNull();
  });
});

// — helpers ————————————————————————————————————————————————————————————————

const ANA_ID: PanelId = "ana";

function noop(): void {
  // no-op toggle handler for the test
}
