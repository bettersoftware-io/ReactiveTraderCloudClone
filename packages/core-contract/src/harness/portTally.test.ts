import { concat, NEVER, type Observable, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  countInto,
  countSubscriptions,
  createTally,
} from "#/harness/portTally";

describe("countInto", () => {
  it("counts a subscription as live from subscribe until unsubscribe, and relays the values", () => {
    const tally = createTally();
    const source = new Subject<number>();
    const seen: number[] = [];
    const first = countInto(source, tally).subscribe((value) => {
      seen.push(value);
    });
    const second = countInto(source, tally).subscribe();
    expect(tally.live).toBe(2);
    source.next(7);
    expect(seen).toEqual([7]);
    first.unsubscribe();
    expect(tally.live).toBe(1);
    second.unsubscribe();
    expect(tally.live).toBe(0);
  });

  it("a completing source reads 0 — which is why a witness reshapes it to never complete", () => {
    const tally = createTally();
    countInto(of(1), tally).subscribe();
    expect(tally.live).toBe(0);
    countInto(concat(of(1), NEVER), tally).subscribe();
    expect(tally.live).toBe(1);
  });
});

describe("countSubscriptions", () => {
  it("counts the named method's streams into the tally chosen per call, reshaped, and still delivers the port's OWN stream", () => {
    const port = new PrototypePort();
    const eurusd = createTally();
    const other = createTally();
    const counted = countSubscriptions(
      port,
      "price",
      (symbol: unknown) => {
        return symbol === "EURUSD" ? eurusd : other;
      },
      (source: Observable<unknown>) => {
        return concat(source, NEVER);
      },
    );

    // The port's own emission, produced with the port's own `this`: a proxy
    // that manufactured a stream, or applied the method unbound, fails here.
    const seen: string[] = [];
    const sub = counted.price("EURUSD").subscribe((value) => {
      seen.push(value);
    });
    expect(seen).toEqual(["a field:EURUSD"]);
    counted.price("GBPUSD").subscribe();
    expect(eurusd.live).toBe(1);
    expect(other.live).toBe(1);
    sub.unsubscribe();
    expect(eurusd.live).toBe(0);
  });

  it("without a reshape the stream is counted as-is — a completing one reads 0, a live one 1", () => {
    const tally = createTally();
    const counted = countSubscriptions(new PrototypePort(), "price", () => {
      return tally;
    });

    counted.price("EURUSD").subscribe();
    expect(tally.live).toBe(0);
    const live = countSubscriptions(new PrototypePort(), "forever", () => {
      return tally;
    });
    live.forever().subscribe();
    expect(tally.live).toBe(1);
  });

  it("every other member passes through uncounted and bound to the real port — prototype methods included", () => {
    const tally = createTally();
    const counted = countSubscriptions(new PrototypePort(), "price", () => {
      return tally;
    });

    // A stream from a method that is NOT the named one is not tallied — a
    // proxy counting every function member would read 1 here.
    counted.forever().subscribe();
    expect(tally.live).toBe(0);

    // Detached, so `this` is whatever the pass-through bound: the real port,
    // or nothing at all.
    const { name } = counted;
    expect(name()).toBe("proto");
    expect(counted.label).toBe("a field");
  });
});

/** Methods on the prototype, as the domain simulators keep them — a spread
 * copy would lose every one of them. */
class PrototypePort {
  readonly label = "a field";

  /** Reads `this`, so the emission proves the method ran against the port. */
  price(symbol: string): Observable<string> {
    return of(`${this.label}:${symbol}`);
  }

  forever(): Observable<never> {
    return NEVER;
  }

  /** Reads `this` (optionally — class bodies are strict, so an unbound call
   * would otherwise throw rather than reach the "unbound" branch). */
  name(): string {
    return this?.label === "a field" ? "proto" : "unbound";
  }
}
