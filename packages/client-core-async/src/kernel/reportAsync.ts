/** Rethrow an error on a macrotask, outside every caller's stack — rxjs's
 * `reportUnhandledError` shape. Used where an error must surface (a
 * subscriber callback threw) without taking the caller down with it. */
export function reportAsync(error: unknown): void {
  setTimeout(() => {
    throw error;
  }, 0);
}
