/** Dev-only visual-harness switch, mirroring `bootSplashGate.ts`'s shape.
 * `EXPO_PUBLIC_*` vars are inlined by Metro at build time (see the
 * `EXPO_PUBLIC_MOTION_PROBE` precedent in `app/_layout.tsx`), so a production
 * build never ships with this on unless explicitly set. The `__visual/[id]`
 * route reads this to stay inert (renders "disabled") outside a harness run —
 * it is never absent from the bundle, only inert. */
export function visualHarnessEnabled(): boolean {
  return process.env.EXPO_PUBLIC_VISUAL_HARNESS === "1";
}
