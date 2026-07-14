import { BehaviorSubject, type Observable } from "rxjs";

/** Class whose method reads a private field — exercises `this` preservation
 * through the `instrumentPresenters` Proxy. Mirrors a real presenter that
 * caches per-key streams. */
export class FakePriceStream {
  private readonly cache = new Map<string, BehaviorSubject<number>>();

  price$(pair: string): Observable<number> {
    let s = this.cache.get(pair);

    if (!s) {
      s = new BehaviorSubject(1);
      this.cache.set(pair, s);
    }

    return s;
  }
}
