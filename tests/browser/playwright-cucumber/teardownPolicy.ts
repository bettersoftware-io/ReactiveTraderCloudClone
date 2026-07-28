// What a suite should DO when browser teardown does not complete cleanly.
//
// Extracted from the AfterAll hook so the decision is a pure function with its
// own tests: the branch that matters only fires in a condition no test run can
// summon on demand (a shutdown that overruns its budget), so without a unit test
// it would be unexercised code that silently rots.
//
// The rule: judge the RESOURCE, not the clock. `close()` overrunning its budget
// is a proxy; whether a live browser is still held is the fact. They come apart,
// and only one of them warrants failing a run whose scenarios all passed.

export type TeardownVerdict =
  /** Shut down cleanly and in time — say nothing. */
  | { readonly kind: "clean" }
  /**
   * Still holding a live browser: a genuine leak, and the only outcome worth
   * failing the run over. `reason` is written for someone reading a red CI log
   * who did not write this code.
   */
  | { readonly kind: "leaked"; readonly reason: string }
  /**
   * The browser is down; only the promise was late. Nothing is leaked —
   * playwright-core reaps any browser it spawned via process-exit handlers
   * (`gracefullyCloseAll`, with a SIGKILL path). Report it, but never invert a
   * green run: by AfterAll every scenario has recorded its own result, cucumber
   * counts a failed hook as a failed run, and hooks are NOT covered by `retry` —
   * which is how this suite once went red with all 47 scenarios green.
   */
  | { readonly kind: "settledLate"; readonly reason: string };

export interface BrowserTeardownFacts {
  /** How `close()` failed, or null when it completed cleanly in time. */
  readonly failure: string | null;
  /** Whether the browser reports itself still connected AFTER the attempt. */
  readonly stillConnected: boolean;
}

export function classifyBrowserTeardown(
  facts: BrowserTeardownFacts,
): TeardownVerdict {
  if (facts.failure === null) {
    return { kind: "clean" };
  }

  if (facts.stillConnected) {
    return {
      kind: "leaked",
      reason:
        `browser.close() ${facts.failure} and the browser is STILL CONNECTED — ` +
        `a Chromium is being leaked. The scenarios themselves passed; this is a ` +
        `teardown defect, not a test failure.`,
    };
  }

  return {
    kind: "settledLate",
    reason:
      `browser.close() ${facts.failure}, but the browser is already ` +
      `disconnected — nothing leaked, continuing.`,
  };
}
