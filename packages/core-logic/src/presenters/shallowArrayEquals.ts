/** Element-wise reference equality — what `rfqs$` and `quotesForRfq$` use
 * to suppress a re-emission after an event that left the roster unchanged
 * (`endOfStateOfTheWorld`, a quote event against `rfqs$`). Exported so both
 * alternative cores suppress the same emissions, not a look-alike. */
export function shallowArrayEquals<T>(
  a: readonly T[],
  b: readonly T[],
): boolean {
  if (a === b) {
    return true;
  }

  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

/** `project`, returning the PREVIOUS result whenever the new one is
 * shallow-equal to it — so a downstream that de-duplicates by reference
 * (the async core's derived topic, the Effect core's `Object.is` fold
 * guard) drops exactly what `distinctUntilChanged(shallowArrayEquals)`
 * drops. One memo per derived stream; it holds one array. */
export function createShallowArrayMemo<S, T>(
  project: (source: S) => readonly T[],
): (source: S) => readonly T[] {
  let previous: readonly T[] | null = null;

  return (source: S) => {
    const next = project(source);

    if (previous !== null && shallowArrayEquals(previous, next)) {
      return previous;
    }

    previous = next;
    return next;
  };
}
