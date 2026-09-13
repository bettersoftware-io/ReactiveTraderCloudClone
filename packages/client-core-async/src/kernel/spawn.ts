import { AbortError } from "#/kernel/AbortError";

/** Fire-and-forget an async loop. Abort is the normal way a loop ends and
 * is silent; any other rejection is routed to `onError` so it surfaces as
 * a stream error exactly the way an RxJS source error would. Returns the
 * settled promise so tests can await it. */
export function spawn(
  loop: () => Promise<void>,
  onError: (error: unknown) => void,
): Promise<void> {
  return loop().catch((error: unknown) => {
    if (error instanceof AbortError) {
      return;
    }

    onError(error);
  });
}
