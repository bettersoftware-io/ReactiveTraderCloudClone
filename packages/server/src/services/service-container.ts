import {
  ReferenceDataSimulator,
  PricingSimulator,
  ExecutionSimulator,
  TradeStoreSimulator,
  AnalyticsSimulator,
  InstrumentSimulator,
  DealerSimulator,
  CreditRfqSimulator,
  DEALERS_CATALOG,
} from "@rtc/domain";
import { ThroughputService } from "./throughput-service.js";

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
  };
}
