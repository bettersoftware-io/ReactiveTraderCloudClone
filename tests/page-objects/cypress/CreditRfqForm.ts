import type { CreditRfqFormPO } from "../contracts/CreditRfqForm";

function notYet(name: string): never {
  throw new Error(`CypressCreditRfqForm.${name}() not yet implemented (Phase 5A.2 task >10)`);
}

export class CypressCreditRfqForm implements CreditRfqFormPO {
  waitForSubmitButton(timeoutMs: number): Promise<void> { notYet("waitForSubmitButton"); }
  hasBuyAndSellButtons(): Promise<boolean> { notYet("hasBuyAndSellButtons"); }
  hasDirectionLabel(): Promise<boolean> { notYet("hasDirectionLabel"); }
}
