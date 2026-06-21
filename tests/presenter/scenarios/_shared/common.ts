// tests/presenter/scenarios/_shared/common.ts
import type {
  CurrencyPair,
  ExecutionStatus,
  RfqQuoteResult,
} from "@rtc/domain";
import type { PresenterWorld } from "../_world";

export interface PresenterScratchpad {
  firstPair?: CurrencyPair;
  lastTradeStatus?: ExecutionStatus;
  lastTradeNotional?: number;
  rejectedSeen?: boolean;
  rfqQuote?: RfqQuoteResult;
}

export const newScratchpad = (): PresenterScratchpad => ({});

export async function openWorkspace(_w: PresenterWorld): Promise<void> {
  /* no-op: workspaces are UI-only */
}
export async function openFxWorkspace(_w: PresenterWorld): Promise<void> {
  /* no-op: workspaces are UI-only */
}
export async function openCreditWorkspace(_w: PresenterWorld): Promise<void> {
  /* no-op: workspaces are UI-only */
}
