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
  type ServiceHealthPort,
  ServiceTopologySimulator,
  TradeStoreSimulator,
} from "@rtc/domain";

import { ThroughputService } from "./ThroughputService.js";
import { UsageMeter } from "./UsageMeter.js";

export interface ServiceContainer {
  readonly referenceData: ReferenceDataSimulator;
  readonly pricing: PricingSimulator;
  readonly execution: ExecutionSimulator;
  readonly blotter: TradeStoreSimulator;
  readonly analytics: AnalyticsSimulator;
  readonly serviceHealth: ServiceHealthPort;
  readonly instruments: InstrumentSimulator;
  readonly dealers: DealerSimulator;
  readonly workflow: CreditRfqSimulator;
  readonly throughput: ThroughputService;
  readonly marketData: MarketDataPort;
  readonly orders: OrderPort;
  readonly positions: PositionPort;
  readonly usageMeter: UsageMeter;
}

export function createServices(): ServiceContainer {
  const referenceData = new ReferenceDataSimulator();
  const pricing = new PricingSimulator();
  const execution = new ExecutionSimulator();
  const blotter = new TradeStoreSimulator(execution);
  const analytics = new AnalyticsSimulator();
  // Fixed dev seed (3) — mirrors how client-core's simulator composition
  // seeds the same class (see `createSimulatorPorts` in `portFactory.ts`).
  const serviceHealth = new ServiceTopologySimulator(3);
  const instruments = new InstrumentSimulator();
  const dealers = new DealerSimulator();
  const workflow = new CreditRfqSimulator(DEALERS_CATALOG);
  const throughput = new ThroughputService();
  const usageMeter = new UsageMeter();
  const marketData = new EquityMarketDataSimulator();
  const positions = new EquityPositionSimulator(marketData);
  const orders = new EquityOrderSimulator({
    listener: (fill: FillEvent): void => {
      positions.bookFill(fill);
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
    serviceHealth,
    instruments,
    dealers,
    workflow,
    throughput,
    marketData,
    orders,
    positions,
    usageMeter,
  };
}
