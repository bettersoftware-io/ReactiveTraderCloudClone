import type { FooterPO } from "../contracts/Footer";

function notYet(name: string): never {
  throw new Error(`CypressFooter.${name}() not yet implemented (Phase 5A.2 task >10)`);
}

export class CypressFooter implements FooterPO {
  connectionLabel(): Promise<string> { notYet("connectionLabel"); }
  isStatusVisible(): Promise<boolean> { notYet("isStatusVisible"); }
}
