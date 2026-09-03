import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { LogRow } from "@rtc/devtools-core";
import * as devtoolsCore from "@rtc/devtools-core";

import { ALL_SCOPE } from "#/nav/scope";
import styles from "#/timeline/ContextPane.module.css";
import { contextPanePage } from "#tests/pages/ContextPanePage";

const pane = contextPanePage();

afterEach(() => {
  pane.unmountAll();
});

// Restore in afterEach (not only after the assertion below) so a failing
// assertion can never leak the mock into a later test.
afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  Element.prototype.animate = vi.fn(() => {
    return { cancel: () => {} };
  }) as unknown as typeof Element.prototype.animate;
});

test("follow mode shows the live state tree", () => {
  pane.mount();

  expect(pane.hasText("fx.price$")).toBe(true);
  expect(pane.hasText("3")).toBe(true); // latest value
});

test("pinned mode reconstructs State and marks values that differ from live", () => {
  const harness = pane.mount();

  harness.pin(rowAt(harness.log, 1));

  pane.click("context-tab-state");
  expect(pane.hasText("1")).toBe(true); // historical value
  expect(pane.hasText("≠ live")).toBe(true);
});

test("diff tab shows leaf changes vs the predecessor", () => {
  const harness = pane.mount();

  harness.pin(rowAt(harness.log, 2));

  pane.click("context-tab-diff");
  expect(pane.hasText("changed")).toBe(true);
});

test("a pinned moment is named in the context pane header and the badge leaves on resume", () => {
  const harness = pane.mount();

  expect(pane.exists("state-at-seq")).toBe(false);

  harness.pin(rowAt(harness.log, 2));
  expect(pane.textOf("state-at-seq")).toBe(
    `@ seq ${rowAt(harness.log, 2).seq}`,
  );

  harness.resume();
  expect(pane.exists("state-at-seq")).toBe(false);
});

test("resuming from a pinned Diff selection clears the stale tab highlight", () => {
  const harness = pane.mount();

  harness.pin(rowAt(harness.log, 2));

  pane.click("context-tab-diff");

  harness.resume();

  expect(pane.hasClass("context-tab-diff", styles.tabActive)).toBe(false);
  expect(pane.hasClass("context-tab-diff", styles.tab)).toBe(true);
  expect(pane.hasClass("context-tab-state", styles.tabActive)).toBe(true);
});

// This is a plumbing test, not a real-failure scenario: findPredecessorRow /
// diffableValueOf / diffSerialized are pure and cannot throw on well-formed
// input. It only proves DiffTab's try/catch still routes a thrown error to
// ErrorCard after the JSX-out-of-try/catch restructure.
test("diff tab renders ErrorCard when the diff computation throws", () => {
  vi.spyOn(devtoolsCore, "diffSerialized").mockImplementation(() => {
    throw new Error("boom");
  });

  const harness = pane.mount();

  harness.pin(rowAt(harness.log, 2));

  pane.click("context-tab-diff");

  expect(pane.hasText("⚠ Diff failed: Error: boom")).toBe(true);
});

test("wire scope disables the State tab and explains why", () => {
  pane.mount({ kind: "wire" });

  expect(pane.isDisabled("context-tab-state")).toBe(true);
  expect(pane.hasText("wire messages carry no state")).toBe(true);
});

test("machine scope shows the Machine tab with state and intents", () => {
  pane.mount({ kind: "machine", machineId: "m1" }, true);

  pane.click("context-tab-machine");
  expect(pane.hasText("tileExecution")).toBe(true);
  expect(pane.hasText("Intents (0)")).toBe(true);
});

test("pinning a machine row under All surfaces the Machine tab; a stream row hides it", () => {
  const harness = pane.mount(ALL_SCOPE, true);

  expect(pane.exists("context-tab-machine")).toBe(false);

  harness.pin(rowAt(harness.log, 4));
  expect(pane.exists("context-tab-machine")).toBe(true);

  harness.pin(rowAt(harness.log, 1));
  expect(pane.exists("context-tab-machine")).toBe(false);
});

test("the first value a source ever emitted has no prior value to diff against", () => {
  const harness = pane.mount();

  harness.pin(rowAt(harness.log, 1));

  pane.click("context-tab-diff");
  expect(pane.hasText("No prior value to diff against.")).toBe(true);
});

test("a moment aged out of the rolling buffer explains itself instead of blanking", () => {
  vi.spyOn(
    devtoolsCore.LiveHistory.prototype,
    "oldestSeq",
    "get",
  ).mockReturnValue(5);

  const harness = pane.mount();

  harness.pin(rowAt(harness.log, 2));

  expect(
    pane.hasText(
      "⚠ This moment left the rolling buffer — Resume to return to live.",
    ),
  ).toBe(true);
});

test("a reconstruction that throws renders the failure, not a blank pane", () => {
  vi.spyOn(devtoolsCore.LiveHistory.prototype, "stateAt").mockImplementation(
    () => {
      throw new Error("torn history");
    },
  );

  const harness = pane.mount();

  harness.pin(rowAt(harness.log, 2));

  expect(
    pane.hasText("⚠ State reconstruction failed: Error: torn history"),
  ).toBe(true);
});

test("a reconstruction failure renders the reconstruction-failed card, not a blank pane", () => {
  vi.spyOn(devtoolsCore.LiveHistory.prototype, "stateAt").mockImplementation(
    () => {
      throw new Error("history is corrupt");
    },
  );
  const harness = pane.mount();

  harness.pin(rowAt(harness.log, 1));

  expect(
    pane.hasText("⚠ State reconstruction failed: Error: history is corrupt"),
  ).toBe(true);
  pane.click("context-tab-diff");
  expect(
    pane.hasText("⚠ State reconstruction failed: Error: history is corrupt"),
  ).toBe(true);
});

function rowAt(log: readonly LogRow[], seq: number): LogRow {
  const row = log.find((r) => {
    return r.seq === seq;
  });

  if (row === undefined) {
    throw new Error(`no row with seq ${seq}`);
  }

  return row;
}
