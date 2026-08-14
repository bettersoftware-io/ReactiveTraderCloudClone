// packages/client-core/src/__tests__/composition.jarvisHistory.test.ts
//
// `createApp` late-binds `WsJarvisAdapter.setHistorySource` to
// `presenters.jarvis.state$` once machines exist (see `composition.ts`'s
// `wireJarvisHistorySource`). This covers that wiring end to end: only
// WS-real mode gets it (`ScriptedJarvisAdapter` has no such method), the
// greeting (entry id 0) counts as real history, and — the trap this file
// exists to pin — a turn's own just-sent text must NOT be echoed back to
// itself inside that same turn's `history` payload.
//
// The REAL mechanism (proven by the two "pins the real mechanism" tests
// below): `WsJarvisAdapter.ask()` reads `historySource()` EAGERLY, at CALL
// time — `JarvisMachine.send()`'s `concatMap` invokes `deps.port.ask(text)`
// as an argument expression while BUILDING `concat(of(startPatch), …)`,
// i.e. BEFORE that observable is ever subscribed and therefore BEFORE
// `of(startPatch)` has emitted and appended the new turn's own
// `[userEntry, jarvisEntry stub]` pair to `state.entries`. So in today's
// wiring the exclusion just... doesn't need to happen — the pair isn't
// there yet to exclude.
//
// `historyEntriesExcludingInFlightTurn` (in `composition.ts`) is a separate,
// currently-dead defensive guard against a hypothetical future `ask()`
// refactor (e.g. `defer(() => …)`) that would flip that ordering. It has
// its own direct unit test below, independent of this integration
// behaviour, so a change to ITS logic can't hide behind these two tests
// happening to pass for an unrelated reason.

import { describe, expect, it } from "vitest";

import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";
import { CLIENT_MSG, type JarvisHistoryEntry, SERVER_MSG } from "@rtc/shared";

import { FakeWsAdapter } from "#/adapters/__tests__/FakeWsAdapter";
import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import {
  createSimulatorPorts,
  createWsRealPorts,
  type PortFactoryDeps,
} from "#/adapters/portFactory";
import { createApp, historyEntriesExcludingInFlightTurn } from "#/composition";
import { JARVIS_GREETING, type JarvisEntry } from "#/presenters/JarvisMachine";

describe("composition — jarvis history-source wiring", () => {
  it("simulator mode composes without error (ScriptedJarvisAdapter has no setHistorySource)", () => {
    const { presenters } = createApp({
      ...createSimulatorPorts(deps()),
      connectionEvents: new ConnectionEventsSimulator(),
    });

    expect(() => {
      presenters.jarvis.intents.send("quote EURUSD");
    }).not.toThrow();

    presenters.jarvis.dispose();
  });

  it("PINS THE REAL MECHANISM: the first turn's history is the greeting only — not that turn's own just-sent text", () => {
    const ws = new FakeWsAdapter();
    const { presenters } = createApp({
      ...createWsRealPorts(ws, deps()),
      connectionEvents: {
        events: () => {
          return ws.connectionEvents();
        },
      },
    });

    presenters.jarvis.intents.send("first");

    expect(lastChatHistory(ws)).toEqual([
      { role: "jarvis", text: JARVIS_GREETING },
    ]);

    presenters.jarvis.dispose();
  });

  it("PINS THE REAL MECHANISM: a completed prior turn is included in the NEXT turn's history; the new turn's own text is not", () => {
    const ws = new FakeWsAdapter();
    const { presenters } = createApp({
      ...createWsRealPorts(ws, deps()),
      connectionEvents: {
        events: () => {
          return ws.connectionEvents();
        },
      },
    });

    presenters.jarvis.intents.send("first");
    const firstChat = ws.sentMessages().find((m) => {
      return m.type === CLIENT_MSG.JARVIS_CHAT;
    });

    if (!firstChat) {
      throw new Error(
        "expected the first send to have put a CHAT frame on the wire",
      );
    }

    const firstTurnId = (firstChat.payload as ChatFramePayload).turnId;
    ws.emit(SERVER_MSG.JARVIS_DELTA, {
      turnId: firstTurnId,
      text: "EUR/USD is 1.0850",
    });
    ws.emit(SERVER_MSG.JARVIS_DONE, { turnId: firstTurnId });

    presenters.jarvis.intents.send("second");

    expect(lastChatHistory(ws)).toEqual([
      { role: "jarvis", text: JARVIS_GREETING },
      { role: "user", text: "first" },
      { role: "jarvis", text: "EUR/USD is 1.0850" },
    ]);

    presenters.jarvis.dispose();
  });

  it("RULING: excludes an origin:'system' entry (the budget-downgrade line) from the model-facing history — the model never produced it and must not see it echoed back as its own past turn", () => {
    const ws = new FakeWsAdapter();
    const { presenters } = createApp({
      ...createWsRealPorts(ws, deps()),
      connectionEvents: {
        events: () => {
          return ws.connectionEvents();
        },
      },
    });

    presenters.jarvis.intents.send("first");
    const firstChat = ws.sentMessages().find((m) => {
      return m.type === CLIENT_MSG.JARVIS_CHAT;
    });

    if (!firstChat) {
      throw new Error(
        "expected the first send to have put a CHAT frame on the wire",
      );
    }

    const firstTurnId = (firstChat.payload as ChatFramePayload).turnId;
    ws.emit(SERVER_MSG.JARVIS_DELTA, {
      turnId: firstTurnId,
      text: "EUR/USD is 1.0850",
    });
    ws.emit(SERVER_MSG.JARVIS_DONE, { turnId: firstTurnId });

    // Downgrades PreferencesSimulator's default-preferred brain
    // (DEFAULT_JARVIS_BRAIN, "claude-haiku-4-5") away, appending the
    // budget-downgrade system line into the transcript.
    ws.emitConnectionEvent("gatewayConnected");
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, {
      available: true,
      brains: ["scripted"],
      defaultBrain: "scripted",
      gate: {
        level: "hard",
        resetsAtMs: 0,
        gated: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
      },
    });

    presenters.jarvis.intents.send("second");

    // Greeting + the completed "first" turn — the system line
    // ("Usage budget reached...") does not reach the model.
    expect(lastChatHistory(ws)).toEqual([
      { role: "jarvis", text: JARVIS_GREETING },
      { role: "user", text: "first" },
      { role: "jarvis", text: "EUR/USD is 1.0850" },
    ]);

    presenters.jarvis.dispose();
  });

  it("dispose() also unsubscribes the history source's state$ subscription (WS-real mode)", () => {
    // Without this, `wireJarvisHistorySource`'s subscription permanently pins
    // `state$`'s refCount above zero even after `dispose()` unsubscribes the
    // machine's own internal `warm` subscriber — silently defeating
    // `state()`'s "closes the shared subscription once there are no
    // subscribers" contract in WS-real mode specifically (simulator mode
    // never adds this second subscriber, so it never showed up there).
    const ws = new FakeWsAdapter();
    const { presenters } = createApp({
      ...createWsRealPorts(ws, deps()),
      connectionEvents: {
        events: () => {
          return ws.connectionEvents();
        },
      },
    });

    expect(presenters.jarvis.state$.getRefCount()).toBeGreaterThan(0);

    presenters.jarvis.dispose();

    expect(presenters.jarvis.state$.getRefCount()).toBe(0);
  });
});

