/** The RxJS core's debounce around `writeWorkspaceLayout` — see
 * `workspaceLayoutWrite.ts` for the payload rules. */

import type { Observable, SchedulerLike, Subscription } from "rxjs";
import { debounceTime, tap } from "rxjs/operators";

import {
  type WorkspaceLayoutWriteDeps,
  writeWorkspaceLayout,
} from "@rtc/core-logic";
import { WORKSPACE_PERSIST_DEBOUNCE_MS } from "@rtc/domain";

export interface WorkspacePersistenceWriterDeps
  extends WorkspaceLayoutWriteDeps {
  /** Fires once per change worth persisting; the writer debounces it. */
  readonly kick$: Observable<void>;
  /** Defaults to `WORKSPACE_PERSIST_DEBOUNCE_MS` (`@rtc/domain`). */
  readonly debounceMs?: number;
  /** Injected for the debounce's time, so tests run it in virtual time. */
  readonly scheduler?: SchedulerLike;
}

/**
 * Subscribes the debounced writer to `kick$`. Session-lifetime, like every
 * other composition-root subscription: composition holds the returned
 * `Subscription` and releases it in `app.dispose()`.
 *
 * Releasing it writes a change still inside the debounce window — a bare
 * `debounceTime` drops its pending value on unsubscribe, which loses the
 * last rearrangement when the core is disposed (a hot swap) less than
 * `debounceMs` after it. `app.dispose()` releases this before it tears the
 * layout machines down, so that write still reads live state. No pending
 * change, no write.
 */
export function createWorkspacePersistenceWriter(
  deps: WorkspacePersistenceWriterDeps,
): Subscription {
  let pending = false;

  function writeLayoutNow(): void {
    pending = false;
    writeWorkspaceLayout(deps);
  }

  const subscription = deps.kick$
    .pipe(
      tap(() => {
        pending = true;
      }),
      debounceTime(
        deps.debounceMs ?? WORKSPACE_PERSIST_DEBOUNCE_MS,
        deps.scheduler,
      ),
    )
    .subscribe(writeLayoutNow);

  subscription.add(() => {
    if (!pending) {
      return;
    }

    // A write that throws here (full or blocked storage) would surface as
    // an `UnsubscriptionError` from `held.unsubscribe()` and skip the rest
    // of `app.dispose()` — every machine and port hold after it. It is
    // reported the way RxJS reports an error a subscriber callback throws
    // (the debounced write's channel): rethrown on a later macrotask.
    try {
      writeLayoutNow();
    } catch (error: unknown) {
      reportOnMacrotask(error);
    }
  });

  return subscription;
}

/** Rethrow `error` outside every call stack, where the host's uncaught-error
 * handling sees it — RxJS's own `reportUnhandledError`, which it does not
 * export. */
function reportOnMacrotask(error: unknown): void {
  setTimeout(() => {
    throw error;
  }, 0);
}
