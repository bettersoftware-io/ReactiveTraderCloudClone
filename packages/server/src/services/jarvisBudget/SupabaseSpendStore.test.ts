import { describe, expect, it } from "vitest";

import type { SpendStore } from "./SpendStore.js";
import { createSupabaseSpendStore } from "./SupabaseSpendStore.js";

describe("createSupabaseSpendStore.record", () => {
  it("calls the record function and maps the one-row table result", async () => {
    const { store, requests } = createStore(
      answers(200, [{ owner_usd: 0.12, house_usd: 0.3 }]),
    );

    expect(await store.record("account:a", DAY, "house", 0.07)).toEqual({
      ownerUsd: 0.12,
      houseUsd: 0.3,
    });
    expect(requests).toEqual([
      {
        url: "https://p.supabase.co/rest/v1/rpc/record_jarvis_spend",
        method: "POST",
        body: JSON.stringify({
          p_owner: "account:a",
          p_day: DAY,
          p_key_kind: "house",
          p_usd: 0.07,
        }),
      },
    ]);
  });

  it("accepts numerics that arrive as strings", async () => {
    const { store } = createStore(
      answers(200, [{ owner_usd: "0.120000", house_usd: "0" }]),
    );

    expect(await store.record("account:a", DAY, "own", 0.12)).toEqual({
      ownerUsd: 0.12,
      houseUsd: 0,
    });
  });

  it.each<[string, Reply]>([
    ["a 5xx", answers(503, {})],
    ["a 401", answers(401, {})],
    ["a network error", failsToConnect],
    ["an empty result", answers(200, [])],
    ["a non-array body", answers(200, { a: 1 })],
    ["a non-numeric total", answers(200, [{ owner_usd: "x", house_usd: 0 }])],
    [
      "a non-finite total",
      answers(200, [{ owner_usd: "Infinity", house_usd: 0 }]),
    ],
    ["a missing total", answers(200, [{ owner_usd: 1 }])],
    ["a refusal", answers(400, { code: "22P02", message: "bad" })],
  ])("is unavailable on %s", async (_name, reply) => {
    const { store } = createStore(reply);

    expect(await store.record("account:a", DAY, "house", 0.01)).toBe(
      "unavailable",
    );
  });
});

describe("createSupabaseSpendStore.read", () => {
  it("queries the day's owner and house rows and sums per owner", async () => {
    const { store, requests } = createStore(
      answers(200, [
        { owner: "account:abc", spend_usd: "0.05" },
        { owner: "house", spend_usd: 0.4 },
      ]),
    );

    expect(await store.read("account:abc", DAY, "house")).toEqual({
      ownerUsd: 0.05,
      houseUsd: 0.4,
    });
    expect(requests).toEqual([
      {
        url:
          "https://p.supabase.co/rest/v1/jarvis_spend_daily" +
          "?select=owner,spend_usd&day=eq.2026-10-25&key_kind=eq.house" +
          "&owner=in.(%22account%3Aabc%22,%22house%22)",
        method: "GET",
        body: undefined,
      },
    ]);
  });

  it("reads absent rows as zero", async () => {
    const { store } = createStore(answers(200, []));

    expect(await store.read("roster:u", DAY, "own")).toEqual({
      ownerUsd: 0,
      houseUsd: 0,
    });
  });

  it("percent-encodes an owner that carries reserved characters", async () => {
    const { store, requests } = createStore(answers(200, []));

    await store.read("roster:a&b", DAY, "house");

    expect(requests[0]?.url).toContain(
      "owner=in.(%22roster%3Aa%26b%22,%22house%22)",
    );
  });

  it.each<[string, Reply]>([
    ["a 5xx", answers(500, {})],
    ["a 401", answers(401, {})],
    ["a network error", failsToConnect],
    ["a non-array body", answers(200, "nope")],
    [
      "a non-numeric amount",
      answers(200, [{ owner: "account:a", spend_usd: "lots" }]),
    ],
  ])("is unavailable on %s", async (_name, reply) => {
    const { store } = createStore(reply);

    expect(await store.read("account:a", DAY, "house")).toBe("unavailable");
  });
});

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly body: string | undefined;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Reply = () => Promise<Response>;

interface StoreFixture {
  readonly store: SpendStore;
  readonly requests: RecordedRequest[];
}

function answers(status: number, body: unknown): Reply {
  return () => {
    return Promise.resolve(jsonResponse(status, body));
  };
}

function failsToConnect(): Promise<Response> {
  return Promise.reject(new Error("down"));
}

function createStore(reply: Reply): StoreFixture {
  const requests: RecordedRequest[] = [];
  const fetchImpl = ((url: string, init: RequestInit): Promise<Response> => {
    requests.push({
      url,
      method: init.method ?? "GET",
      body: typeof init.body === "string" ? init.body : undefined,
    });

    return reply();
  }) as typeof fetch;

  const store = createSupabaseSpendStore({
    url: "https://p.supabase.co/",
    secretKey: "sb_secret_test",
    timeoutMs: 1000,
    fetchImpl,
  });

  return { store, requests };
}

const DAY = "2026-10-25";
