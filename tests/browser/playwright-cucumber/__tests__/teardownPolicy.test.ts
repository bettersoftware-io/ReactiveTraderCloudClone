import { describe, expect, it } from "vitest";

import { classifyBrowserTeardown } from "../teardownPolicy";

describe("classifyBrowserTeardown", () => {
  it("says nothing when close() completed cleanly in time", () => {
    expect(
      classifyBrowserTeardown({ failure: null, stillConnected: false }),
    ).toEqual({ kind: "clean" });
  });

  it("stays clean even if the browser still reports connected, when close() did not fail", () => {
    // `failure === null` is the authoritative signal that teardown worked; a
    // stale isConnected() reading must not manufacture a leak out of a clean run.
    expect(
      classifyBrowserTeardown({ failure: null, stillConnected: true }),
    ).toEqual({ kind: "clean" });
  });

  it("reports a leak when close() overran its budget and the browser is still held", () => {
    const verdict = classifyBrowserTeardown({
      failure: "did not return within 20000ms",
      stillConnected: true,
    });

    expect(verdict.kind).toBe("leaked");
    expect(verdict.kind === "leaked" && verdict.reason).toContain(
      "STILL CONNECTED",
    );
    // The message must tell a CI-log reader that their tests are not at fault.
    expect(verdict.kind === "leaked" && verdict.reason).toContain(
      "not a test failure",
    );
  });

  it("treats a late-but-disconnected close as benign rather than a failure", () => {
    const verdict = classifyBrowserTeardown({
      failure: "did not return within 20000ms",
      stillConnected: false,
    });

    expect(verdict.kind).toBe("settledLate");
    expect(verdict.kind === "settledLate" && verdict.reason).toContain(
      "nothing leaked",
    );
  });

  it("classifies a THROWN close the same way — by whether the browser is still held", () => {
    // A rejected close() is not automatically a leak: it commonly rejects
    // *because* the browser already went away.
    expect(
      classifyBrowserTeardown({
        failure: "threw: Error: Target closed",
        stillConnected: false,
      }).kind,
    ).toBe("settledLate");

    expect(
      classifyBrowserTeardown({
        failure: "threw: Error: Target closed",
        stillConnected: true,
      }).kind,
    ).toBe("leaked");
  });

  it("carries the underlying failure text into the reason, so the cause is not lost", () => {
    const verdict = classifyBrowserTeardown({
      failure: "threw: Error: connection closed",
      stillConnected: false,
    });

    expect(verdict.kind === "settledLate" && verdict.reason).toContain(
      "connection closed",
    );
  });
});
