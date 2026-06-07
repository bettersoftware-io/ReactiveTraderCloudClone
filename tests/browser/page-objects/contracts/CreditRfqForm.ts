export interface CreditRfqFormPO {
  waitForSubmitButton(timeoutMs: number): Promise<void>;
  hasBuyAndSellButtons(): Promise<boolean>;
  hasDirectionLabel(): Promise<boolean>;
}
