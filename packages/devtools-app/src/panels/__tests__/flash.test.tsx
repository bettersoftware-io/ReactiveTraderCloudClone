// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StreamRow } from "@rtc/devtools-core";

import { stateTreePanelPage } from "#tests/pages/StateTreePanelPage";

const panel = stateTreePanelPage();

afterEach(() => {
  panel.unmountAll();
});

let animateSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  animateSpy = vi.fn(() => {
    return { cancel: () => {} };
  });
  // jsdom lacks a real WAAPI; install a spy.
  Element.prototype.animate =
    animateSpy as unknown as typeof Element.prototype.animate;
});

describe("StateTreePanel change-flash", () => {
  it("animates a row on a new lastSeq (mount counts as first emission when >0)", () => {
    panel.mountStateTreePanel({ streams: [row("a.x$", 1)] });
    const initial = animateSpy.mock.calls.length;

    panel.rerenderWith({ streams: [row("a.x$", 2)] });

    expect(animateSpy.mock.calls.length).toBeGreaterThan(initial);
  });

  it("does not animate when lastSeq is unchanged", () => {
    panel.mountStateTreePanel({ streams: [row("a.x$", 5)] });
    const countAfterInitial = animateSpy.mock.calls.length;

    // Re-render with same lastSeq but different unrelated field.
    panel.rerenderWith({
      streams: [
        {
          streamId: "a.x$",
          lastSeq: 5,
          lastValue: 5,
          totalEmissions: 10,
          ratePerSec: 1.5,
        },
      ],
    });

    // Same lastSeq → the effect dep is unchanged → no new animate.
    expect(animateSpy.mock.calls.length).toBe(countAfterInitial);
  });
});

function row(streamId: string, lastSeq: number): StreamRow {
  return {
    streamId,
    lastValue: lastSeq,
    lastSeq,
    totalEmissions: lastSeq,
    ratePerSec: 0,
  };
}
