import { inspect } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { JarvisKeyPayload } from "@rtc/shared";

import { ConnectionOwnKey } from "./ConnectionOwnKey.js";
import { OwnKeyCheckLimiter } from "./OwnKeyCheckLimiter.js";
import { OWN_KEY_ENDPOINTS } from "./ownKeyEndpoints.js";
import {
  fakeVerifyOwnKey,
  type OwnKeyVerdict,
  type VerifyOwnKey,
  verifyOwnKey,
} from "./verifyOwnKey.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("verifyOwnKey", () => {
  it("a 200 accepts; a 401 and a 403 refuse; a 500 and a network error are unreachable", async () => {
    const signal = new AbortController().signal;

    expect(await verifyOwnKey("anthropic", "k", signal, replying(200))).toBe(
      "accepted",
    );
    expect(await verifyOwnKey("anthropic", "k", signal, replying(401))).toBe(
      "refused",
    );
    expect(await verifyOwnKey("anthropic", "k", signal, replying(403))).toBe(
      "refused",
    );
    expect(await verifyOwnKey("anthropic", "k", signal, replying(500))).toBe(
      "unreachable",
    );
    expect(
      await verifyOwnKey(
        "anthropic",
        "k",
        signal,
        vi.fn(() => {
          return Promise.reject(new TypeError("fetch failed"));
        }),
      ),
    ).toBe("unreachable");
  });

  it("the URL comes from the provider id and redirects are refused", async () => {
    const fetchFn = replying(200);

    await verifyOwnKey(
      "openrouter",
      "k1",
      new AbortController().signal,
      fetchFn,
    );

    const [url, init] = vi.mocked(fetchFn).mock.calls[0] ?? [];

    expect(url).toBe(OWN_KEY_ENDPOINTS.openrouter.url);
    expect(url).toBe("https://openrouter.ai/api/v1/key");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer k1");

    await verifyOwnKey(
      "anthropic",
      "k2",
      new AbortController().signal,
      fetchFn,
    );
    const headers = new Headers(vi.mocked(fetchFn).mock.calls[1]?.[1]?.headers);

    expect(vi.mocked(fetchFn).mock.calls[1]?.[0]).toBe(
      "https://api.anthropic.com/v1/models",
    );
    expect(headers.get("x-api-key")).toBe("k2");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
  });

  it("logs neither the key, the URL nor an error message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await verifyOwnKey(
      "anthropic",
      SECRET,
      new AbortController().signal,
      vi.fn(() => {
        return Promise.reject(
          new TypeError(`boom ${SECRET} api.anthropic.com`),
        );
      }),
    );

    const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls]);

    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain("api.anthropic.com");
    expect(logged).not.toContain("boom");
  });
});

