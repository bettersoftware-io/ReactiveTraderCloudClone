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
    if (pending) {
      writeLayoutNow();
    }
  });

  return subscription;
}
