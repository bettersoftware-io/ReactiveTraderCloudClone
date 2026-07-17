import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DevtoolsHub } from "../DevtoolsHub";
import type {
  AppToInspector,
  DevtoolsEvent,
  InspectorToApp,
} from "../protocol";

// The inbound intent-injection write path is gated on the hub's runtime `dev`
// flag (set by each composition root: web `import.meta.env?.DEV === true`, RN
// `__DEV__`). It replaced a bundler-static `import.meta.env.DEV` gate, so the
// "a production (non-dev) hub ignores intent:invoke" invariant — once asserted
// by grepping the built web bundle (`check:devtools-no-inject`) — now lives in
// the `dev: false` test below, which exercises the actual runtime gate.
describe("DevtoolsHub intent injection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("in a dev build, intent:invoke calls the wrapped intent and echoes a machine:intent event", () => {
    const { hub, sent, inbound$ } = harness(true);
    const state$ = new Subject<string>();
    const submit = vi.fn();

    // Wrap the intent exactly as the instrumentation does: it self-reports via
    // hub.machineIntent, so an injected call is auditable like a UI-driven one.
    const intents: Record<string, unknown> = {};
    const id = hub.machineCreated("orderTicket", ["AAPL"], state$, intents);

    intents.submit = (...args: unknown[]): void => {
      hub.machineIntent(id, "submit", args);
      submit(...args);
    };

    inbound$.next({ kind: "hello", v: 2 });
    inbound$.next({
      kind: "intent:invoke",
      machineId: id,
      name: "submit",
      args: ["EURUSD", 1_000_000],
    });

    expect(submit).toHaveBeenCalledWith("EURUSD", 1_000_000);

    vi.advanceTimersByTime(40); // past one 33ms flush window
    const echoed = batchedEvents(sent).some((e) => {
      return e.kind === "machine:intent" && e.name === "submit";
    });
    expect(echoed).toBe(true);
  });

  it("reports a devtools:error (no throw) for an unknown machine or unknown intent", () => {
    const { hub, sent, inbound$ } = harness(true);
    const state$ = new Subject<string>();
    const intents: Record<string, unknown> = { submit: vi.fn() };
    const id = hub.machineCreated("orderTicket", [], state$, intents);

    inbound$.next({ kind: "hello", v: 2 });

    expect(() => {
      inbound$.next({
        kind: "intent:invoke",
        machineId: "does-not-exist",
        name: "submit",
        args: [],
      });
      inbound$.next({
        kind: "intent:invoke",
        machineId: id,
        name: "nope",
        args: [],
      });
    }).not.toThrow();

    vi.advanceTimersByTime(40);
    const errors = batchedEvents(sent).filter((e) => {
      return e.kind === "devtools:error";
    });
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it("in a production (non-dev) build, intent:invoke is a runtime no-op (gate off)", () => {
    const { hub, inbound$ } = harness(false);
    const state$ = new Subject<string>();
    const submit = vi.fn();
    const intents: Record<string, unknown> = { submit };
    const id = hub.machineCreated("orderTicket", [], state$, intents);

    inbound$.next({ kind: "hello", v: 2 });
    inbound$.next({
      kind: "intent:invoke",
      machineId: id,
      name: "submit",
      args: [],
    });

    expect(submit).not.toHaveBeenCalled();
  });

  it("sends welcome.dev reflecting the hub's dev option", () => {
    const { sent, inbound$ } = harness(true);

    inbound$.next({ kind: "hello", v: 2 });

    const welcome = sent.find((m) => {
      return m.kind === "welcome";
    });
    expect(welcome).toMatchObject({ kind: "welcome", dev: true });
  });
});

interface Harness {
  hub: DevtoolsHub;
  sent: AppToInspector[];
  inbound$: Subject<InspectorToApp>;
}

function harness(dev: boolean): Harness {
  const sent: AppToInspector[] = [];
  const inbound$ = new Subject<InspectorToApp>();
  const hub = new DevtoolsHub({ appId: "test-app", dev });
  hub.attachTransport({
    send: (m: AppToInspector): void => {
      sent.push(m);
    },
    inbound$,
    dispose: (): void => {},
  });

  return { hub, sent, inbound$ };
}

function batchedEvents(sent: readonly AppToInspector[]): DevtoolsEvent[] {
  const events: DevtoolsEvent[] = [];

  for (const msg of sent) {
    if (msg.kind === "batch") {
      events.push(...msg.events);
    }
  }

  return events;
}
