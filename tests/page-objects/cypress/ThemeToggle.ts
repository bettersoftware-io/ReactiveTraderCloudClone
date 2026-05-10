import type { ThemeTogglePO } from "../contracts/ThemeToggle";

function notYet(name: string): never {
  throw new Error(`CypressThemeToggle.${name}() not yet implemented (Phase 5A.2 task >10)`);
}

export class CypressThemeToggle implements ThemeTogglePO {
  click(): Promise<void> { notYet("click"); }
  isVisible(): Promise<boolean> { notYet("isVisible"); }
  ariaLabel(): Promise<string> { notYet("ariaLabel"); }
}
