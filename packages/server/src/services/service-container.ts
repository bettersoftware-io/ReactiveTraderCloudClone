import {
  MockReferenceDataService,
  MockPricingEngine,
  MockExecutionEngine,
  MockTradeStore,
  MockAnalyticsEngine,
  MockInstrumentService,
  MockDealerService,
  MockCreditRfqEngine,
  MOCK_DEALERS,
} from "@rtc/domain";
import { ThroughputService } from "./throughput-service.js";

export interface ServiceContainer {
  readonly referenceData: MockReferenceDataService;
  readonly pricing: MockPricingEngine;
  readonly execution: MockExecutionEngine;
  readonly blotter: MockTradeStore;
  readonly analytics: MockAnalyticsEngine;
  readonly instruments: MockInstrumentService;
  readonly dealers: MockDealerService;
  readonly workflow: MockCreditRfqEngine;
  readonly throughput: ThroughputService;
}

export function createServices(): ServiceContainer {
  const referenceData = new MockReferenceDataService();
  const pricing = new MockPricingEngine();
  const execution = new MockExecutionEngine();
  const blotter = new MockTradeStore(execution);
  const analytics = new MockAnalyticsEngine();
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
