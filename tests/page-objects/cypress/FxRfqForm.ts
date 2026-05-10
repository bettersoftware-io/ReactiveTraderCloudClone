import type { FxRfqFormPO } from "../contracts/FxRfqForm";

function notYet(name: string): never {
  throw new Error(`CypressFxRfqForm.${name}() not yet implemented (Phase 5A.2 task >10)`);
}

export class CypressFxRfqForm implements FxRfqFormPO {
  waitForRfqButton(timeoutMs: number): Promise<void> { notYet("waitForRfqButton"); }
  clickInitiateRfq(): Promise<void> { notYet("clickInitiateRfq"); }
  waitForCountdownOrQuote(timeoutMs: number): Promise<void> { notYet("waitForCountdownOrQuote"); }
}
