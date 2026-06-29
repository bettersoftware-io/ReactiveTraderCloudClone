import type { JSX } from "react";

import { useHooks } from "#/ui/hooks/useHooks";
import type { AnimationProbeProps } from "#tests/ui/contract/shared/pages/shell/motion/AnimationProbePage";

/**
 * Minimal dumb probe that maps useAnimationIntents(target) → data-anim.
 * Lives in the test layer (not src/ui); its sole purpose is to pin the
 * intent→attribute contract via AnimationIntents.contract.spec.ts.
 */
export function AnimationProbe({ target }: AnimationProbeProps): JSX.Element {
  const { useAnimationIntents } = useHooks();
  const intent = useAnimationIntents(target);

  return <div data-testid="anim" data-anim={intent?.kind ?? undefined} />;
}
