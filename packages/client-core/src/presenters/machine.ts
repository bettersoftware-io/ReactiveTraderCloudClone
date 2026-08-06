import type { StateObservable } from "@rx-state/core";

import type { CurrencyPair } from "@rtc/domain";

import type { WorkspaceTab } from "#/layout/defaultLayoutPort";
import type { LayoutState } from "#/layout/layoutPort";

import type {
  BootSequenceIntents,
  BootSequenceState,
} from "./BootSequenceMachine";
import type { LayoutIntents } from "./LayoutMachine";
import type { NotionalIntents, NotionalView } from "./NotionalMachine";
import type {
  OrderTicketIntents,
  OrderTicketState,
} from "./OrderTicketMachine";
import type {
  RfqSubmissionIntents,
  RfqSubmissionState,
  TicketSubmissionIntents,
  TicketSubmissionState,
} from "./RfqsPresenter";
import type { RfqState, RfqTileIntents } from "./RfqTileMachine";
import type {
  TileExecutionIntents,
  TileExecutionState,
} from "./TileExecutionMachine";

/** Every app-layer machine factory returns this: a framework-agnostic
 * StateObservable carrying current state, plain intent methods, and dispose()
 * that completes the machine's Subjects / tears down subscriptions.
 * Bridge-only consumer.
 *
 * `StateObservable` comes from @rx-state/core (rxjs-only), the framework-
 * agnostic package — never from the React-binding layer — so the app layer
 * stays free of any React dependency.
 *
 * Pre-condition: `state$` MUST have a live subscriber (refCount > 0) before
 * `useMachine` first renders, OR carry a synchronous default value via
 * `state(obs, default)`. Factory implementations are responsible for keeping it
 * warm (e.g. an internal `state$.subscribe()` torn down in `dispose()`). A cold
 * `state$` with no default will suspend. */
export interface Machine<TState, TIntents extends object> {
  state$: StateObservable<TState>;
  intents: TIntents;
  dispose: () => void;
}

/** A machine with no intents — a purely derived, read-only state stream. The
 * seam hook returns just its `.state`. Names the intent-free contract once so
 * future read-only machines don't re-derive the `Record<string, never>` idiom. */
export type ReadOnlyMachine<TState> = Machine<TState, Record<string, never>>;

/** App-layer machine factories injected into the ViewModel seam. Each builds a
 * fresh machine instance per component mount (useMachine owns its lifecycle)
 * — EXCEPT `layout` (see its own doc below), which resolves to a
 * composition-root singleton per tab and must be consumed WITHOUT
 * `useMachine`'s dispose-on-unmount. */
export interface MachineFactories {
  tileExecution: (
    pair: CurrencyPair,
  ) => Machine<TileExecutionState, TileExecutionIntents>;
  rfqTile: (pair: CurrencyPair) => Machine<RfqState, RfqTileIntents>;
  /** Stale flag for a tile's price stream (intent-free derived boolean). */
  staleFlag: (pair: CurrencyPair) => ReadOnlyMachine<boolean>;
  /** Stale flag for the analytics position stream (intent-free). */
  analyticsStaleFlag: () => ReadOnlyMachine<boolean>;
  /** Transient new-row highlight for a blotter row (intent-free derived boolean,
   * `isNew` captured at mount). */
  rowHighlight: (isNew: boolean) => ReadOnlyMachine<boolean>;
  /** Notional input state machine for a single tile. */
  notional: (defaultNotional: number) => Machine<NotionalView, NotionalIntents>;
  /** NewRfqForm create→confirm→redirect submission machine. */
  rfqSubmission: () => Machine<RfqSubmissionState, RfqSubmissionIntents>;
  /** TradeTicket submit-price / pass submission machine. */
  ticketSubmission: () => Machine<
    TicketSubmissionState,
    TicketSubmissionIntents
  >;
  /** Layout view-model for a workspace tab — the in-house engine's tree
   * state. UNLIKE every other factory here, this resolves to
   * `Presenters.layoutFor(tab)`, a composition-root SINGLETON (one instance
   * per tab, shared for the app's whole session — see its doc) rather than
   * a fresh instance per call. Consume via `useStateObservable` directly
   * (mirroring `useEqWorkspace`/`useWorkspaceNav`), never via `useMachine`
   * — `useMachine`'s cleanup calls `.dispose()` on whatever instance it's
   * given, which would tear down the shared singleton on the first
   * unmount and silently break it for every other consumer (including
   * `JarvisDriverMachine`'s driven "layout" commands) afterward. */
  layout: (tab: WorkspaceTab) => Machine<LayoutState, LayoutIntents>;
  /** Boot-sequence animation machine — progress ramp + skip intent, fires
   * onDone when the ramp completes or skip is called. One per app mount. */
  boot: (onDone: () => void) => Machine<BootSequenceState, BootSequenceIntents>;
  /** Order ticket lifecycle machine — validate + submit an equity order. */
  orderTicket: (
    defaultSymbol: string,
  ) => Machine<OrderTicketState, OrderTicketIntents>;
}
