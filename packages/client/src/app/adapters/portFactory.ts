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
  type ReferenceDataPort,
  type PricingPort,
  type ExecutionPort,
  type BlotterPort,
  type AnalyticsPort,
  type InstrumentPort,
  type DealerPort,
  type WorkflowPort,
  type ConnectionEventsPort,
} from "@rtc/domain";

export interface AppPorts {
  referenceData: ReferenceDataPort;
  pricing: PricingPort;
  execution: ExecutionPort;
  blotter: BlotterPort;
  analytics: AnalyticsPort;
  instruments: InstrumentPort;
  dealers: DealerPort;
  workflow: WorkflowPort;
  connectionEvents: ConnectionEventsPort;
}

export type TransportPorts = Omit<AppPorts, "connectionEvents">;

export function createSimulatorPorts(): TransportPorts {
  const execution = new ExecutionSimulator();
  return {
    referenceData: new ReferenceDataSimulator(),
    pricing: new PricingSimulator(),
    execution,
    blotter: new TradeStoreSimulator(execution),
    analytics: new AnalyticsSimulator(),
    instruments: new InstrumentSimulator(),
    dealers: new DealerSimulator(),
    workflow: new CreditRfqSimulator(DEALERS_CATALOG),
  };
}

// `createWsRealPorts` re-exports the existing real-services factory, retyped
// as TransportPorts. The body of that factory is kept verbatim in
// services/realServiceFactory.ts during the Phase 3 transition; in Task 14
// we delete the legacy file and inline the implementation here. Until then,
// re-export to avoid duplicating ~470 lines of port wiring.
import { createRealServices } from "../../services/realServiceFactory";
import { WsAdapter } from "./WsAdapter";

export function createWsRealPorts(ws: WsAdapter): TransportPorts {
  // The two WsAdapter classes are structurally identical but TypeScript's
  // private-property check prevents direct assignment. Cast through `any`
  // for the duration of the Phase 3 transition; removed in Task 14.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createRealServices(ws as any) as TransportPorts;
}

export { WsAdapter };
