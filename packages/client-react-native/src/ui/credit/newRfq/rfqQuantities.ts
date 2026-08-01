/** The desk's four standard clip sizes, offered as chips on the New-RFQ form
 * (prototype dc.html:2181).
 *
 * Its own module rather than a `QuantityChips.tsx` export: Biome's
 * `useComponentExportOnlyModules` forbids a file from exporting both a
 * component and a non-component — the same reason `bootScene.ts` keeps the
 * `BOOT_SCENES` map out of any scene's file. */
export const RFQ_QUANTITY_CHIPS: readonly number[] = [
  1_000_000, 2_000_000, 5_000_000, 10_000_000,
];

/** dc.html:2182 — `v / 1000000 + 'M'`. A chip reading "2000000" would be
 * unreadable at 10px. */
export function millionsLabel(quantity: number): string {
  return `${quantity / 1_000_000}M`;
}
