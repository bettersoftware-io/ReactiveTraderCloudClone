import type {
  EquityOrder,
  LogEvent,
  Price,
  PriceTick,
  Quote,
  ServiceTopology,
  SessionInfo,
} from "@rtc/domain";

import type { AnimationIntent } from "#/app/presenters/AnimationDirector";
import type { IncidentKind } from "#/app/presenters/IncidentMachine";
import type { ThroughputView } from "#/app/presenters/ThroughputPresenter";

import type { CommandLog, HookValues, MetricsView } from "./world";

/** Everything a page object needs: the rendered root + update drivers + command log. */
export interface PageContext<P> {
  readonly root: HTMLElement;
  setProps(next: Partial<P>): void;
  emit(patch: Partial<HookValues>): void;
  /** Push a new price for one currency symbol (parametric usePrice source). */
  setPrice(symbol: string, value: Price | null): void;
  /** Push a new price history for one symbol (parametric usePriceHistory source). */
  setHistory(symbol: string, value: readonly PriceTick[]): void;
  /** Push new quotes for one RFQ (parametric useQuotesForRfq source). */
  setQuotesForRfq(rfqId: number, value: readonly Quote[]): void;
  /** Push a new animation intent for one target (useAnimationIntents source). */
  setIntent(target: string, intent: AnimationIntent | null): void;
  /** Push a new throughput view (useThroughput source). */
  setThroughputView(patch: Partial<ThroughputView>): void;
  /** Advance the OrderTicket lifecycle by emitting one EquityOrder into place(). */
  pushOrderLifecycle(order: EquityOrder): void;
  /** Values captured from useThroughput().setValue calls. */
  readonly throughputSets: number[];
  readonly commands: CommandLog;
  // Admin / telemetry setters (Phase 5 — flush-wrapped so re-renders are immediate).
  /** Push a new service topology snapshot (useTopology source). */
  setTopology(value: ServiceTopology | null): void;
  /** Push a new event log (useEventLog source). */
  setEventLog(value: readonly LogEvent[]): void;
  /** Push new active sessions (useSessions source). */
  setSessions(value: readonly SessionInfo[]): void;
  /** Patch the metric series (useMetrics source). */
  setMetrics(patch: Partial<MetricsView>): void;
  /** Inject an incident kind (mirrors IncidentMachine asymmetry). */
  injectIncident(kind: IncidentKind): void;
  /** Clear all active incidents and restore CONNECTED status. */
  clearIncident(): void;
}

/** Base class for all page objects. Provides the neutral update drivers. */
export abstract class MountedComponent<P> {
  protected readonly root: HTMLElement;

  private readonly ctx: PageContext<P>;

  constructor(ctx: PageContext<P>) {
    this.root = ctx.root;
    this.ctx = ctx;
  }

  /** Push new props → re-render the same instance. */
  setProps(next: Partial<P>): void {
    this.ctx.setProps(next);
  }

  /** Push new hook data → re-render the same instance. */
  emit(patch: Partial<HookValues>): void {
    this.ctx.emit(patch);
  }

  /** Push a new price for one symbol → re-render the subscribing tile. */
  setPrice(symbol: string, value: Price | null): void {
    this.ctx.setPrice(symbol, value);
  }

  /** Push a new price history for one symbol → re-render the subscribing tile. */
  setHistory(symbol: string, value: readonly PriceTick[]): void {
    this.ctx.setHistory(symbol, value);
  }

  /** Push new quotes for one RFQ → re-render the subscribing card. */
  setQuotesForRfq(rfqId: number, value: readonly Quote[]): void {
    this.ctx.setQuotesForRfq(rfqId, value);
  }

  /** Push a new animation intent for one target → re-render the probe. */
  setIntent(target: string, intent: AnimationIntent | null): void {
    this.ctx.setIntent(target, intent);
  }

  /** Push a new throughput view → re-render the AdminPanel. */
  protected setThroughputView(patch: Partial<ThroughputView>): void {
    this.ctx.setThroughputView(patch);
  }

  /** Emit one EquityOrder into the OrderTicket's place() lifecycle. */
  protected pushOrderLifecycle(order: EquityOrder): void {
    this.ctx.pushOrderLifecycle(order);
  }

  /** Values recorded by the faked useThroughput().setValue (PUT equivalent). */
  protected throughputSets(): number[] {
    return this.ctx.throughputSets;
  }

  /** Inputs recorded by the faked command hooks (unit-mode convenience). */
  protected commandLog(): CommandLog {
    return this.ctx.commands;
  }

  // Admin / telemetry drivers (Phase 5).

  /** Push a new service topology → re-render the subscribing panel. */
  setTopology(value: ServiceTopology | null): void {
    this.ctx.setTopology(value);
  }

  /** Push a new event log → re-render the subscribing panel. */
  setEventLog(value: readonly LogEvent[]): void {
    this.ctx.setEventLog(value);
  }

  /** Push new active sessions → re-render the subscribing panel. */
  setSessions(value: readonly SessionInfo[]): void {
    this.ctx.setSessions(value);
  }

  /** Patch the metric series → re-render the subscribing gauges/charts. */
  setMetrics(patch: Partial<MetricsView>): void {
    this.ctx.setMetrics(patch);
  }

  /** Inject an incident → drives incidentState$ (and optionally DISCONNECTED). */
  injectIncident(kind: IncidentKind): void {
    this.ctx.injectIncident(kind);
  }

  /** Clear all active incidents → restore CONNECTED status. */
  clearIncident(): void {
    this.ctx.clearIncident();
  }
}

/** Neutral handle for a component: carries its prop type and a page factory. */
export interface ComponentToken<P, Page extends MountedComponent<P>> {
  readonly makePage: (ctx: PageContext<P>) => Page;
}

export function component<P, Page extends MountedComponent<P>>(
  makePage: (ctx: PageContext<P>) => Page,
): ComponentToken<P, Page> {
  return { makePage };
}
