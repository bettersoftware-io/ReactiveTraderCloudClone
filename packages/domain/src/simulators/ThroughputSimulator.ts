import { type Observable, of } from "rxjs";

import type { OpsPort } from "../ports/opsPort.js";

const DEFAULT_THROUGHPUT = 100;
const MIN_THROUGHPUT = 0;
const MAX_THROUGHPUT = 1000;

/**
 * In-memory OpsPort. Mirrors the server's ThroughputService validation:
 * rejects non-finite values and values outside [0, 1000] by throwing.
 */
export class ThroughputSimulator implements OpsPort {
  private value = DEFAULT_THROUGHPUT;

  getThroughput(): Observable<number> {
    return of(this.value);
  }

  setThroughput(value: number): Observable<void> {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("Throughput must be a finite number");
    }

    if (value < MIN_THROUGHPUT || value > MAX_THROUGHPUT) {
      throw new Error(
        `Throughput must be between ${MIN_THROUGHPUT} and ${MAX_THROUGHPUT}`,
      );
    }

    this.value = value;
    return of(undefined);
  }
}