describe("historyEntriesExcludingInFlightTurn (direct unit test)", () => {
  // Independent of the "PINS THE REAL MECHANISM" integration tests above —
  // this exercises the guard function's OWN logic directly, so a change to
  // it can't hide behind those tests happening to pass for an unrelated
  // reason (today, `ask()`'s eager read means this function's `slice`
  // branch never actually fires in production — see its doc comment in
  // composition.ts).
  const GREETING_ENTRY: JarvisEntry = {
    id: 0,
    role: "jarvis",
    text: JARVIS_GREETING,
    done: true,
  };

  it("drops the trailing in-flight pair when the last entry isn't done", () => {
    const inFlightUser: JarvisEntry = {
      id: 1,
      role: "user",
      text: "in-flight turn's own message",
      done: true,
    };

    const inFlightJarvisStub: JarvisEntry = {
      id: 2,
      role: "jarvis",
      text: "",
      done: false,
    };

    expect(
      historyEntriesExcludingInFlightTurn([
        GREETING_ENTRY,
        inFlightUser,
        inFlightJarvisStub,
      ]),
    ).toEqual([GREETING_ENTRY]);
  });

  it("is a no-op when the last entry is done (no turn currently in flight)", () => {
    const finishedUser: JarvisEntry = {
      id: 1,
      role: "user",
      text: "already finished",
      done: true,
    };

    const finishedJarvis: JarvisEntry = {
      id: 2,
      role: "jarvis",
      text: "reply",
      done: true,
    };

    expect(
      historyEntriesExcludingInFlightTurn([
        GREETING_ENTRY,
        finishedUser,
        finishedJarvis,
      ]),
    ).toEqual([GREETING_ENTRY, finishedUser, finishedJarvis]);
  });
});

function deps(): PortFactoryDeps {
  return {
    preferences: new PreferencesSimulator(),
    auth: new AuthSimulator({}),
    sessionStore: new InMemorySessionStore(),
  };
}

/** The shape of a sent `CLIENT_MSG.JARVIS_CHAT` frame's payload — named
 * rather than an inline cast (`no-restricted-syntax`). */
interface ChatFramePayload {
  readonly turnId: string;
  readonly history?: readonly JarvisHistoryEntry[];
}

function lastChatHistory(
  ws: FakeWsAdapter,
): readonly JarvisHistoryEntry[] | undefined {
  const chatFrames = ws.sentMessages().filter((m) => {
    return m.type === CLIENT_MSG.JARVIS_CHAT;
  });
  const last = chatFrames[chatFrames.length - 1];

  if (!last) {
    return undefined;
  }

  return (last.payload as ChatFramePayload).history;
}
