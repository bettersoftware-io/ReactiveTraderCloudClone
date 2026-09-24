/** The RxJS core's debounce around `writeWorkspaceLayout` — see
 * `workspaceLayoutWrite.ts` for the payload rules. */

import type { Observable, SchedulerLike, Subscription } from "rxjs";
import { debounceTime } from "rxjs/operators";

import { WORKSPACE_PERSIST_DEBOUNCE_MS } from "@rtc/domain";

import {
  type WorkspaceLayoutWriteDeps,
  writeWorkspaceLayout,
} from "./workspaceLayoutWrite";

export {
  type DockedPanelPlacement,
  resetUnwritablePayloadWarning,
} from "./workspaceLayoutWrite";

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
 * other composition-root subscription: the returned `Subscription` is handed
 * back for a hypothetical future teardown path, and is not unsubscribed by
 * composition today (same doctrine as `jarvisPanels`/`jarvisDriver`).
 */
export function createWorkspacePersistenceWriter(
  deps: WorkspacePersistenceWriterDeps,
): Subscription {
  return deps.kick$
    .pipe(
      debounceTime(
        deps.debounceMs ?? WORKSPACE_PERSIST_DEBOUNCE_MS,
        deps.scheduler,
      ),
    )
    .subscribe(() => {
      writeWorkspaceLayout(deps);
    });
}
