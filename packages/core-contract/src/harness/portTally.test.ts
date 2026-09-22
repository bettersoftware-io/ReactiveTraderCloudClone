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
  it("counts the named method's streams into the tally chosen per call, reshaped, and leaves the port's other members — prototype methods included — working", () => {
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

    const sub = counted.price("EURUSD").subscribe();
    counted.price("GBPUSD").subscribe();
    expect(eurusd.live).toBe(1);
    expect(other.live).toBe(1);
    sub.unsubscribe();
    expect(eurusd.live).toBe(0);

    // Detached, so `this` is whatever the pass-through bound — nothing, unless
    // it bound the real port.
    const { name } = counted;
    expect(name()).toBe("proto");
    expect(counted.label).toBe("a field");
  });
});

/** Methods on the prototype, as the domain simulators keep them — a spread
 * copy would lose `price` and `name` both. */
class PrototypePort {
  readonly label = "a field";

  price(symbol: string): Observable<string> {
    return of(`${symbol}:1`);
  }

  /** Reads `this` — a pass-through that forgot to bind would return "unbound". */
  name(): string {
    return this.label === "a field" ? "proto" : "unbound";
  }
}
