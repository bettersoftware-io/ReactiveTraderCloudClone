import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import { createKeyedPortStreams } from "#/presenters/keyedPortStreams";

describe("createKeyedPortStreams", () => {
  it("calls open(key) once per key, across two requests and two warm periods, and releases the port on the last unsubscribe", () => {
    const sources = new Map<string, Subject<number>>();
    const opens: string[] = [];
    const streamFor = createKeyedPortStreams<number>((key: string) => {
      opens.push(key);
      const source = new Subject<number>();
      sources.set(key, source);
      return source;
    });

    expect(streamFor("AAPL")).toBe(streamFor("AAPL"));
    expect(streamFor("AAPL")).not.toBe(streamFor("MSFT"));
    expect(opens).toEqual(["AAPL", "MSFT"]);

    const sub1 = streamFor("AAPL").subscribe(() => {});
    expect(sources.get("AAPL")?.observed).toBe(true);
    sub1.unsubscribe();
    expect(sources.get("AAPL")?.observed).toBe(false);

    // A second warm period re-subscribes the SAME cached stream — `open` is
    // not called again for a key already memoised.
    const sub2 = streamFor("AAPL").subscribe(() => {});
    expect(sources.get("AAPL")?.observed).toBe(true);
    sub2.unsubscribe();
    expect(opens).toEqual(["AAPL", "MSFT"]);
  });
});
