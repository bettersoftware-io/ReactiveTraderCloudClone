import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for AmbientBackground. The backdrop is decorative chrome gated by
 * useAnimatedBackground: it always renders a single aria-hidden root whose
 * `data-animated` flag mirrors the preference ("true" → aurora/grid animate,
 * "false" → calm / no visible pixels). There is no behaviour to drive — the
 * page only reads the rendered flag + the accessibility hint.
 */
export class AmbientBackgroundPage extends MountedComponent<
  Record<string, never>
> {
  private el(): HTMLElement | null {
    return within(this.root).queryByTestId("ambient-background");
  }

  /** True when the decorative backdrop root is present (it always is). */
  hasRoot(): boolean {
    return this.el() !== null;
  }

  /** The `data-animated` flag string ("true" | "false"); null when absent. */
  animatedFlag(): string | null {
    return this.el()?.dataset.animated ?? null;
  }

  /** The `aria-hidden` attribute value; null when absent. */
  ariaHidden(): string | null {
    return this.el()?.getAttribute("aria-hidden") ?? null;
  }
}