describe("fakeVerifyOwnKey", () => {
  it("under RTC_JARVIS_FAKE=1 no provider is called", async () => {
    const fetchStub = vi.fn();

    vi.stubGlobal("fetch", fetchStub);

    try {
      expect(await fakeVerifyOwnKey("anthropic", "fake-good-1")).toBe(
        "accepted",
      );
      expect(await fakeVerifyOwnKey("anthropic", "sk-real")).toBe("refused");
      expect(fetchStub).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("OwnKeyCheckLimiter", () => {
  it("allows 20 an hour per identity, then the window reopens", () => {
    let now = 1_000;
    const limiter = new OwnKeyCheckLimiter(() => {
      return now;
    });

    for (let i = 0; i < 20; i++) {
      expect(limiter.allow("ada")).toBe(true);
    }

    expect(limiter.allow("ada")).toBe(false);
    expect(limiter.allow("bob")).toBe(true);

    now += 60 * 60_000;

    expect(limiter.allow("ada")).toBe(true);
  });
});

describe("ConnectionOwnKey", () => {
  it("accepts after the provider says so, and use() hands out the key", async () => {
    const { verify, calls } = deferredVerify();
    const { own } = build(verify);

    own.apply(setOf(SECRET));

    expect(own.view()).toEqual({
      provider: "anthropic",
      status: "checking",
      capUsd: 5,
    });
    expect(
      own.use(() => {
        return "x";
      }),
    ).toBeNull();

    calls[0]?.resolve("accepted");
    await own.settled();

    expect(own.view()?.status).toBe("accepted");
    expect(
      own.use((provider, key) => {
        return `${provider}:${key}`;
      }),
    ).toBe(`anthropic:${SECRET}`);
  });

  it("the same key again updates the cap without a provider call", async () => {
    const { verify, calls } = deferredVerify();
    const { own } = build(verify);

    own.apply(setOf(SECRET, 5));
    calls[0]?.resolve("accepted");
    await own.settled();
    own.apply(setOf(SECRET, 9));

    expect(verify).toHaveBeenCalledTimes(1);
    expect(own.view()).toEqual({
      provider: "anthropic",
      status: "accepted",
      capUsd: 9,
    });
  });

  it("a newer key's answer wins over an older check landing late", async () => {
    const { verify, calls } = deferredVerify();
    const { own } = build(verify);

    own.apply(setOf("old-key"));
    own.apply(setOf("new-key"));

    expect(calls[0]?.signal.aborted).toBe(true);

    calls[1]?.resolve("accepted");
    calls[0]?.resolve("refused");
    await own.settled();

    expect(own.view()?.status).toBe("accepted");
    expect(
      own.use((_p, key) => {
        return key;
      }),
    ).toBe("new-key");
  });

  it("the 21st check in an hour makes no provider call and reads limited", async () => {
    const { verify, calls } = deferredVerify();
    const { own } = build(verify);

    for (let i = 0; i < 20; i++) {
      own.apply(setOf(`key-${String(i)}`));
    }

    expect(verify).toHaveBeenCalledTimes(20);

    own.apply(setOf("key-21"));
    calls.forEach((call) => {
      call.resolve("accepted");
    });
    await own.settled();

    expect(verify).toHaveBeenCalledTimes(20);
    expect(own.view()?.status).toBe("limited");
    expect(
      own.use(() => {
        return "x";
      }),
    ).toBeNull();
    expect(calls).toHaveLength(20);
  });

  it("a reconnecting caller does not get a fresh allowance", () => {
    const { verify } = deferredVerify();
    const limiter = new OwnKeyCheckLimiter(() => {
      return Date.now();
    });
    const first = new ConnectionOwnKey({ verify, limiter, identity: "ada" });

    for (let i = 0; i < 20; i++) {
      first.apply(setOf(`key-${String(i)}`));
    }

    first.dispose();

    const second = new ConnectionOwnKey({ verify, limiter, identity: "ada" });

    second.apply(setOf("another"));

    expect(verify).toHaveBeenCalledTimes(20);
    expect(second.view()?.status).toBe("limited");
  });

  it("dispose during a check keeps nothing: a late answer changes no state", async () => {
    const { verify, calls } = deferredVerify();
    const { own } = build(verify);
    const changes = vi.fn();

    own.apply(setOf(SECRET));
    own.changes$.subscribe(changes);
    own.dispose();

    expect(calls[0]?.signal.aborted).toBe(true);

    calls[0]?.resolve("accepted");
    await own.settled();

    expect(own.view()).toBeNull();
    expect(
      own.use(() => {
        return "x";
      }),
    ).toBeNull();
    expect(changes).not.toHaveBeenCalled();
  });

  it("clear drops the key and markRefused flips an accepted key", async () => {
    const { verify, calls } = deferredVerify();
    const { own } = build(verify);

    own.apply(setOf(SECRET));
    calls[0]?.resolve("accepted");
    await own.settled();
    own.markRefused();

    expect(own.view()?.status).toBe("refused");
    expect(
      own.use(() => {
        return "x";
      }),
    ).toBeNull();

    own.apply({ action: "clear" });

    expect(own.view()).toBeNull();
  });

  it("a verify that throws reads unreachable", async () => {
    const own = new ConnectionOwnKey({
      verify: () => {
        return Promise.reject(new Error("x"));
      },
      limiter: new OwnKeyCheckLimiter(() => {
        return Date.now();
      }),
      identity: "ada",
    });

    own.apply(setOf(SECRET));
    await own.settled();

    expect(own.view()?.status).toBe("unreachable");
  });

  it("no key text in JSON.stringify, String or util.inspect of the object", async () => {
    const { verify, calls } = deferredVerify();
    const { own } = build(verify);

    own.apply(setOf(SECRET));
    calls[0]?.resolve("accepted");
    await own.settled();

    for (const text of [
      JSON.stringify(own),
      String(own),
      inspect(own, { depth: 5, showHidden: true }),
      JSON.stringify(own.view()),
    ]) {
      expect(text).not.toContain(SECRET);
    }
  });

  it("settled resolves at once with no check in flight", async () => {
    vi.useFakeTimers();

    const { verify } = deferredVerify();
    const { own } = build(verify);

    await expect(own.settled()).resolves.toBeUndefined();
  });
});

const SECRET = "sk-ant-SECRET-key-text-0123456789";

function replying(status: number): typeof fetch {
  return vi.fn(() => {
    return Promise.resolve(new Response("{}", { status }));
  });
}

interface Deferred {
  verify: ReturnType<typeof vi.fn<VerifyOwnKey>>;
  calls: Pending[];
}

interface Built {
  own: ConnectionOwnKey;
  limiter: OwnKeyCheckLimiter;
}

interface Pending {
  readonly signal: AbortSignal;
  resolve(verdict: OwnKeyVerdict): void;
}

/** A verify function whose every call stays open until the test answers it. */
function deferredVerify(): Deferred {
  const calls: Pending[] = [];
  const verify = vi.fn<VerifyOwnKey>((_provider, _key, signal) => {
    return new Promise<OwnKeyVerdict>((resolve) => {
      calls.push({ signal, resolve });
      // A real fetch rejects when aborted; settled() must not hang on it.
      signal.addEventListener("abort", () => {
        resolve("unreachable");
      });
    });
  });

  return { verify, calls };
}

function setOf(key: string, capUsd: number | null = 5): JarvisKeyPayload {
  return {
    action: "set",
    provider: "anthropic",
    key,
    capUsd,
  } as const;
}

function build(verify: VerifyOwnKey): Built {
  const limiter = new OwnKeyCheckLimiter(() => {
    return Date.now();
  });
  const own = new ConnectionOwnKey({ verify, limiter, identity: "ada" });

  return { own, limiter };
}
