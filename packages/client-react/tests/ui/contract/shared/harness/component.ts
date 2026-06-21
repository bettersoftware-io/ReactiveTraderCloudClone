import type { Price, PriceTick, Quote } from "@rtc/domain";
import type { ThroughputView } from "../../../../../src/app/presenters/ThroughputPresenter";
import type { HookValues, CommandLog } from "./world";

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
  /** Push a new throughput view (useThroughput source). */
  setThroughputView(patch: Partial<ThroughputView>): void;
  /** Values captured from useThroughput().setValue calls. */
  readonly throughputSets: number[];
  readonly commands: CommandLog;
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

  /** Push a new throughput view → re-render the AdminPanel. */
  protected setThroughputView(patch: Partial<ThroughputView>): void {
    this.ctx.setThroughputView(patch);
  }

  /** Values recorded by the faked useThroughput().setValue (PUT equivalent). */
  protected throughputSets(): number[] {
    return this.ctx.throughputSets;
  }

  /** Inputs recorded by the faked command hooks (unit-mode convenience). */
  protected commandLog(): CommandLog {
    return this.ctx.commands;
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
