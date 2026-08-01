// packages/client-core/src/__tests__/composition.jarvisHistory.test.ts
//
// `createApp` late-binds `WsJarvisAdapter.setHistorySource` to
// `presenters.jarvis.state$` once machines exist (see `composition.ts`'s
// `wireJarvisHistorySource`). This covers that wiring end to end: only
// WS-real mode gets it (`ScriptedJarvisAdapter` has no such method), the
// greeting (entry id 0) counts as real history, and — the trap this file
// exists to pin — a turn's own just-appended user entry must NOT be echoed
// back to itself inside that same turn's `history` payload (JarvisMachine's
// "start" patch appends it to state BEFORE `port.ask()` runs).

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
import { createApp } from "#/composition";
import { JARVIS_GREETING } from "#/presenters/JarvisMachine";

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

  it("the first turn's history is the greeting only — not that turn's own just-appended user message", () => {
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

  it("a completed prior turn is included in the NEXT turn's history; the new turn's own pair is excluded", () => {
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
    const firstTurnId = (
      ws.sentMessages().find((m) => {
        return m.type === CLIENT_MSG.JARVIS_CHAT;
      })?.payload as ChatFramePayload
    ).turnId;
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
  return (last?.payload as ChatFramePayload).history;
}
