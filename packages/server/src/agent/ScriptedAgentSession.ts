import { type Observable, Subject } from "rxjs";
import { takeUntil, tap } from "rxjs/operators";

import type {
  JarvisEvent,
  JarvisHistoryEntry,
  ScriptedJarvisEngine,
} from "@rtc/shared";

import type { AgentSession, JarvisTurnOptions } from "./agentLoop.js";

/**
 * Thin per-connection session over the ONE shared `ScriptedJarvisEngine`:
 * scripted turns are stateless, so `history` is accepted (to satisfy
 * `AgentSession`) but ignored — the engine never reads it.
 *
 * `resolveConfirmation` only forwards to the shared engine for a
 * `confirmationId` this session actually saw emitted from ITS OWN
 * `runTurn()` stream (tracked in `ownedConfirmationIds`) — otherwise it is a
 * silent no-op. This is the P2 cross-socket-forgery guard: the underlying
 * engine's `pendingConfirmations` map is one process-wide table, so without
 * this per-session ownership check, a confirmation id observed by one
 * connection (e.g. leaked, or guessed despite being a UUID) could be
 * resolved through a DIFFERENT connection's session.
 *
 * `cancelTurn` fires the session's own `cancel$` notifier, which `takeUntil`
 * uses to tear down whichever `engine.ask()` subscription is currently in
 * flight; the engine's own teardown path (see `ScriptedJarvisEngine.ask`)
 * completes any pending confirmation `Subject` for that turn, so a stale
 * `resolveConfirmation` after cancel is already a no-op at the engine layer
 * too. Idempotent: `cancel$.next()` on an already-cancelled or never-started
 * session is a harmless no-op.
 */
export class ScriptedAgentSession implements AgentSession {
  private readonly cancel$ = new Subject<void>();

  private readonly ownedConfirmationIds = new Set<string>();

  constructor(private readonly engine: ScriptedJarvisEngine) {}

  runTurn(
    text: string,
    _history: readonly JarvisHistoryEntry[],
    // Signature-only: satisfies `AgentSession`, but the scripted engine has
    // no notion of model or effort, so this is always ignored.
    _options?: JarvisTurnOptions,
  ): Observable<JarvisEvent> {
    return this.engine.ask(text).pipe(
      tap((event: JarvisEvent): void => {
        if (event.type === "confirmRequest") {
          this.ownedConfirmationIds.add(event.confirmationId);
        }
      }),
      takeUntil(this.cancel$),
    );
  }

  resolveConfirmation(confirmationId: string, approved: boolean): void {
    if (!this.ownedConfirmationIds.has(confirmationId)) {
      return;
    }

    this.ownedConfirmationIds.delete(confirmationId);
    this.engine.confirm(confirmationId, approved);
  }

  cancelTurn(): void {
    this.cancel$.next();
  }

  dispose(): void {
    this.cancelTurn();
    this.cancel$.complete();
  }
}
