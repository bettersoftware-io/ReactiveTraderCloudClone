import type { AnimationProbeProps } from "@ui-contract/pages/shell/motion/AnimationProbePage";
import type { JSX } from "solid-js";
import { untrack } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

/**
 * Minimal dumb probe that maps useAnimationIntents(target) → data-anim.
 * Lives in the test layer (not src/ui); its sole purpose is to pin the
 * intent→attribute contract via AnimationIntents.contract.spec.ts. Solid port
 * of the react driver's AnimationProbe.tsx: the `data-anim` attribute value
 * expression stays a call to the `intent` accessor so it re-evaluates on
 * every push, not a snapshot read once at setup.
 */
export function AnimationProbe(props: AnimationProbeProps): JSX.Element {
  const { useAnimationIntents } = useViewModel();
  // useAnimationIntents subscribes at CALL time from a plain target string,
  // not an accessor: a deliberate snapshot of the target this probe mounted
  // for, spelt `untrack`. The rendered `intent()` read below stays live.
  const intent = useAnimationIntents(
    untrack((): string => {
      return props.target;
    }),
  );

  return <div data-testid="anim" data-anim={intent()?.kind ?? undefined} />;
}
