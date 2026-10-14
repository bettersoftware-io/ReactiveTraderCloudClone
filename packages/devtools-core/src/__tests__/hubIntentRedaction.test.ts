import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DevtoolsHub } from "../DevtoolsHub";
import type { AppToInspector, InspectorToApp } from "../protocol";
import type { SerializedValue } from "../serialize";

// An intent's arguments reach the inspector's ring buffer, and the MV3
// extension can attach to the deployed build: a secret a login-screen intent
// carries (the chosen password, the emailed code) must never be recorded.
describe("DevtoolsHub intent redaction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("masks a password and keeps the other properties of an object argument", () => {
    expect(
      recordIntentArgs([
        { email: "ann@desk.io", displayName: "Ann", password: "Correct-9x" },
      ]),
    ).toEqual([
      { email: "ann@desk.io", displayName: "Ann", password: "[redacted]" },
    ]);
  });

  it("masks both the code and the password", () => {
    expect(
      recordIntentArgs([{ code: "12345678", password: "Correct-9x" }]),
    ).toEqual([{ code: "[redacted]", password: "[redacted]" }]);
  });

  it("masks a secret on a prototype-less object too", () => {
    const input: Record<string, unknown> = Object.create(null);
    input.code = "12345678";

    expect(recordIntentArgs([input])).toEqual([{ code: "[redacted]" }]);
  });

  it("leaves non-object arguments, and objects without a secret, unchanged", () => {
    expect(
      recordIntentArgs(["ann@desk.io", 7, null, ["password"], { side: "buy" }]),
    ).toEqual(["ann@desk.io", 7, null, ["password"], { side: "buy" }]);
  });

  it("leaves the arguments the intent itself receives untouched", () => {
    const input = { code: "12345678", password: "Correct-9x" };

    recordIntentArgs([input]);

    expect(input).toEqual({ code: "12345678", password: "Correct-9x" });
  });
});

/** Records one `machine:intent` with `args` through a live hub and returns
 * the arguments the inspector received. */
function recordIntentArgs(args: readonly unknown[]): SerializedValue {
  const sent: AppToInspector[] = [];
  const inbound$ = new Subject<InspectorToApp>();
  const hub = new DevtoolsHub({ appId: "test-app" });
  hub.attachTransport({
    send: (message: AppToInspector): void => {
      sent.push(message);
    },
    inbound$,
    dispose: (): void => {},
  });
  inbound$.next({ kind: "hello", v: 2 });
  const machineId = hub.machineCreated(
    "accountAccess",
    [],
    new Subject<string>(),
    {},
  );

  hub.machineIntent(machineId, "submit", args);
  vi.advanceTimersByTime(40); // past one 33ms flush window

  for (const message of sent) {
    if (message.kind !== "batch") {
      continue;
    }

    for (const event of message.events) {
      if (event.kind === "machine:intent") {
        return event.args;
      }
    }
  }

  throw new Error("no machine:intent was recorded");
}
