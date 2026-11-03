import type {
  ConfirmGate,
  JarvisConfirmDetails,
  JarvisToolDefinition,
} from "@rtc/agent-tools";
import type { DriveBatchV1, JarvisEvent, PanelSpecV1 } from "@rtc/domain";

import { buildDriveAppTool } from "./driveAppTool.js";
import { buildRenderPanelTool } from "./renderPanelTool.js";

/** Production `RenderPanelDeps.mintPanelId` — tests inject their own
 * deterministic mint instead (see `renderPanelTool.test.ts`). Uses the same
 * global `crypto.randomUUID` `requestConfirmation` already relies on below,
 * not a `node:crypto` import — Node exposes Web Crypto globally. */
function defaultMintPanelId(): string {
  return `panel-${crypto.randomUUID()}`;
}

/** Plain code-point order, not `localeCompare` — the cache-prefix
 * determinism this sort exists for (see `SYSTEM_BLOCKS`' doc comment in
 * `AnthropicAgentSession`) needs a byte-stable order for the exact same
 * tool-name set every time; a locale-aware compare depends on the ICU/Node
 * build's default locale, which is not guaranteed identical across
 * environments (dev machine vs. the deployed container) the way simple
 * `<`/`>` on ASCII tool names is. */
function toolNameOrder(
  a: JarvisToolDefinition,
  b: JarvisToolDefinition,
): number {
  if (a.name < b.name) {
    return -1;
  }

  if (a.name > b.name) {
    return 1;
  }

  return 0;
}

/** The open turn a desk is bound to: where its events go, and the turn's
 * signal (aborted means the person cancelled it). */
export interface DeskTurn {
  readonly push: (event: JarvisEvent) => void;
  readonly signal: AbortSignal;
}

/**
 * What any live model session needs, whichever provider it talks to: its
 * tools (the desk tools plus `render_panel` and `drive_app`), the registry of
 * trade confirmations awaiting an answer, and the `panel` / `command` /
 * `confirmRequest` events those tools emit onto the SAME per-turn stream as
 * every other event. SDK-free, so a session for any provider uses it.
 *
 * One desk per session: `execute_trade`'s confirm gate closes over THIS
 * desk's registry and event stream, never another connection's.
 */
export class LiveSessionDesk {
  /** Sorted by name — a byte-identical tools block turn to turn, whatever
   * order `buildTools` returned them in. */
  readonly tools: readonly JarvisToolDefinition[];

  private readonly pendingConfirmations = new Map<
    string,
    (approved: boolean) => void
  >();

  private turn: DeskTurn | null = null;

  constructor(
    buildTools: (confirm: ConfirmGate) => readonly JarvisToolDefinition[],
    // `render_panel`'s roster check — see `RenderPanelDeps.knownSymbols`'s
    // doc comment.
    knownSymbols: readonly string[],
    // Test seam only — production always takes `defaultMintPanelId`.
    mintPanelId: () => string = defaultMintPanelId,
  ) {
    const confirm: ConfirmGate = (details: JarvisConfirmDetails) => {
      return this.requestConfirmation(details);
    };

    const renderPanelTool = buildRenderPanelTool({
      knownSymbols,
      emitPanel: (panelId: string, spec: PanelSpecV1): void => {
        this.turn?.push({ type: "panel", panelId, spec });
      },
      mintPanelId,
    });

    const driveAppTool = buildDriveAppTool({
      emitDrive: (batch: DriveBatchV1): void => {
        this.turn?.push({ type: "command", batch });
      },
    });

    this.tools = [...buildTools(confirm), renderPanelTool, driveAppTool].sort(
      toolNameOrder,
    );
  }

  /** Binds the desk to the turn that is open, or to none (`null`). The turn is
   * non-null only while a turn is in flight, which is exactly when a tool's
   * `run()` can execute; `?.` at each emit is defense in depth. */
  bindTurn(turn: DeskTurn | null): void {
    this.turn = turn;
  }

  private requestConfirmation(details: JarvisConfirmDetails): Promise<boolean> {
    const turn = this.turn;

    // A cancelled turn is answered no at once. A tool's work before its gate
    // (a trade's quote takes a second) does not hear the abort, so it can
    // land here after `releasePendingConfirmations` released every pending
    // confirmation: a resolver registered now would never settle, and the
    // turn, its reservation and the connection's queue behind it would wait
    // for ever.
    if (!turn || turn.signal.aborted) {
      // No turn is currently open to receive this confirmRequest.
      // Registering a resolver here anyway would leak a Promise nothing can
      // ever settle: nothing would ever push the `confirmRequest` event a
      // client could react to, and no cancel is "in flight" to release it
      // either. Not reachable in the normal single-turn-at-a-time flow —
      // kept as defense in depth against exactly the kind of concurrent-turn
      // race `jarvis.chat`'s `concatMap` serialization (see
      // `jarvis.effects.ts`) now rules out at the wire layer.
      return Promise.resolve(false);
    }

    const { push } = turn;
    const confirmationId = `confirm-${crypto.randomUUID()}`;

    return new Promise<boolean>((resolve) => {
      this.pendingConfirmations.set(confirmationId, resolve);
      push({
        type: "confirmRequest",
        confirmationId,
        symbol: details.symbol,
        direction: details.direction,
        notional: details.notional,
        quotedPrice: details.quotedPrice,
        ratePrecision: details.ratePrecision,
      });
    });
  }

  resolveConfirmation(confirmationId: string, approved: boolean): void {
    const resolve = this.pendingConfirmations.get(confirmationId);

    if (!resolve) {
      return;
    }

    this.pendingConfirmations.delete(confirmationId);
    resolve(approved);
  }

  /**
   * A turn torn down mid-trade (cancel, dispose, unsubscribe) would
   * otherwise strand its resolver forever and leave `requestConfirmation`'s
   * promise dangling — resolve every outstanding one `false` so
   * `execute_trade`'s `run` unblocks instead of hanging. A session calls it
   * from BOTH `cancelTurn()` (an abort alone only cancels the provider's
   * network request, not this separate, signal-unaware confirmation
   * `Promise`) and the turn Observable's own teardown (belt-and-suspenders
   * for a socket-disconnect unsubscribe that bypasses `cancelTurn()`).
   */
  releasePendingConfirmations(): void {
    for (const resolve of this.pendingConfirmations.values()) {
      resolve(false);
    }

    this.pendingConfirmations.clear();
  }
}
