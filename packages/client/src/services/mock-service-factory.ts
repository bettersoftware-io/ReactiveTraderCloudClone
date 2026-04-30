import {
  ReferenceDataSimulator,
  PricingSimulator,
  ExecutionSimulator,
  TradeStoreSimulator,
  AnalyticsSimulator,
  InstrumentSimulator,
  DealerSimulator,
  MockCreditRfqEngine,
  DEALERS_CATALOG,
  type ReferenceDataPort,
  type PricingPort,
  type ExecutionPort,
  type BlotterPort,
  type AnalyticsPort,
  type InstrumentPort,
  type DealerPort,
  type WorkflowPort,
} from "@rtc/domain";

export interface Services {
  referenceData: ReferenceDataPort;
  pricing: PricingPort;
  execution: ExecutionPort;
  blotter: BlotterPort;
  analytics: AnalyticsPort;
  instruments: InstrumentPort;
  dealers: DealerPort;
  workflow: WorkflowPort;
}

export function createMockServices(): Services {
  const referenceData = new ReferenceDataSimulator();
  const pricing = new PricingSimulator();
  const execution = new ExecutionSimulator();
  const blotter = new TradeStoreSimulator(execution);
  const analytics = new AnalyticsSimulator();
  const instruments = new InstrumentSimulator();
  const dealers = new DealerSimulator();
  const workflow = new MockCreditRfqEngine(DEALERS_CATALOG);

  return {
    referenceData,
    pricing,
    execution,
    blotter,
    analytics,
    instruments,
    dealers,
    workflow,
  };
}
