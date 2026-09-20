import { Observable, Subject } from "rxjs";

/** One request the core has SUBSCRIBED and the driver has not yet settled. */
interface PendingRequest<Req, Res> {
  readonly request: Req;
  readonly result: Subject<Res>;
}

/** A scripted one-shot port method: `open(request)` is what the port
 * returns; the request becomes pending when the core SUBSCRIBES it (a
 * `defer`, so "lazy until subscribed" stays the core's property, witnessed
 * here), leaves the queue when it is settled or unsubscribed, and settles
 * FIFO. `resolve` is next + complete — every one-shot port in the repo
 * emits once and completes. A settle with nothing pending is a no-op. */
export interface PendingQueue<Req, Res> {
  open(request: Req): Observable<Res>;
  pending(): readonly Req[];
  resolve(value: Res): void;
  fail(error: unknown): void;
  /** Complete every pending result — teardown. */
  drain(): void;
}

export function createPendingQueue<Req, Res>(): PendingQueue<Req, Res> {
  const queue: PendingRequest<Req, Res>[] = [];

  function settleOldest(settle: (result: Subject<Res>) => void): void {
    const oldest = queue.shift();

    if (oldest !== undefined) {
      settle(oldest.result);
    }
  }

  return {
    open: (request: Req) => {
      return new Observable<Res>((subscriber) => {
        const entry: PendingRequest<Req, Res> = {
          request,
          result: new Subject<Res>(),
        };
        queue.push(entry);
        const inner = entry.result.subscribe(subscriber);

        return () => {
          inner.unsubscribe();
          const index = queue.indexOf(entry);

          if (index >= 0) {
            queue.splice(index, 1);
          }
        };
      });
    },
    pending: () => {
      return queue.map((entry) => {
        return entry.request;
      });
    },
    resolve: (value: Res) => {
      settleOldest((result) => {
        result.next(value);
        result.complete();
      });
    },
    fail: (error: unknown) => {
      settleOldest((result) => {
        result.error(error);
      });
    },
    drain: () => {
      for (const entry of queue.splice(0)) {
        entry.result.complete();
      }
    },
  };
}
