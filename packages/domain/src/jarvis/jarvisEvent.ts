import type { Direction } from "../fx/trade.js";
import type { JarvisBrain } from "../preferences/preferences.js";
import type { DriveBatchV1 } from "./driveCommand.js";
import type { PanelSpecV1 } from "./panelSpec.js";

/**
 * What a Jarvis brain emits during one chat turn: speech, tool progress, a
 * trade to confirm, a panel to draw, commands to drive the desk, and the
 * turn's end. The Jarvis machine folds these and the UIs render them, so the
 * union is domain vocabulary. The server opens each turn with `brain`: the
 * brain that actually ran it, which may differ from the one the client asked
 * for (budget gate, narrator turn, no live session). How each variant travels as a
 * `SERVER_MSG.JARVIS_*` payload is `@rtc/shared`'s concern
 * (`jarvis/jarvisPayloads.ts`).
 */
export type JarvisEvent =
  | { readonly type: "brain"; readonly brain: JarvisBrain }
  | { readonly type: "delta"; readonly text: string }
  | {
      readonly type: "toolEvent";
      readonly tool: string;
      readonly status: "running" | "done";
    }
  | {
      readonly type: "confirmRequest";
      readonly confirmationId: string;
      readonly symbol: string;
      readonly direction: Direction;
      readonly notional: number;
      readonly quotedPrice: number;
      /** The pair's display precision (CurrencyPair.ratePrecision), carried so
       * the confirm card can format quotedPrice exactly like the price tiles
       * (toFixed(ratePrecision)) without a reference-data lookup UI-side. */
      readonly ratePrecision: number;
    }
  | {
      readonly type: "panel";
      readonly panelId: string;
      readonly spec: PanelSpecV1;
    }
  | {
      readonly type: "command";
      readonly batch: DriveBatchV1;
    }
  | { readonly type: "done" }
  | { readonly type: "error"; readonly message: string };

/** One prior conversation turn the client replays for model context. */
export interface JarvisHistoryEntry {
  readonly role: "user" | "jarvis";
  readonly text: string;
}

/** Tri-state budget-gate level; "none" never crosses the wire on the
 * availability payload — `gate` is simply absent. The ops usage payload
 * carries the full tri-state. */
export type JarvisGateLevel = "none" | "soft" | "hard";

/** Present on JARVIS_AVAILABILITY only while a budget gate is active.
 * `gated` lists the brains removed BY the gate (already intersected with
 * what env capability offered), so the picker can render them
 * disabled-with-reason rather than plainly absent. `resetsAtMs` is the next
 * 00:00 UTC, when the day's budget starts over. Since B3a the server sends
 * only `"hard"` (the caller's daily budget is spent); `"soft"` stays in the
 * type until the clients stop reading it (B3b). */
export interface JarvisAvailabilityGate {
  readonly level: Exclude<JarvisGateLevel, "none">;
  readonly resetsAtMs: number;
  readonly gated: readonly JarvisBrain[];
}

/** The caller's Jarvis budget for today, on JARVIS_AVAILABILITY for a signed-in
 * connection. `limitUsd` is null for an administrator or the roster persona,
 * who have no personal limit (their spend still counts toward the house cap).
 * `exhausted` says why house turns are off: the caller's own limit, the
 * house-wide cap, a spend store that cannot be reached, or a forced gate.
 * `keyKind` is `"own"` when the caller's own key pays (B3c). */
export interface JarvisBudgetView {
  readonly keyKind: "house" | "own";
  readonly spentUsd: number;
  readonly limitUsd: number | null;
  readonly exhausted: "user" | "house" | "unavailable" | "forced" | null;
  readonly resetsAtMs: number;
}
