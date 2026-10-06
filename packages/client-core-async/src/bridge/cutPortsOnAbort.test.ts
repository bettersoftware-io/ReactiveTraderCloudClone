import { Observable, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { AppPorts } from "@rtc/core-api";

import { cutPortsOnAbort } from "./cutPortsOnAbort";

describe("cutPortsOnAbort", () => {
  it("passes a port stream through until the composition ends", () => {
    const { ports, source$, end } = createCutPorts();
    const seen: number[] = [];
    ports.feed.values().subscribe((value) => {
      seen.push(value);
    });

    source$.next(1);
    end();
    source$.next(2);

    expect(seen).toEqual([1]);
  });

  it("releases the port and stays silent: the holder is neither completed nor errored", () => {
    const { ports, source$, end } = createCutPorts();
    const notifications: string[] = [];
    ports.feed.values().subscribe({
      complete: () => {
        notifications.push("complete");
      },
      error: () => {
        notifications.push("error");
      },
    });
    expect(source$.observed).toBe(true);

    end();

    expect(source$.observed).toBe(false);
    expect(notifications).toEqual([]);
  });

  it("never opens a port for a stream first subscribed after the end", () => {
    const { ports, source$, end } = createCutPorts();
    const stream = ports.feed.values();
    end();

    stream.subscribe();
    ports.feed.values().subscribe();

    // Not even for an instant: a port that replays on subscribe would
    // deliver into a composition that no longer exists.
    expect(ports.feed.opened).toBe(0);
    expect(source$.observed).toBe(false);
  });

  it("still forwards the port's own completion and error", () => {
    const { ports, source$ } = createCutPorts();
    let completed = false;
    ports.feed.values().subscribe({
      complete: () => {
        completed = true;
      },
    });

    source$.complete();

    expect(completed).toBe(true);
  });

  it("releases the port when the holder unsubscribes first", () => {
    const { ports, source$, end } = createCutPorts();
    const subscription = ports.feed.values().subscribe();

    subscription.unsubscribe();
    expect(source$.observed).toBe(false);
    // Ending afterwards has nothing left to release, and must not throw.
    expect(end).not.toThrow();
  });

  it("releases the port when the composition ends from inside a value replayed on subscribe", () => {
    const { ports, source$, end } = createCutPorts();
    ports.feed.replayOnSubscribe = 7;

    ports.feed.values().subscribe(() => {
      end();
    });

    expect(source$.observed).toBe(false);
  });

  it("cuts a stream a port exposes as a property, not only one a method returns", () => {
    const { ports, source$, end } = createCutPorts();
    ports.feed.values$.subscribe();

    end();

    expect(source$.observed).toBe(false);
  });

  it("leaves everything that is not a stream untouched, and calls a method on the port itself", async () => {
    const { ports } = createCutPorts();

    expect(ports.feed.label).toBe("feed");
    expect(ports.feed.readLabel()).toBe("feed");
    await expect(ports.feed.ask()).resolves.toBe(42);
    expect(ports.flag).toBe(true);
    expect(ports.absent).toBeUndefined();
  });
});

/** A port in each shape `AppPorts` holds: a class instance whose methods
 * read `this`, a stream-returning method, a stream property, a promise. */
class FakeFeed {
  readonly label = "feed";

  readonly values$: Observable<number>;

  constructor(private readonly source$: Subject<number>) {
    this.values$ = source$.asObservable();
  }

  /** How many times the stream `values()` returns was subscribed. */
  opened = 0;

  /** When set, `values()` delivers it synchronously to each new subscriber,
   * after the subscription to the source is open. */
  replayOnSubscribe: number | null = null;

  values(): Observable<number> {
    return new Observable<number>((subscriber) => {
      this.opened += 1;
      const subscription = this.source$.subscribe(subscriber);

      if (this.replayOnSubscribe !== null) {
        subscriber.next(this.replayOnSubscribe);
      }

      return subscription;
    });
  }

  readLabel(): string {
    return this.label;
  }

  ask(): Promise<number> {
    return Promise.resolve(42);
  }
}

interface FakePorts {
  feed: FakeFeed;
  flag: boolean;
  absent: undefined;
}

interface CutPorts {
  ports: FakePorts;
  source$: Subject<number>;
  /** Ends the composition. */
  end: () => void;
}

function createCutPorts(): CutPorts {
  const source$ = new Subject<number>();
  const given: FakePorts = {
    feed: new FakeFeed(source$),
    flag: true,
    absent: undefined,
  };
  const lifetime = new AbortController();
  const ports = cutPortsOnAbort(
    given as unknown as AppPorts,
    lifetime.signal,
  ) as unknown as FakePorts;

  return {
    ports,
    source$,
    end: (): void => {
      lifetime.abort();
    },
  };
}
