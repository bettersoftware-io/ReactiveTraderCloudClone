const DEFAULT_THROUGHPUT = 100;
const MIN_THROUGHPUT = 0;
const MAX_THROUGHPUT = 1000;

export class ThroughputService {
  private value = DEFAULT_THROUGHPUT;

  getThroughput(): number {
    return this.value;
  }

  setThroughput(value: number): void {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("Throughput must be a finite number");
    }
    if (value < MIN_THROUGHPUT || value > MAX_THROUGHPUT) {
      throw new Error(
        `Throughput must be between ${MIN_THROUGHPUT} and ${MAX_THROUGHPUT}`,
      );
    }
    this.value = value;
  }
}
