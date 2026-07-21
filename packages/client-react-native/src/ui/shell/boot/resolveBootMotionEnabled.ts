/**
 * Whether the Skia boot canvas should run.
 *
 * Kept dependency-free (no React/RN/reanimated imports) so it stays importable
 * under vitest's node environment; `useBootMotionEnabled.ts` wires it to live
 * sources.
 *
 * Precedence matches the web client verbatim: Freeze always wins. The
 * `forceBootAnimation` preference exists to override the OS reduced-motion
 * signal for someone who wants to watch the sequence — it must never override
 * an explicit user choice to freeze all motion.
 */
export function resolveBootMotionEnabled(
  reducedMotion: boolean,
  isFreeze: boolean,
  forced: boolean,
): boolean {
  if (isFreeze) {
    return false;
  }

  return !reducedMotion || forced;
}
