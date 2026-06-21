function fail(msg: string): never {
  throw new Error(msg);
}

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (!Object.is(actual, expected)) {
    fail(
      msg ??
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

export function assertNotEqual<T>(actual: T, expected: T, msg?: string): void {
  if (Object.is(actual, expected)) {
    fail(msg ?? `expected value to differ from ${JSON.stringify(expected)}`);
  }
}

export function assertContains(
  actual: string,
  expected: string,
  msg?: string,
): void {
  if (!actual.includes(expected)) {
    fail(
      msg ??
        `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`,
    );
  }
}

export function assertGte(
  actual: number,
  expected: number,
  msg?: string,
): void {
  if (!(actual >= expected)) {
    fail(msg ?? `expected ${actual} to be >= ${expected}`);
  }
}

export function assertLte(
  actual: number,
  expected: number,
  msg?: string,
): void {
  if (!(actual <= expected)) {
    fail(msg ?? `expected ${actual} to be <= ${expected}`);
  }
}

export function assertTrue(actual: boolean, msg?: string): void {
  if (actual !== true) {
    fail(msg ?? `expected true, got ${actual}`);
  }
}

export function assertGreaterThanZero(actual: number, msg?: string): void {
  if (!(actual > 0)) {
    fail(msg ?? `expected ${actual} to be > 0`);
  }
}
