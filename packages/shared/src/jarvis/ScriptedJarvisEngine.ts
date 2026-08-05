import {
  firstValueFrom,
  from,
  lastValueFrom,
  Observable,
  of,
  Subject,
} from "rxjs";
import {
  concatMap,
  delay,
  switchMap,
  take,
  tap,
  timeout,
} from "rxjs/operators";

import {
  type AnalyticsPort,
  AnalyticsUseCase,
  type BlotterPort,
  type CurrencyPair,
  CurrencyPairsUseCase,
  Direction,
  ExecuteTradeUseCase,
  type ExecutionPort,
  ExecutionStatus,
  formatPnlHeadline,
  type Price,
  PriceStreamUseCase,
  type PriceTick,
  type PricingPort,
  type ReferenceDataPort,
  TradeBlotterUseCase,
} from "@rtc/domain";
import { SPEECH_CHUNK_INTERVAL_MS, speechChunks } from "@rtc/motion-core";

import type { JarvisEvent } from "#/jarvis/jarvisEvent.js";

import type { DriveBatchV1 } from "./driveCommand.js";
import type { JarvisTradeIntent } from "./jarvisIntent.js";
import { matchJarvisIntent } from "./jarvisIntent.js";
import type { PanelSpecV1 } from "./panelSpec.js";

const SNAPSHOT_TIMEOUT_MS = 2_000;
const SNAPSHOT_ERROR_MESSAGE =
  "My apologies, sir — the desk didn't respond in time.";

/**
 * Trade EXECUTION gets a much more generous budget than a read snapshot:
 * ExecutionSimulator delays EURJPY fills by a fixed 4s and every other pair
 * uniformly 0-2s, so the 2s read-snapshot timeout would misreport a slow-but-
 * real fill as a failure (always, for EURJPY) rather than time out only on a
 * genuinely stuck execution. 30s is "effectively no timeout" for a
 * human-scale confirm-then-execute flow while still bounding a truly hung
 * call.
 */
const EXECUTION_TIMEOUT_MS = 30_000;

const GREETING_REPLY =
  "At your service, sir. Markets, a desk briefing, or an execution — simply say the word.";

const HELP_REPLY =
  "At your service, sir. I can quote the majors, report the movers, brief you on the desk, " +
  "or execute FX orders. Sentinels, widgets and drills arrive in a later build, sir.";

const FALLBACK_REPLY =
  "I'm afraid that request is outside my current mandate, sir. I can quote the majors, " +
  "report the movers, brief you on the desk, or execute FX orders.";
const DECLINED_REPLY = "Understood, sir — standing down. Nothing was executed.";
const REJECTED_REPLY = "The venue rejected it, sir — nothing was executed.";

/** Non-ASCII minus (U+2212), matching the v5 prototype's movers copy. */
const MINUS_SIGN = "−";

/** Deterministic — e2e and contract tests key on this literal id. Scripted
 * panels are a single-panel demo (Round 1), so one constant id suffices. */
const SCRIPTED_PANEL_ID = "panel-scripted-1";

/** The canned generative-UI demo panel a showPanel turn emits — a zero-token
 * path that exercises the same `PanelSpecV1` vocabulary a live brain's
 * `render_panel` tool call would produce (added in a later task). */
const GBP_VOLATILITY_PANEL_SPEC: PanelSpecV1 = {
  v: 1,
  title: "GBP Volatility",
  rationale: "Rolling volatility across the GBP majors, sir.",
  source: { kind: "priceHistory", symbols: ["GBPUSD", "GBPJPY"] },
  transforms: [{ kind: "rollingVol", samples: 20 }],
  viz: { kind: "line" },
};

const SHOW_PANEL_REPLY = "Pulling up GBP volatility now, sir.";
const NO_PANEL_TO_RESTYLE_REPLY = "There's no panel open to restyle yet, sir.";

/** The canned generative-UI-driving demo batch a setupWorkspace turn emits —
 * the zero-token path that exercises the same `DriveBatchV1` vocabulary a
 * live brain's drive-the-app tool call would produce. Maximizes the equities
 * chart on a 1D timeframe with EMA50 and an RSI pane live. */
