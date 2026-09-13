import { AbortError } from "#/kernel/AbortError";

/** Promise-shaped timer that honours an AbortSignal — the async core's only
 * clock primitive. Every `timer(...)`/`delay(...)` in the RxJS core becomes
 * an `await sleep(ms, signal)`. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new AbortError());
      return;
    }

    function abort(): void {
      clearTimeout(handle);
      reject(new AbortError());
    }

    const handle = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
