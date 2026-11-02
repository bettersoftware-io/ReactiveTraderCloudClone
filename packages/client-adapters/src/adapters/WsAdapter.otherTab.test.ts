// packages/client-adapters/src/adapters/WsAdapter.otherTab.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredSession } from "@rtc/core-api";
import { ROSTER, type RosterEntry } from "@rtc/domain";
import { CLIENT_MSG } from "@rtc/shared";

import { InMemorySessionStore } from "./InMemorySessionStore";
import { MockWebSocket } from "./MockWebSocket.testHelpers";
import { WsAdapter } from "./WsAdapter";
import { WsJarvisAdapter } from "./WsJarvisAdapter";

let constructedSockets: MockWebSocket[] = [];

class TrackedWebSocket extends MockWebSocket {
  constructor(url: string) {
    super(url);
    constructedSockets.push(this);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  constructedSockets = [];
  vi.stubGlobal("WebSocket", TrackedWebSocket);
});
afterEach(() => {
  for (const tab of opened) {
    tab.ws.dispose();
  }

  opened.length = 0;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("WsAdapter when the session moved on in another tab", () => {
  it("an account switch ends this session at the reconnect, and opens nothing", () => {
    const shared = createSharedStore(X, "TOKEN-OF-X");
    const b = openTab(shared);

    switchAccount(shared, Y, "TOKEN-OF-Y");
    dropAndWait(b);

    expect(b.sockets).toHaveLength(1);
    expect(b.ended.count).toBe(1);
  });

  it("a sign-out ends this session at the reconnect, and opens nothing", () => {
    const shared = createSharedStore(X, "TOKEN-OF-X");
    const b = openTab(shared);

    shared.clear();
    dropAndWait(b);

    expect(b.sockets).toHaveLength(1);
    expect(b.ended.count).toBe(1);
  });

  it("a plain drop with the same token reconnects and sends the key again", () => {
    const shared = createSharedStore(X, "TOKEN-OF-X");
    const b = openTab(shared);
    b.jarvis.setOwnKey(KEY_OF_X);

    dropAndWait(b);
    openLatest(b);

    expect(b.sockets).toHaveLength(2);
    expect(latest(b).url).toContain("TOKEN-OF-X");
    expect(b.ended.count).toBe(0);
    expect(keyFramesOn(latest(b))).toEqual([{ action: "set", ...KEY_OF_X }]);
  });

  it("another tab's unlock on the same account keeps both tabs signed in and reconnecting", () => {
    const shared = createSharedStore(X, "TOKEN-OF-X");
    const a = openTab(shared);
    const b = openTab(shared);
    a.jarvis.setOwnKey(KEY_OF_X);
    b.jarvis.setOwnKey(KEY_OF_X);

    // Tab A locks and unlocks: the same account, a new token, in the store
    // both tabs read.
    shared.write(createSession(X, "TOKEN-OF-X-AFTER-UNLOCK"));
    dropAndWait(b);
    openLatest(b);
    dropAndWait(a);
    openLatest(a);

    for (const tab of [a, b]) {
      expect(tab.ended.count).toBe(0);
      expect(tab.sockets).toHaveLength(2);
      expect(latest(tab).url).toContain("TOKEN-OF-X-AFTER-UNLOCK");
      expect(keyFramesOn(latest(tab))).toEqual([
        { action: "set", ...KEY_OF_X },
      ]);
    }
  });

  it("a different account after a same-account unlock still ends the session", () => {
    const shared = createSharedStore(X, "TOKEN-OF-X");
    const b = openTab(shared);

    shared.write(createSession(X, "TOKEN-OF-X-AFTER-UNLOCK"));
    switchAccount(shared, Y, "TOKEN-OF-Y");
    dropAndWait(b);

    expect(b.sockets).toHaveLength(1);
    expect(b.ended.count).toBe(1);
  });

  it("a reconnect still pending keeps checking: the session may move on between attempts", () => {
    const shared = createSharedStore(X, "TOKEN-OF-X");
    const b = openTab(shared);

    dropAndWait(b);
    expect(b.sockets).toHaveLength(2);
    switchAccount(shared, Y, "TOKEN-OF-Y");
    dropAndWait(b);

    expect(b.sockets).toHaveLength(2);
    expect(b.ended.count).toBe(1);
  });

  it("coming back from an idle close checks too", () => {
    const shared = createSharedStore(X, "TOKEN-OF-X");
    const b = openTab(shared);

    b.ws.closeForIdle();
    switchAccount(shared, Y, "TOKEN-OF-Y");
    b.ws.reopen();

    expect(b.sockets).toHaveLength(1);
    expect(b.ended.count).toBe(1);
  });

  it("coming back from an idle close on the same account reopens", () => {
    const shared = createSharedStore(X, "TOKEN-OF-X");
    const b = openTab(shared);

    b.ws.closeForIdle();
    shared.write(createSession(X, "TOKEN-OF-X-AFTER-UNLOCK"));
    b.ws.reopen();

    expect(b.sockets).toHaveLength(2);
    expect(latest(b).url).toContain("TOKEN-OF-X-AFTER-UNLOCK");
    expect(b.ended.count).toBe(0);
  });

  it("a hot swap in this tab after another tab switched account sends no key on the old socket", () => {
    const shared = createSharedStore(X, "TOKEN-OF-X");
    const b = openTab(shared);
    const oldSocket = latest(b);

    switchAccount(shared, Y, "TOKEN-OF-Y");
    // The next composition resumes as Y from the shared store. Its key fold
    // runs ahead of its transport gate, so Y's remembered key is handed over
    // first, then the gate connects over the socket the last composition left.
    b.jarvis.setOwnKey(KEY_OF_Y);
    b.ws.connect();

    expect(keyFramesOn(oldSocket)).toEqual([]);
    expect(oldSocket.close).toHaveBeenCalled();
    expect(b.ended.count).toBe(1);
    expect(b.sockets).toHaveLength(1);
  });

  it("a connect() during a pending reconnect ends the session once, and the reconnect never fires", () => {
    const shared = createSharedStore(X, "TOKEN-OF-X");
    const b = openTab(shared);
    const socket = latest(b);
    socket.readyState = 3;
    socket.onclose?.({ code: 1006 } as CloseEvent);

    switchAccount(shared, Y, "TOKEN-OF-Y");
    b.ws.connect();
    vi.advanceTimersByTime(RECONNECT_DELAY_MS * 3);

    expect(b.ended.count).toBe(1);
    expect(b.sockets).toHaveLength(1);
  });

  it("connect() over a live socket of the same account keeps it", () => {
    const shared = createSharedStore(X, "TOKEN-OF-X");
    const b = openTab(shared);

    shared.write(createSession(X, "TOKEN-OF-X-AFTER-UNLOCK"));
    b.ws.connect();
    b.jarvis.setOwnKey(KEY_OF_X);

    expect(latest(b).close).not.toHaveBeenCalled();
    expect(b.ended.count).toBe(0);
    expect(keyFramesOn(latest(b))).toEqual([{ action: "set", ...KEY_OF_X }]);
  });

  it("a deliberate connect() after sign-in opens with the new session, and a plain drop then reconnects", () => {
    const shared = createSharedStore(X, "TOKEN-OF-X");
    const b = openTab(shared);

    switchAccount(shared, Y, "TOKEN-OF-Y");
    dropAndWait(b);
    expect(b.ended.count).toBe(1);

    b.ws.connect();
    openLatest(b);
    expect(latest(b).url).toContain("TOKEN-OF-Y");
    dropAndWait(b);

    expect(b.sockets).toHaveLength(3);
    expect(latest(b).url).toContain("TOKEN-OF-Y");
    expect(b.ended.count).toBe(1);
  });

  it("without sessionAccount a different token ends the session: the safe side", () => {
    let token: string | undefined = "TOKEN-OF-X";
    const ws = new WsAdapter(
      "ws://no-account",
      () => {
        return token;
      },
      { autoConnect: false, reconnectDelayMs: RECONNECT_DELAY_MS },
    );
    const tab = track(ws, "ws://no-account");
    ws.connect();
    openLatest(tab);

    token = "TOKEN-OF-SOMEONE";
    dropAndWait(tab);

    expect(tab.sockets).toHaveLength(1);
    expect(tab.ended.count).toBe(1);
  });

  it("a socket that never had a session keeps reconnecting, and takes a token that appears", () => {
    let session: StoredSession | null = null;
    const ws = new WsAdapter(
      "ws://tokenless",
      () => {
        return session?.token;
      },
      {
        reconnectDelayMs: RECONNECT_DELAY_MS,
        sessionAccount: (): string | undefined => {
          return session?.user.email;
        },
      },
    );
    const tab = track(ws, "ws://tokenless");

    openLatest(tab);
    dropAndWait(tab);
    expect(tab.sockets).toHaveLength(2);

    session = createSession(X, "LATE-TOKEN");
    dropAndWait(tab);

    expect(tab.sockets).toHaveLength(3);
    expect(latest(tab).url).toContain("LATE-TOKEN");
    expect(tab.ended.count).toBe(0);
  });
});

function createSharedStore(
  entry: RosterEntry,
  token: string,
): InMemorySessionStore {
  const shared = new InMemorySessionStore();
  shared.write(createSession(entry, token));
  return shared;
}

/** Another tab signs out and signs in as someone else. */
function switchAccount(
  shared: InMemorySessionStore,
  entry: RosterEntry,
  token: string,
): void {
  shared.clear();
  shared.write(createSession(entry, token));
}

let nextTab = 0;

function openTab(shared: InMemorySessionStore): Tab {
  nextTab += 1;
  const url = `ws://tab-${nextTab}`;
  const ws = new WsAdapter(
    url,
    () => {
      return shared.read()?.token;
    },
    {
      autoConnect: false,
      reconnectDelayMs: RECONNECT_DELAY_MS,
      sessionAccount: (): string | undefined => {
        return shared.read()?.user.email;
      },
    },
  );
  const tab = track(ws, url);
  tab.jarvis.availability$().subscribe();
  ws.connect();
  openLatest(tab);
  return tab;
}

/** Records the sockets this tab's adapter opened (its own URL tells them
 * apart from another tab's), and its session ends. */
function track(ws: WsAdapter, url: string): Tab {
  const ended = { count: 0 };
  ws.sessionEnded().subscribe(() => {
    ended.count += 1;
  });
  const tab: Tab = {
    ws,
    jarvis: new WsJarvisAdapter(ws),
    ended,
    get sockets(): MockWebSocket[] {
      return constructedSockets.filter((socket) => {
        return socket.url.startsWith(url);
      });
    },
  };
  opened.push(tab);
  return tab;
}

function latest(tab: Tab): MockWebSocket {
  const socket = tab.sockets.at(-1);

  if (socket === undefined) {
    throw new Error("this tab has opened no socket");
  }

  return socket;
}

function openLatest(tab: Tab): void {
  const socket = latest(tab);
  socket.readyState = MockWebSocket.OPEN;
  socket.onopen?.(new Event("open"));
}

/** The 1006 every failure reads as in a browser, a 401 upgrade included. */
function dropAndWait(tab: Tab): void {
  const socket = latest(tab);
  socket.readyState = 3;
  socket.onclose?.({ code: 1006 } as CloseEvent);
  vi.advanceTimersByTime(RECONNECT_DELAY_MS);
}

function keyFramesOn(socket: MockWebSocket): unknown[] {
  return socket.send.mock.calls
    .map(([raw]) => {
      return JSON.parse(String(raw)) as SentFrame;
    })
    .filter((frame) => {
      return frame.type === CLIENT_MSG.JARVIS_KEY;
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

const KEY_OF_X = {
  provider: "anthropic",
  key: "sk-ant-api03-key-of-x-0001",
  capUsd: 1,
} as const;

const KEY_OF_Y = {
  provider: "anthropic",
  key: "sk-ant-api03-key-of-y-0002",
  capUsd: 1,
} as const;

const X: RosterEntry = ROSTER[0];

const Y: RosterEntry = ROSTER[1];

/** One browser tab: its own adapter and Jarvis port over the session store
 * every tab shares (localStorage), wired as both clients wire it. */
interface Tab {
  readonly ws: WsAdapter;
  readonly jarvis: WsJarvisAdapter;
  readonly sockets: MockWebSocket[];
  readonly ended: { count: number };
}

interface SentFrame {
  readonly type: string;
  readonly payload?: unknown;
}

const opened: Tab[] = [];
