import type { ExecutionRequest, Trade } from "../fx/trade.js";

export interface ExecutionPort {
  executeTrade(request: ExecutionRequest): Promise<Trade>;
}