export const SCRIPTED_VOL_WORKSPACE_BATCH: DriveBatchV1 = {
  v: 1,
  commands: [
    { kind: "switchTab", tab: "equities" },
    { kind: "layout", op: "maximize", tab: "equities", panelId: "eq-chart" },
    { kind: "eqTimeframe", tf: "1D" },
    { kind: "eqIndicator", id: "ema50", on: true },
    { kind: "eqPane", id: "rsi", on: true },
  ],
};

const SETUP_WORKSPACE_REPLY =
  "Setting up your morning workspace now, sir — equities maximized, " +
  "EMA50 and RSI live.";

/** `symbol` is already resolved by `matchJarvisIntent` (a known pair, or its
 * own generic fallback) — this just formats the canned offer copy around it. */
function describeNarrationReply(symbol: string): string {
  return `${symbol} volatility is spiking, sir. Shall I set up the vol workspace?`;
}

function describeRestylePanelReply(viz: "heatmap" | "table" | "line"): string {
  return `Restyled as a ${viz}, sir.`;
}

/** The scripted session's restyle state — the last panel a showPanel/
 * restylePanel turn produced this session. */
interface ScriptedPanelState {
  readonly id: string;
  readonly spec: PanelSpecV1;
}

export interface ScriptedJarvisDeps {
  readonly referenceData: ReferenceDataPort;
  readonly pricing: PricingPort;
  readonly blotter: BlotterPort;
  readonly analytics: AnalyticsPort;
  readonly execution: ExecutionPort;
  /** true → emit each reply as ONE delta (Freeze / reduced-motion / tests). */
  readonly instantReveal$: Observable<boolean>;
}

function formatThousands(n: number): string {
  return n.toLocaleString("en-US");
}

function moverSign(delta: number): string {
  return delta < 0 ? MINUS_SIGN : "+";
}

/** Rounded pips delta between the first and last tick of a history window. */
function historyPipsDelta(
  history: readonly PriceTick[],
  pipsPosition: number,
): number {
  const first = history[0];
  const last = history[history.length - 1];

  if (!first || !last) {
    return 0;
  }

  return Math.round((last.mid - first.mid) * 10 ** pipsPosition);
}

function findPair(
  pairs: readonly CurrencyPair[],
  symbol: string,
): CurrencyPair {
  const pair = pairs.find((p) => {
    return p.symbol === symbol;
  });

  if (!pair) {
    throw new Error(`Unknown symbol: ${symbol}`);
  }

  return pair;
}

/**
 * The ported v5 prototype "scripted brain": a transport-neutral engine
 * backed by `matchJarvisIntent` over the live domain use cases (no LLM, no
 * network). Every live-data READ goes through `snapshot()` (take(1) + a 2s
 * timeout); a timeout or any other read failure surfaces as a single `error`
 * event instead of a delta/done pair, per the Task 3 ruling. Trade EXECUTION
 * goes through the separate `executeSnapshot()` (take(1) + a 30s timeout)
 * instead — see `EXECUTION_TIMEOUT_MS`'s doc comment for why it can't share
 * the read budget.
 */
export class ScriptedJarvisEngine {
  private readonly pendingConfirmations = new Map<string, Subject<boolean>>();

  /** The last panel this session's showPanel/restylePanel turns produced —
   * per-instance (per-session) restyle state; null until a showPanel turn
   * has run. */
  private lastPanel: ScriptedPanelState | null = null;

  constructor(private readonly deps: ScriptedJarvisDeps) {}

  ask(text: string): Observable<JarvisEvent> {
    return new Observable<JarvisEvent>((subscriber) => {
      let closed = false;
      const turnConfirmationIds = new Set<string>();

      function push(event: JarvisEvent): void {
        if (!closed) {
          subscriber.next(event);
        }
      }

      this.runTurn(text, push, turnConfirmationIds)
        .then(() => {
          if (!closed) {
            subscriber.next({ type: "done" });
            subscriber.complete();
          }
        })
        .catch(() => {
          if (!closed) {
            subscriber.next({ type: "error", message: SNAPSHOT_ERROR_MESSAGE });
            subscriber.complete();
          }
        });

      return (): void => {
        closed = true;

        // A turn torn down mid-trade (machine dispose, subscriber unsubscribe)
        // would otherwise strand its Subject in pendingConfirmations forever —
        // and leave runTurn dangling on waitForConfirm.
        for (const id of turnConfirmationIds) {
          this.cancelConfirmation(id);
        }
      };
    });
  }

