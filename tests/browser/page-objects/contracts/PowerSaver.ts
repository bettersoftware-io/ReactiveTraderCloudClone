/**
 * Header quick toggle for the power-saver preference override
 * (PowerSaverToggle) plus the document-level `data-power-saver` flag it
 * drives (PowerSaverRoot mirrors the preference onto `<html>` for e2e
 * observability — same rationale as the theme preference's root class).
 *
 * Playwright-only: like {@link InspectorPO} and the `login` field, this
 * capability has no Cypress implementation, so the field is optional on
 * {@link PageObjects}.
 */
export interface PowerSaverPO {
  /** Click the header's power-saver quick toggle. */
  click(): Promise<void>;
  /** The document root's `data-power-saver` attribute value ("true" | "false"). */
  documentFlag(): Promise<string>;
}
