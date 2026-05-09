export interface ThemeTogglePO {
  isVisible(): Promise<boolean>;
  click(): Promise<void>;
  ariaLabel(): Promise<string>;
}
