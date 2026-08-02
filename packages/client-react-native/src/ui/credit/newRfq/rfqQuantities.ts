import { CREDIT_QUANTITY_MULTIPLIER } from "@rtc/domain";

/** The desk's four standard clip sizes, offered as chips on the New-RFQ form
 * (prototype dc.html:2181).
 *
 * **These are UI-SCALE, not notional.** `CreateRfqUseCase` multiplies whatever
 * the form submits by `CREDIT_QUANTITY_MULTIPLIER` (1_000) before it reaches
 * the port, so a chip carrying the prototype's literal `1_000_000` broadcasts
 * an RFQ for 1,000,000,000. That is exactly what shipped, and only an on-device
 * run caught it: the free-text field these chips replaced took UI-scale input
 * from the operator, so the scaling was invisible until the values were
 * hardcoded here. Read the labels (`1M`) as the notional; read these numbers as
 * what the seam wants.
 *
 * Its own module rather than a `QuantityChips.tsx` export: Biome's
 * `useComponentExportOnlyModules` forbids a file from exporting both a
 * component and a non-component — the same reason `bootScene.ts` keeps the
 * `BOOT_SCENES` map out of any scene's file. */
export const RFQ_QUANTITY_CHIPS: readonly number[] = [
  1_000, 2_000, 5_000, 10_000,
];

/** dc.html:2182 — `v / 1000000 + 'M'`. The label names the NOTIONAL the desk
 * broadcasts, so it scales its input exactly as the use case will. A chip
 * reading "1000" would tell the operator nothing about what they are
 * committing to. */
export function millionsLabel(uiScaleQuantity: number): string {
  return `${(uiScaleQuantity * CREDIT_QUANTITY_MULTIPLIER) / 1_000_000}M`;
}
