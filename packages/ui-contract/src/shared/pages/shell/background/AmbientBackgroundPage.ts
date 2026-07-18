import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

/**
 * Page object for AmbientBackground. The backdrop is decorative chrome gated by
 * useAnimatedBackground: it always renders a single aria-hidden root whose
 * aurora layers are always visible at `--aurora-opacity` (v2 fidelity — the
 * backdrop is never blank); the `data-animated` flag only gates whether the
 * aurora/grid layers animate ("true" → animating, "false" → held static at
 * their current frame). There is no behaviour to drive — the page only reads
 * the rendered flag + the accessibility hint.
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

  /** The `data-power-saver` flag string; null when absent. */
  powerSaverFlag(): string | null {
    return this.el()?.dataset.powerSaver ?? null;
  }

  /**
   * True when the active ambient style's animated layer group is in the DOM
   * — `[data-layer="rays"]` (blobs+sweep) or `[data-layer="aurora-curtains"]`
   * (northern-lights curtains), whichever `ambientStyle` selected. Power
   * saver omits both groups outright, so this is `false` regardless of style
   * when it's on. Both frameworks now agree on the two `data-layer` values
   * (the ambient-style parity task retired the legacy unbranched `"aurora"`
   * value on both sides).
   */
  hasAuroraLayers(): boolean {
    return Boolean(
      this.el()?.querySelector(
        '[data-layer="rays"], [data-layer="aurora-curtains"]',
      ),
    );
  }

  /**
   * True when the given style's `data-layer` group is in the DOM —
   * `"rays"` (blobs+sweep) or `"aurora-curtains"` (northern-lights
   * curtains). Unlike {@link hasAuroraLayers}, this checks ONE specific
   * group, so a spec can assert the OTHER style's group is absent.
   */
  hasLayer(layer: "rays" | "aurora-curtains"): boolean {
    return this.el()?.querySelector(`[data-layer="${layer}"]`) !== null;
  }

  /** The `data-ambient-style` attribute value ("aurora" | "rays"); null when absent. */
  ambientStyle(): string | null {
    return this.el()?.dataset.ambientStyle ?? null;
  }
}
