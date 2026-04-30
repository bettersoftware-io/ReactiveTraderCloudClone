import {
  ReferenceDataSimulator,
  PricingSimulator,
  ExecutionSimulator,
  TradeStoreSimulator,
  AnalyticsSimulator,
  MockInstrumentService,
  MockDealerService,
  MockCreditRfqEngine,
  MOCK_DEALERS,
} from "@rtc/domain";
import { ThroughputService } from "./throughput-service.js";

export interface ServiceContainer {
  readonly referenceData: ReferenceDataSimulator;
  readonly pricing: PricingSimulator;
  readonly execution: ExecutionSimulator;
  readonly blotter: TradeStoreSimulator;
  readonly analytics: AnalyticsSimulator;
  readonly instruments: MockInstrumentService;
  readonly dealers: MockDealerService;
  readonly workflow: MockCreditRfqEngine;
  readonly throughput: ThroughputService;
}

export function createServices(): ServiceContainer {
  const referenceData = new ReferenceDataSimulator();
  const pricing = new PricingSimulator();
  const execution = new ExecutionSimulator();
  const blotter = new TradeStoreSimulator(execution);
  const analytics = new AnalyticsSimulator();
  const instruments = new MockInstrumentService();
  const dealers = new MockDealerService();
  const workflow = new MockCreditRfqEngine(MOCK_DEALERS);
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
