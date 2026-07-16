import { EMPTY, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DevtoolsHub } from "../DevtoolsHub";
import type {
  AppToInspector,
  DevtoolsEvent,
  InspectorToApp,
} from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";

describe("DevtoolsHub event stamping", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stamps monotonically increasing seq and a numeric ts on emitted events", () => {
    const sent: AppToInspector[] = [];
    const inbound$ = new Subject<InspectorToApp>();
    const hub = new DevtoolsHub({ appId: "t" });
    hub.attachTransport({
      send: (m: AppToInspector): void => {
        sent.push(m);
      },
      inbound$,
      dispose: (): void => {},
    });

    inbound$.next({ kind: "hello", v: PROTOCOL_VERSION });
    // Register two streams so two events flow.
    hub.registerStream("s.a$", EMPTY);
    hub.registerStream("s.b$", EMPTY);

    vi.advanceTimersByTime(40); // past one ~33ms flush

    const batch = findLastBatch(sent);
    expect(batch).toBeDefined();
    const events = batchEvents(batch) ?? [];
    expect(events.length).toBeGreaterThan(0);

    for (const ev of events) {
      expect(typeof ev.seq).toBe("number");
      expect(typeof ev.ts).toBe("number");
    }

    for (let i = 1; i < events.length; i += 1) {
      expect(events[i].seq).toBeGreaterThan(events[i - 1].seq);
    }

    hub.dispose();
  });
});

function findLastBatch(
  sent: readonly AppToInspector[],
): AppToInspector | undefined {
  for (let i = sent.length - 1; i >= 0; i -= 1) {
    if (sent[i]?.kind === "batch") {
      return sent[i];
    }
  }

  return undefined;
}

function batchEvents(
  msg: AppToInspector | undefined,
): readonly DevtoolsEvent[] | undefined {
  if (msg?.kind !== "batch") {
    return undefined;
  }

  return msg.events;
}