  confirm(confirmationId: string, approved: boolean): void {
    const subject = this.pendingConfirmations.get(confirmationId);

    if (!subject) {
      return;
    }

    this.pendingConfirmations.delete(confirmationId);
    subject.next(approved);
    subject.complete();
  }

  /** Teardown path for a confirmation whose turn died before confirm():
   * completing the Subject WITHOUT a value makes waitForConfirm's
   * firstValueFrom reject (EmptyError), which unblocks the dangling runTurn
   * promise; ask()'s catch then no-ops because the turn is already closed.
   * No-op when confirm() already resolved it. */
  private cancelConfirmation(confirmationId: string): void {
    const subject = this.pendingConfirmations.get(confirmationId);

    if (!subject) {
      return;
    }

    this.pendingConfirmations.delete(confirmationId);
    subject.complete();
  }

  /** Read-path snapshot: take(1) + the tight SNAPSHOT_TIMEOUT_MS budget —
   * for reference data / pricing / analytics / blotter reads, which the
   * simulators never delay meaningfully. */
  private snapshot<T>(source$: Observable<T>): Promise<T> {
    return firstValueFrom(source$.pipe(take(1), timeout(SNAPSHOT_TIMEOUT_MS)));
  }

  /** Execution-path snapshot: take(1) + the generous EXECUTION_TIMEOUT_MS
   * budget — see its doc comment for why execution must not share the read
   * snapshot's 2s budget. */
  private executeSnapshot<T>(source$: Observable<T>): Promise<T> {
    return firstValueFrom(source$.pipe(take(1), timeout(EXECUTION_TIMEOUT_MS)));
  }

  private waitForConfirm(confirmationId: string): Promise<boolean> {
    const subject = new Subject<boolean>();
    this.pendingConfirmations.set(confirmationId, subject);
    return firstValueFrom(subject);
  }

  /** Paces `text` out as JarvisEvent deltas — one chunk per
   * SPEECH_CHUNK_INTERVAL_MS, or a single delta when instantReveal$ is true
   * (read once per turn). Resolves once every delta has been pushed. */
  private reveal(
    text: string,
    push: (event: JarvisEvent) => void,
  ): Promise<void> {
    const deltas$: Observable<JarvisEvent> = this.deps.instantReveal$.pipe(
      take(1),
      switchMap((instant) => {
        if (instant) {
          return of<JarvisEvent>({ type: "delta", text });
        }

        return from(speechChunks(text)).pipe(
          concatMap((chunk) => {
            return of<JarvisEvent>({ type: "delta", text: chunk }).pipe(
              delay(SPEECH_CHUNK_INTERVAL_MS),
            );
          }),
        );
      }),
      tap(push),
    );
    return lastValueFrom(deltas$, { defaultValue: undefined }).then(() => {
      return undefined;
    });
  }

  private async runTurn(
    text: string,
    push: (event: JarvisEvent) => void,
    turnConfirmationIds: Set<string>,
  ): Promise<void> {
    const pairs = await this.snapshot(
      new CurrencyPairsUseCase(this.deps.referenceData).execute(),
    );

    const knownSymbols = pairs.map((p) => {
      return p.symbol;
    });
    const intent = matchJarvisIntent(text, knownSymbols);

    switch (intent.kind) {
      case "narration":
        await this.reveal(describeNarrationReply(intent.symbol), push);
        return;
      case "greeting":
        await this.reveal(GREETING_REPLY, push);
        return;
      case "help":
        await this.reveal(HELP_REPLY, push);
        return;
      case "fallback":
        await this.reveal(FALLBACK_REPLY, push);
        return;
      case "pnl":
        await this.handlePnl(push);
        return;
      case "movers":
        await this.streamMoversReply(pairs, push);
        return;
      case "quote":
        await this.streamQuoteReply(pairs, intent.symbol, push);
        return;
      case "spread":
        await this.streamSpreadReply(pairs, intent.symbol, push);
        return;
      case "showPanel":
        await this.streamShowPanelReply(push);
        return;
      case "restylePanel":
        await this.streamRestylePanelReply(intent.viz, push);
        return;
      case "setupWorkspace":
        await this.streamSetupWorkspaceReply(push);
        return;
      case "trade":
        await this.executeConfirmedTrade(
          pairs,
          intent,
          push,
          turnConfirmationIds,
        );
        return;

      default: {
        const _exhaustive: never = intent;
        return _exhaustive;
      }
    }
  }

