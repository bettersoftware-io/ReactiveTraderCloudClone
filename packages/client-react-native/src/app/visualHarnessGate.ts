/** Dev-only visual-harness switch, mirroring `bootSplashGate.ts`'s shape.
 * `EXPO_PUBLIC_*` vars are inlined by Metro at build time (see the
 * `EXPO_PUBLIC_MOTION_PROBE` precedent in `app/_layout.tsx`). Gated on BOTH
 * `__DEV__` and the env flag: `__DEV__` is hard-`false` in any release build
 * regardless of env, so a mis-set `EXPO_PUBLIC_VISUAL_HARNESS` can never
 * activate the harness in production. This is defense-in-depth — the
 * `__visual/[...id]` route renders OUTSIDE `AuthGate` (see the route-group
 * restructure), so this gate is the only barrier and must not be flip-able by
 * an env var alone. The route reads this to stay inert ("disabled") outside a
 * harness run — never absent from the bundle, only inert. */
export function visualHarnessEnabled(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_VISUAL_HARNESS === "1";
}
