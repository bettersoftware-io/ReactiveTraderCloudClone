import type { MakeHarness } from "#/harness/harness";
import { CONTRACT_SUITES, type ContractMember } from "#/registry";

export { type Collected, collect } from "#/harness/collect";
export type { CoreHarness, MakeHarness, Suite } from "#/harness/harness";
export {
  type ScriptedDriver,
  type ScriptedPorts,
  scriptPorts,
} from "#/harness/scriptedPorts";
export {
  CONTRACT_SUITES,
  type ContractMember,
  PENDING_SUITES,
} from "#/registry";

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
}
