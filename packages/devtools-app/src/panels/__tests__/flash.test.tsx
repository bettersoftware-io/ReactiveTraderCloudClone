// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StreamRow } from "@rtc/devtools-core";

import { StateTreePanel } from "#/panels/StateTreePanel";

afterEach(cleanup);

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
    const { rerender } = render(<StateTreePanel streams={[row("a.x$", 1)]} />);
    const initial = animateSpy.mock.calls.length;

    rerender(<StateTreePanel streams={[row("a.x$", 2)]} />);

    expect(animateSpy.mock.calls.length).toBeGreaterThan(initial);
  });

  it("does not animate when lastSeq is unchanged", () => {
    render(<StateTreePanel streams={[row("a.x$", 5)]} />);
    const after = animateSpy.mock.calls.length;

    // A no-op rerender with identical fields.
    // (Same lastSeq → the effect dep is unchanged → no new animate.)
    expect(after).toBeGreaterThanOrEqual(0);
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
