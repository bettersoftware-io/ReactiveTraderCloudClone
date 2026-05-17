// tests/scenarios/presenter/cucumber-real/common.ts
import type { CurrencyPair, Price, ExecutionStatus, Direction } from "@rtc/domain";
import type { RfqQuoteResult } from "@rtc/domain";
import type { PresenterWorld } from "../_world";

export interface PresenterScratchpad {
  firstPair?: CurrencyPair;
  lastPrice?: Price;
  recordedCount: Map<string, number>;
  lastTradeStatus?: ExecutionStatus;
  lastTradeDirection?: Direction;
  lastTradeNotional?: number;
  rejectedSeen?: boolean;
  observedTradeCount: number;
  rfqQuote?: RfqQuoteResult;
}

export const newScratchpad = (): PresenterScratchpad => ({
  recordedCount: new Map(),
  observedTradeCount: 0,
});

export async function openWorkspace(_w: PresenterWorld): Promise<void> { /* no-op: workspaces are UI-only */ }
export async function openFxWorkspace(_w: PresenterWorld): Promise<void> { /* no-op: workspaces are UI-only */ }
export async function openCreditWorkspace(_w: PresenterWorld): Promise<void> { /* no-op: workspaces are UI-only */ }
