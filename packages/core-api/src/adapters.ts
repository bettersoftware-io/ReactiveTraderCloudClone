import type {
  ConnectionEvent,
  JarvisBrain,
  JarvisEffort,
  SessionUser,
} from "@rtc/domain";
import type {
  AdminJarvisUsagePayload,
  JarvisAvailabilityGate,
  JarvisEvent,
} from "@rtc/shared";

import type { Stream } from "#/stream";

/**
 * App-layer port over the OS colour-scheme signal (`prefers-color-scheme`). Kept
 * an app port — not a domain one — because it reflects a platform/render-target
 * concern (the browser media query), the same reason the layout engine sits
 * behind an app-layer port. `ThemePreferencePresenter` combines this with the
 * stored mode preference to resolve "system" to a concrete `ThemeMode`.
 */
export interface ColorSchemeSource {
  /** Replay-current stream of whether the OS prefers a dark scheme; emits
   * synchronously on subscribe and again whenever the OS setting flips. */
  prefersDark$(): Stream<boolean>;
}

export interface StoredSession {
  readonly token: string;
  readonly user: SessionUser;
  readonly username: string;
  readonly exp: number;
}

export interface SessionStore {
  read(): StoredSession | null;
  write(session: StoredSession): void;
  clear(): void;
}

/** Per-tab persistence seam for the Dockview engine's serialized layout blob
 * (the JSON `DockviewApi.toJSON()`/`fromJSON()` shape — opaque to this
 * interface). Mirrors `SessionStore`'s shape: a plain load/save pair, no
 * streaming. `load` returns null when nothing is stored for that tab (or the
 * store itself has never seen a write); `createDockEngine` (Task 3) already
 * falls back to the seed tree on a null OR corrupt blob, so this seam never
 * needs to distinguish "empty" from "invalid". */
export interface DockLayoutStore {
  load(tab: string): string | null;
  save(tab: string, blob: string): void;
}

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
  ask(text: string, options?: JarvisAskOptions): Stream<JarvisEvent>;
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

/**
 * App-layer port for the rolling Jarvis usage/cost telemetry (Admin
 * surface): per-brain turn counts, token counts, and estimated spend, both
 * for the current rolling window and since server boot, PLUS the optional
 * budget-gate envelope (`budgetUsd`/`softBudgetUsd`/`spentWindowUsd`/
 * `gateLevel` — all absent on a pre-round server). WS-real mode
 * (`WsJarvisUsageAdapter`) streams `SERVER_MSG.ADMIN_JARVIS_USAGE` pushes;
 * simulator mode returns an always-empty snapshot (no gate fields — there is
 * no live Anthropic spend, and so no budget to report, offline).
 */
export interface JarvisUsagePort {
  usage$(): Stream<AdminJarvisUsagePayload>;
}

/**
 * Common surface for the real WsAdapter and the test-only FakeWsAdapter.
 * Both must agree on these method signatures so port factories work against either.
 */
export type MessageHandler = (payload: unknown) => void;

export interface IWsAdapter {
  on(type: string, handler: MessageHandler): () => void;
  send(type: string, payload?: unknown): void;
  rpc(type: string, payload?: unknown): Promise<unknown>;
  /**
   * Observable of gateway lifecycle events.
   * Backed by `ReplaySubject(1)` so late subscribers see the most recent state.
   */
  connectionEvents(): Stream<ConnectionEvent>;
  /** Close the current socket for an idle timeout without disposing the adapter.
   * Suppresses auto-reconnect; preserves sendQueue for reopen(). */
  closeForIdle(): void;
  /** Re-establish the socket after an idle close (user-initiated). */
  reopen(): void;
  /** Open the socket if it isn't already live (idempotent). Paired with
   * disconnect() to gate the transport behind authentication. */
  connect(): void;
  /** Close the socket deliberately (sign-out) and suppress auto-reconnect,
   * leaving the adapter reusable via connect(). */
  disconnect(): void;
  dispose(): void;
}

/** The subset of the transport the composition root drives from auth state.
 * Structural, so both `WsAdapter` and test fakes satisfy it. */
export interface AuthGatedTransport {
  connect(): void;
  disconnect(): void;
}