  private async handlePnl(push: (event: JarvisEvent) => void): Promise<void> {
    push({ type: "toolEvent", tool: "desk", status: "running" });
    const analytics = await this.snapshot(
      new AnalyticsUseCase(this.deps.analytics).execute(),
    );

    const trades = await this.snapshot(
      new TradeBlotterUseCase(this.deps.blotter).execute(),
    );
    push({ type: "toolEvent", tool: "desk", status: "done" });

    const totalPnl = analytics.currentPositions.reduce((sum, position) => {
      return sum + position.basePnl;
    }, 0);

    const reply =
      `Session P&L stands at ${formatPnlHeadline(totalPnl)}, sir. ` +
      `${trades.length} FX trades on the blotter.`;
    await this.reveal(reply, push);
  }

  private async streamMoversReply(
    pairs: readonly CurrencyPair[],
    push: (event: JarvisEvent) => void,
  ): Promise<void> {
    push({ type: "toolEvent", tool: "movers", status: "running" });
    const movers = await Promise.all(
      pairs.map(async (pair) => {
        const history = await this.snapshot(
          this.deps.pricing.getPriceHistory(pair.symbol),
        );
        return {
          symbol: pair.symbol,
          delta: historyPipsDelta(history, pair.pipsPosition),
        };
      }),
    );
    push({ type: "toolEvent", tool: "movers", status: "done" });

    const top3 = [...movers]
      .sort((a, b) => {
        return Math.abs(b.delta) - Math.abs(a.delta);
      })
      .slice(0, 3);

    const entries = top3.map((mover) => {
      return `${mover.symbol} ${moverSign(mover.delta)}${Math.abs(mover.delta)} pips`;
    });
    const reply = `The board, sir: ${entries.join(" · ")}.`;
    await this.reveal(reply, push);
  }

  private async streamQuoteReply(
    pairs: readonly CurrencyPair[],
    symbol: string,
    push: (event: JarvisEvent) => void,
  ): Promise<void> {
    const pair = findPair(pairs, symbol);
    push({ type: "toolEvent", tool: "quote", status: "running" });
    const price = await this.snapshot(
      new PriceStreamUseCase(this.deps.pricing).execute(pair),
    );

    const history = await this.snapshot(
      this.deps.pricing.getPriceHistory(pair.symbol),
    );
    push({ type: "toolEvent", tool: "quote", status: "done" });

    const first = history[0];
    const delta = first
      ? Math.round((price.mid - first.mid) * 10 ** pair.pipsPosition)
      : 0;
    const direction = delta >= 0 ? "up" : "down";
    const momentum = delta >= 0 ? "positive" : "negative";
    const spreadPips = Math.round(Number.parseFloat(price.spread));
    const reply =
      `${pair.symbol} is trading at ${price.mid.toFixed(pair.pipsPosition)}, ` +
      `${direction} ${Math.abs(delta)} pips since the start of the session. ` +
      `Spread ${spreadPips} pips; short-term momentum is ${momentum}. Anything else, sir?`;
    await this.reveal(reply, push);
  }

  private async streamSpreadReply(
    pairs: readonly CurrencyPair[],
    symbol: string,
    push: (event: JarvisEvent) => void,
  ): Promise<void> {
    const pair = findPair(pairs, symbol);
    // Same live-pricing read as the quote turn, so it surfaces the same
    // "quote" tool badge — a spread turn used to be the one read that ran
    // silently, and the phase-3 tool registry wants every read attributed.
    push({ type: "toolEvent", tool: "quote", status: "running" });
    const price = await this.snapshot(
      new PriceStreamUseCase(this.deps.pricing).execute(pair),
    );
    push({ type: "toolEvent", tool: "quote", status: "done" });
    const spreadPips = Math.round(Number.parseFloat(price.spread));
    const reply = `${pair.symbol} spread is currently ${spreadPips} pips, sir.`;
    await this.reveal(reply, push);
  }

