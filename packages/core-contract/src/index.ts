import type { MakeHarness } from "#/harness/harness";
import { CONTRACT_SUITES, type ContractMember } from "#/registry";
import { describePortDisciplineContract } from "#/suites/portDiscipline";

export { type FakeClock, withFakeClock } from "#/harness/clock";
export { type Collected, collect } from "#/harness/collect";
export {
  createDealer,
  createInstrument,
  createPositionUpdates,
  createPrice,
  createQuote,
  createRfq,
  createRfqQuoteResult,
  createTick,
  createTrade,
  EURUSD,
  GBPUSD,
} from "#/harness/fixtures";
export type { CoreHarness, MakeHarness, Suite } from "#/harness/harness";
export {
  createPendingQueue,
  type PendingQueue,
} from "#/harness/pendingQueue";
export {
  type PortMethodName,
  type RfqQuoteRequest,
  type ScriptedDriver,
  type ScriptedPorts,
  scriptPorts,
  type WorkflowCommand,
} from "#/harness/scriptedPorts";
export { settle } from "#/harness/settle";
export {
  CONTRACT_SUITES,
  type ContractMember,
  PENDING_SUITES,
} from "#/registry";
export { describePortDisciplineContract } from "#/suites/portDiscipline";

/** Run every registered suite against one core. Each core has exactly one
 * runner file calling this — the core-level twin of ui-contract's
 * per-framework driver trio. */
export function describeCoreContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  const entries = Object.entries(CONTRACT_SUITES) as [
    ContractMember,
    (typeof CONTRACT_SUITES)[ContractMember],
  ][];

  for (const [member, suite] of entries) {
    if (suite !== null) {
      suite(`${label} :: ${member}`, makeHarness);
    }
  }

  describePortDisciplineContract(label, makeHarness);
}
