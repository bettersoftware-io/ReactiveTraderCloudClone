/**
 * Pure decision function for whether the Skia ambient background should run.
 *
 * Kept dependency-free (no React/RN/reanimated/react-bindings imports) so it
 * stays importable under vitest's node environment — the hook that wires it
 * to live sources lives in `useAmbientEnabled.ts`.
 */
export function resolveAmbientEnabled(
  prefEnabled: boolean,
  reducedMotion: boolean,
): boolean {
  return prefEnabled && !reducedMotion;
}