  /** Emits the canned GBP-volatility panel (the generative-UI demo path —
   * zero-token, deterministic) and records it as `lastPanel` so a later
   * restylePanel turn this session can re-emit it with a new viz. */
  private async streamShowPanelReply(
    push: (event: JarvisEvent) => void,
  ): Promise<void> {
    this.lastPanel = { id: SCRIPTED_PANEL_ID, spec: GBP_VOLATILITY_PANEL_SPEC };
    push({
      type: "panel",
      panelId: this.lastPanel.id,
      spec: this.lastPanel.spec,
    });
    await this.reveal(SHOW_PANEL_REPLY, push);
  }

  /** Re-emits `lastPanel` with a new `viz`, keeping every other field (same
   * `panelId`, source, transforms). No prior panel this session → a
   * fallback-style reply and no panel event — there is nothing to restyle. */
  private async streamRestylePanelReply(
    viz: "heatmap" | "table" | "line",
    push: (event: JarvisEvent) => void,
  ): Promise<void> {
    if (!this.lastPanel) {
      await this.reveal(NO_PANEL_TO_RESTYLE_REPLY, push);
      return;
    }

    const spec: PanelSpecV1 = { ...this.lastPanel.spec, viz: { kind: viz } };
    this.lastPanel = { id: this.lastPanel.id, spec };
    push({ type: "panel", panelId: this.lastPanel.id, spec });
    await this.reveal(describeRestylePanelReply(viz), push);
  }

  /** Emits the canned "drive the app" demo (the zero-token setupWorkspace
   * path): an intro line, ONE `command` event carrying
   * `SCRIPTED_VOL_WORKSPACE_BATCH`, then reuses `streamShowPanelReply` for
   * the canned GBP-vol panel — so the panel event (and its own speech)
   * follows the command event, same as a live brain chaining a
   * drive-the-app tool call into a render_panel call. */
  private async streamSetupWorkspaceReply(
    push: (event: JarvisEvent) => void,
  ): Promise<void> {
    await this.reveal(SETUP_WORKSPACE_REPLY, push);
    push({ type: "command", batch: SCRIPTED_VOL_WORKSPACE_BATCH });
    await this.streamShowPanelReply(push);
  }

  private async executeConfirmedTrade(
    pairs: readonly CurrencyPair[],
    intent: JarvisTradeIntent,
    push: (event: JarvisEvent) => void,
    turnConfirmationIds: Set<string>,
  ): Promise<void> {
    const pair = findPair(pairs, intent.symbol);
    // ONE price snapshot serves the whole flow: the quoted price shown on the
    // confirm card IS the price handed to ExecuteTradeUseCase below. By
    // approval time it can be up to JARVIS_CONFIRM_TIMEOUT_MS (60 s) stale
    // against the live stream — deliberate: "execute at the quoted price" is
    // the contract the card advertises, and re-snapshotting after approval
    // would execute at a price the user never saw.
    const price: Price = await this.snapshot(
      new PriceStreamUseCase(this.deps.pricing).execute(pair),
    );

    const quotedPrice =
      intent.direction === Direction.Buy ? price.ask : price.bid;
    // Unguessable, not just unique: the server holds one process-wide
    // pendingConfirmations map across every connected socket, so a
    // sequential id ("confirm-1", "confirm-2", ...) would let one
    // authenticated client approve another client's staged trade by
    // guessing it.
    const confirmationId = `confirm-${crypto.randomUUID()}`;
    turnConfirmationIds.add(confirmationId);

    push({
      type: "confirmRequest",
      confirmationId,
      symbol: pair.symbol,
      direction: intent.direction,
      notional: intent.notional,
      quotedPrice,
      ratePrecision: pair.ratePrecision,
    });

    const approved = await this.waitForConfirm(confirmationId);

    if (!approved) {
      await this.reveal(DECLINED_REPLY, push);
      return;
    }

    const result = await this.executeSnapshot(
      new ExecuteTradeUseCase(this.deps.execution).execute({
        pair,
        direction: intent.direction,
        price,
        notional: intent.notional,
      }),
    );

    if (result.status === ExecutionStatus.Rejected) {
      await this.reveal(REJECTED_REPLY, push);
      return;
    }

    const verb = intent.direction === Direction.Buy ? "Bought" : "Sold";
    const reply =
      `Very good, sir. ${verb} ${formatThousands(intent.notional)} ${result.trade.dealtCurrency} ` +
      `at ${result.trade.spotRate.toFixed(pair.pipsPosition)} — the trade is on your blotter.`;
    await this.reveal(reply, push);
  }
}
