import { of, throwError } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import { rpc } from "#/rpc";
import type { Inbound } from "#/types";

describe("rpc", () => {
  it("wraps a resolved observable value as an ack with the correlationId", async () => {
    const effect = rpc<unknown>("rpc.x", "rpc.x.response", () => {
      return of(7);
    });
    const in$ = of<Inbound>({ type: "rpc.x", payload: {}, correlationId: "1" });
    expect(await drain(effect(in$, undefined))).toEqual([
      {
        type: "rpc.x.response",
        payload: { type: "ack", payload: 7 },
        correlationId: "1",
      },
    ]);
  });

  it("wraps a plain synchronous value as an ack", async () => {
    const effect = rpc<unknown>("rpc.x", "rpc.x.response", () => {
      return 42;
    });
    const in$ = of<Inbound>({ type: "rpc.x", payload: {}, correlationId: "2" });
    expect(await drain(effect(in$, undefined))).toEqual([
      {
        type: "rpc.x.response",
        payload: { type: "ack", payload: 42 },
        correlationId: "2",
      },
    ]);
  });

  it("wraps a resolved Promise value as an ack", async () => {
    const effect = rpc<unknown>("rpc.x", "rpc.x.response", () => {
      return Promise.resolve(42);
    });
    const in$ = of<Inbound>({ type: "rpc.x", payload: {}, correlationId: "4" });
    expect(await drain(effect(in$, undefined))).toEqual([
      {
        type: "rpc.x.response",
        payload: { type: "ack", payload: 42 },
        correlationId: "4",
      },
    ]);
  });

  it("emits nack on a rejected Promise", async () => {
    const effect = rpc<unknown>("rpc.x", "rpc.x.response", () => {
      return Promise.reject(new Error("boom"));
    });
    const in$ = of<Inbound>({ type: "rpc.x", payload: {}, correlationId: "5" });
    expect(await drain(effect(in$, undefined))).toEqual([
      { type: "rpc.x.response", payload: { type: "nack" }, correlationId: "5" },
    ]);
  });

  it("emits nack on error", async () => {
    const effect = rpc<unknown>("rpc.x", "rpc.x.response", () => {
      return throwError(() => {
        return new Error("boom");
      });
    });
    const in$ = of<Inbound>({ type: "rpc.x", payload: {}, correlationId: "3" });
    expect(await drain(effect(in$, undefined))).toEqual([
      { type: "rpc.x.response", payload: { type: "nack" }, correlationId: "3" },
    ]);
  });
});

function drain(source: import("rxjs").Observable<unknown>): Promise<unknown[]> {
  return new Promise((resolve) => {
    source.pipe(toArray()).subscribe((v) => {
      resolve(v as unknown[]);
    });
  });
}
