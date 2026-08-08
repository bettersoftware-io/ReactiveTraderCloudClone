import type { Observable } from "rxjs";

import type { JarvisBrain, JarvisEffort } from "@rtc/domain";
import type { JarvisAvailabilityGate, JarvisEvent } from "@rtc/shared";

export type { JarvisEvent } from "@rtc/shared";

/** Brain + effort selection threaded onto one `ask()` turn — forwarded onto
 * the wire `JarvisChatPayload.brain`/`.effort` by `WsJarvisAdapter`;
 * `ScriptedJarvisAdapter` (the scripted brain has no notion of either)
 * ignores it. */
export interface JarvisAskOptions {
  readonly brain: JarvisBrain;
  readonly effort: JarvisEffort;
}

/**
 * Application-layer chat port (deliberately NOT in domain/ports — chat is an
 * app concern; @rtc/domain stays byte-identical in phase 1). The event union
 * mirrors what the phase-2 JARVIS_* wire messages will carry, so swapping in
 * a WsJarvisAdapter is invisible to JarvisMachine.
 */
export interface JarvisPort {
  /** Run one turn. Emits reply events; completes after "done" or "error".
   * `options`, when supplied, selects which brain/effort the turn runs
   * with. */
  ask(text: string, options?: JarvisAskOptions): Observable<JarvisEvent>;
  /** Resolve a pending confirmRequest (approve or decline). */
  confirm(confirmationId: string, approved: boolean): void;
}

/** Live availability of the Jarvis backend: whether a brain is reachable at
 * all, which brains are currently on offer, and which one the server would
 * pick absent a client preference. `brains: []` is a normal value (nothing
 * currently offered) — NOT a nullish/unset sentinel, so consumers must key
 * "is Jarvis usable" off `available` alone, never off `brains.length`. */
export interface JarvisAvailability {
  readonly available: boolean;
  readonly brains: readonly JarvisBrain[];
  readonly defaultBrain: JarvisBrain;
  /** The active usage-budget gate, or `null` when none is active (or the
   * wire's `gate` field was absent/malformed — see `parseGate` in
   * `WsJarvisAdapter`, which silently drops a malformed `gate` while the
   * rest of the frame still applies). Required rather than optional so tsc
   * flags every construction site across the codebase. */
  readonly gate: JarvisAvailabilityGate | null;
}
