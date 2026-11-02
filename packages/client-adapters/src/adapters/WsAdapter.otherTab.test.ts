// packages/client-adapters/src/adapters/WsAdapter.otherTab.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionStore, StoredSession } from "@rtc/core-api";
import {
  AuthSimulator,
  type PreferencesPort,
  ROSTER,
  type RosterEntry,
} from "@rtc/domain";
import { CLIENT_MSG } from "@rtc/shared";

import { InMemorySessionStore } from "./InMemorySessionStore";
import { lastMock, MockWebSocket } from "./MockWebSocket.testHelpers";
import { createWsRealPorts } from "./portFactory";
import { WsAdapter } from "./WsAdapter";
import type { WsJarvisAdapter } from "./WsJarvisAdapter";

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.constructed = 0;
  vi.stubGlobal("WebSocket", MockWebSocket);
});
afterEach(() => {
  tab?.ws.dispose();
  tab = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("WsAdapter when the session moved on in another tab", () => {
  it("an account switch ends this session at the reconnect, and opens nothing", () => {
    const { shared, ended } = openTab(ROSTER[0], "TOKEN-OF-X");

    shared.write(createSession(ROSTER[1], "TOKEN-OF-Y"));
    dropAndWait();

    expect(MockWebSocket.constructed).toBe(1);
    expect(ended.count).toBe(1);
  });

  it("a sign-out ends this session at the reconnect, and opens nothing", () => {
    const { shared, ended } = openTab(ROSTER[0], "TOKEN-OF-X");

    shared.clear();
    dropAndWait();

    expect(MockWebSocket.constructed).toBe(1);
    expect(ended.count).toBe(1);
  });

  it("a plain drop with the same token reconnects and sends the key again", () => {
    const { ended, jarvis } = openTab(ROSTER[0], "TOKEN-OF-X");
    jarvis.availability$().subscribe();
    jarvis.setOwnKey(KEY_SETTING);

    dropAndWait();
    openLast();

    expect(MockWebSocket.constructed).toBe(2);
    expect(lastMock.url).toContain("TOKEN-OF-X");
    expect(ended.count).toBe(0);
    expect(framesOf(lastMock, CLIENT_MSG.JARVIS_KEY)).toEqual([
      { action: "set", ...KEY_SETTING },
    ]);
  });

  it("an unlock's new token, written by this tab, is not another tab's: the reconnect opens with it", () => {
    const { own, ended } = openTab(ROSTER[0], "TOKEN-OF-X");

    own.write(createSession(ROSTER[0], "ROTATED-BY-UNLOCK"));
    dropAndWait();

    expect(MockWebSocket.constructed).toBe(2);
    expect(lastMock.url).toContain("ROTATED-BY-UNLOCK");
    expect(ended.count).toBe(0);
  });

  it("another tab's write after this tab's unlock still ends the session", () => {
    const { own, shared, ended } = openTab(ROSTER[0], "TOKEN-OF-X");

    own.write(createSession(ROSTER[0], "ROTATED-BY-UNLOCK"));
    shared.write(createSession(ROSTER[1], "TOKEN-OF-Y"));
    dropAndWait();

    expect(MockWebSocket.constructed).toBe(1);
    expect(ended.count).toBe(1);
  });

  it("a reconnect still pending keeps checking: the session may move on between attempts", () => {
    const { shared, ended } = openTab(ROSTER[0], "TOKEN-OF-X");

    dropAndWait();
    expect(MockWebSocket.constructed).toBe(2);
    shared.write(createSession(ROSTER[1], "TOKEN-OF-Y"));
    dropAndWait();

    expect(MockWebSocket.constructed).toBe(2);
    expect(ended.count).toBe(1);
  });

  it("coming back from an idle close checks too", () => {
    const { shared, ws, ended } = openTab(ROSTER[0], "TOKEN-OF-X");

    ws.closeForIdle();
    shared.write(createSession(ROSTER[1], "TOKEN-OF-Y"));
    ws.reopen();

    expect(MockWebSocket.constructed).toBe(1);
    expect(ended.count).toBe(1);
  });

  it("coming back from an idle close with the same token reopens", () => {
    const { ws, ended } = openTab(ROSTER[0], "TOKEN-OF-X");

    ws.closeForIdle();
    ws.reopen();

    expect(MockWebSocket.constructed).toBe(2);
    expect(ended.count).toBe(0);
  });

  it("a deliberate connect() after sign-in opens with the new token, whatever the old socket held", () => {
    const { shared, ws, ended } = openTab(ROSTER[0], "TOKEN-OF-X");

    shared.write(createSession(ROSTER[1], "TOKEN-OF-Y"));
    dropAndWait();
    expect(ended.count).toBe(1);

    ws.connect();

    expect(MockWebSocket.constructed).toBe(2);
    expect(lastMock.url).toContain("TOKEN-OF-Y");
    expect(ended.count).toBe(1);
  });

  it("after that connect(), a plain drop reconnects: the new token is this tab's", () => {
    const { shared, ws, ended } = openTab(ROSTER[0], "TOKEN-OF-X");

    shared.write(createSession(ROSTER[1], "TOKEN-OF-Y"));
    dropAndWait();
    ws.connect();
    openLast();
    dropAndWait();

    expect(MockWebSocket.constructed).toBe(3);
    expect(lastMock.url).toContain("TOKEN-OF-Y");
    expect(ended.count).toBe(1);
  });

  it("a socket that never had a token keeps reconnecting, and takes one that appears: there is no session to end", () => {
    let token: string | undefined;
    const ws = new WsAdapter(
      "ws://test",
      () => {
        return token;
      },
      { reconnectDelayMs: RECONNECT_DELAY_MS },
    );
    let ended = 0;
    ws.sessionEnded().subscribe(() => {
      ended += 1;
    });

    openLast();
    dropAndWait();
    expect(MockWebSocket.constructed).toBe(2);

    token = "LATE-TOKEN";
    dropAndWait();

    expect(MockWebSocket.constructed).toBe(3);
    expect(lastMock.url).toContain("LATE-TOKEN");
    expect(ended).toBe(0);
    ws.dispose();
  });
});

function openTab(entry: RosterEntry, token: string): Tab {
  const shared = new InMemorySessionStore();
  shared.write(createSession(entry, token));
  const ws = new WsAdapter(
    "ws://test",
    () => {
      return shared.read()?.token;
    },
    { autoConnect: false, reconnectDelayMs: RECONNECT_DELAY_MS },
  );

  const ports = createWsRealPorts(ws, {
    preferences: {} as PreferencesPort,
    auth: new AuthSimulator({}),
    sessionStore: shared,
  });
  const ended = { count: 0 };
  ws.sessionEnded().subscribe(() => {
    ended.count += 1;
  });
  ws.connect();
  openLast();
  tab = {
    shared,
    own: ports.sessionStore,
    ws,
    jarvis: ports.jarvis as WsJarvisAdapter,
    ended,
  };
  return tab;
}

function openLast(): void {
  lastMock.readyState = MockWebSocket.OPEN;
  lastMock.onopen?.(new Event("open"));
}

/** The 1006 every failure reads as in a browser, a 401 upgrade included. */
function dropAndWait(): void {
  lastMock.readyState = 3;
  lastMock.onclose?.({ code: 1006 } as CloseEvent);
  vi.advanceTimersByTime(RECONNECT_DELAY_MS);
}

function framesOf(socket: MockWebSocket, type: string): unknown[] {
  return socket.send.mock.calls
    .map(([raw]) => {
      return JSON.parse(String(raw)) as SentFrame;
    })
    .filter((frame) => {
      return frame.type === type;
    })
    .map((frame) => {
      return frame.payload;
    });
}

function createSession(entry: RosterEntry, token: string): StoredSession {
  return {
    token,
    user: entry.user,
    username: entry.username,
    exp: Number.MAX_SAFE_INTEGER,
  };
}

const RECONNECT_DELAY_MS = 100;

const KEY_SETTING = {
  provider: "anthropic",
  key: "sk-ant-api03-abcdefghij1234",
  capUsd: 1,
} as const;

/** The session store is localStorage, shared by every tab, and the adapter
 * reads its token from there. Here `shared` is that storage, so a write
 * straight to it is ANOTHER tab; `own` is the store this tab's auth was given
 * by `createWsRealPorts`. */
interface Tab {
  readonly shared: InMemorySessionStore;
  readonly own: SessionStore;
  readonly ws: WsAdapter;
  readonly jarvis: WsJarvisAdapter;
  readonly ended: { count: number };
}

interface SentFrame {
  readonly type: string;
  readonly payload?: unknown;
}

let tab: Tab | null = null;
