import type {
  AuthViewState,
  JarvisOwnKeyPresenter,
  JarvisPort,
  OwnKeyStore,
  SavedOwnKey,
  Stream,
} from "@rtc/core-api";
import { createOwnKeyFold } from "@rtc/core-logic";

import { storeToStateStream } from "#/bridge/out";
import { reportAsync } from "#/kernel/reportAsync";
import { createStore } from "#/kernel/store";

/** `presenters.jarvisOwnKey` on the async core: a Store over the shared
 * `createOwnKeyFold`. Follows `auth` with a plain subscription, not a `relay`:
 * the reading must land in the turn it was made, ahead of the transport gate.
 * The abort stops the fold and wipes nothing, because a hot swap resumes with
 * the key in place. */
export function createJarvisOwnKeyPresenter(
  jarvis: Pick<JarvisPort, "setOwnKey">,
  keyStore: OwnKeyStore | undefined,
  authState$: Stream<AuthViewState>,
  lifetime: AbortSignal,
): JarvisOwnKeyPresenter {
  const saved = createStore<SavedOwnKey | null>(null);
  const fold = createOwnKeyFold({
    jarvis,
    store: keyStore,
    publish: (next: SavedOwnKey | null): void => {
      saved.set(next);
    },
  });

  const subscription = authState$.subscribe({
    next: fold.readAuth,
    error: reportAsync,
  });

  lifetime.addEventListener(
    "abort",
    () => {
      subscription.unsubscribe();
    },
    { once: true },
  );

  return {
    saved$: storeToStateStream(saved),
    save: fold.save,
    setCap: fold.setCap,
    remove: fold.remove,
  };
}
