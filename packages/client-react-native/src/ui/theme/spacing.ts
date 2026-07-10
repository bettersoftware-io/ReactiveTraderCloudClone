/** Theme-independent spacing scale (4pt-based). Spacing is geometry, not colour,
 * so it lives outside RnTheme (which is per-skin×mode) and is imported directly.
 * The FX tile's original values map onto it: 14→lg, 12→md, 8→sm — so FX visuals
 * do not move. Intentionally minimal (YAGNI): only the rungs actually in use. */
export interface SpacingScale {
  readonly xs: 4;
  readonly sm: 8;
  readonly md: 12;
  readonly lg: 14;
  readonly xl: 20;
}

export const SPACING: SpacingScale = { xs: 4, sm: 8, md: 12, lg: 14, xl: 20 };
