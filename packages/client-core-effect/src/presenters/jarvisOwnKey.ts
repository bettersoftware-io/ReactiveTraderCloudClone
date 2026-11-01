import { Cause, Effect, Scope } from "effect";

import type {
  AuthViewState,
  JarvisOwnKeyPresenter,
  JarvisPort,
  OwnKeyStore,
  SavedOwnKey,
  Stream,
} from "@rtc/core-api";
import { createOwnKeyFold } from "@rtc/core-logic";

import { type EffectHost, listenToStream, reportOutOfBand } from "#/bridge/out";
import { createSyncRef } from "#/bridge/syncRef";

/** `presenters.jarvisOwnKey` on the Effect core: a `SyncRef` over the shared
 * `createOwnKeyFold`, heard synchronously from the auth state and held until
 * `host`'s scope closes. The close stops the fold and wipes nothing, because
 * a hot swap resumes with the key in place. */
export function createJarvisOwnKeyPresenter(
  host: EffectHost,
  jarvis: Pick<JarvisPort, "setOwnKey">,
  keyStore: OwnKeyStore | undefined,
  authState$: Stream<AuthViewState>,
): JarvisOwnKeyPresenter {
  const saved = createSyncRef<SavedOwnKey | null>(null);
  const fold = createOwnKeyFold({
    jarvis,
    store: keyStore,
    publish: (next: SavedOwnKey | null): void => {
      saved.set(() => {
        return next;
      });
    },
  });

  const release = listenToStream(
    authState$,
    fold.readAuth,
    (error: unknown) => {
      reportOutOfBand(Cause.die(error));
    },
  );
  host.runtime.runSync(Scope.addFinalizer(host.scope, Effect.sync(release)));

  return {
    saved$: saved.stateStream(),
    save: fold.save,
    setCap: fold.setCap,
    remove: fold.remove,
  };
}
