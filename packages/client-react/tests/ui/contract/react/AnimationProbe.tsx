import type { AnimationProbeProps } from "@ui-contract/pages/shell/motion/AnimationProbePage";
import type { JSX } from "react";

import { useViewModel } from "@rtc/react-bindings";

/**
 * Minimal dumb probe that maps useAnimationIntents(target) → data-anim.
 * Lives in the test layer (not src/ui); its sole purpose is to pin the
 * intent→attribute contract via AnimationIntents.contract.spec.ts.
 */
export function AnimationProbe({ target }: AnimationProbeProps): JSX.Element {
  const { useAnimationIntents } = useViewModel();
  const intent = useAnimationIntents(target);

  return <div data-testid="anim" data-anim={intent?.kind ?? undefined} />;
}
