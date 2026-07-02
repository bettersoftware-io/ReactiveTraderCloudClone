import {
  AnalyticsSimulator,
  CreditRfqSimulator,
  DEALERS_CATALOG,
  DealerSimulator,
  EquityMarketDataSimulator,
  EquityOrderSimulator,
  EquityPositionSimulator,
  ExecutionSimulator,
  type FillEvent,
  InstrumentSimulator,
  type MarketDataPort,
  type OrderPort,
  type PositionPort,
  PricingSimulator,
  ReferenceDataSimulator,
  TradeStoreSimulator,
} from "@rtc/domain";

import { ThroughputService } from "./ThroughputService.js";

export interface ServiceContainer {
  readonly referenceData: ReferenceDataSimulator;
  readonly pricing: PricingSimulator;
  readonly execution: ExecutionSimulator;
  readonly blotter: TradeStoreSimulator;
  readonly analytics: AnalyticsSimulator;
  readonly instruments: InstrumentSimulator;
  readonly dealers: DealerSimulator;
  readonly workflow: CreditRfqSimulator;
  readonly throughput: ThroughputService;
  readonly marketData: MarketDataPort;
  readonly orders: OrderPort;
  readonly positions: PositionPort;
}

export function createServices(): ServiceContainer {
  const referenceData = new ReferenceDataSimulator();
  const pricing = new PricingSimulator();
  const execution = new ExecutionSimulator();
  const blotter = new TradeStoreSimulator(execution);
  const analytics = new AnalyticsSimulator();
  const instruments = new InstrumentSimulator();
  const dealers = new DealerSimulator();
  const workflow = new CreditRfqSimulator(DEALERS_CATALOG);
  const throughput = new ThroughputService();
  const marketData = new EquityMarketDataSimulator();
  const positions = new EquityPositionSimulator(marketData);
  const orders = new EquityOrderSimulator({
    listener: (fill: FillEvent): void => {
      positions.onFill(fill);
    },
    markFor: (symbol: string): number => {
      return marketData.currentPrice(symbol);
    },
  });

  return {
    referenceData,
    pricing,
    execution,
    blotter,
    analytics,
    instruments,
    dealers,
    workflow,
    throughput,
    marketData,
    orders,
    positions,
  };
}
