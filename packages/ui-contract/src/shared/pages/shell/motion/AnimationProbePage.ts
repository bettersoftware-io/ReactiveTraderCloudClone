import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

export interface AnimationProbeProps {
  target: string;
}

/**
 * Page object for the AnimationProbe test fixture. Pins the
 * useAnimationIntents(target) → data-anim mapping: the attribute is present
 * and equals intent.kind when an intent is active, and absent when null.
 */
export class AnimationProbePage extends MountedComponent<AnimationProbeProps> {
  /** Current data-anim attribute value, or null when the attribute is absent. */
  animData(): string | null {
    return within(this.root).getByTestId("anim").getAttribute("data-anim");
  }
}
