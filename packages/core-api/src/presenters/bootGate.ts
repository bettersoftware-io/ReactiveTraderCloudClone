import type { Stream } from "#/stream";

/**
 * The boot-splash overlay's visibility, seeded from the one-shot boot-splash
 * decision made at composition time. `reboot()` re-raises the splash (the
 * account menu's ⟳ Reboot HUD row — splash replay only, no app-state reset)
 * and `dismiss()` lowers it once the splash has faded out.
 */
export interface BootGatePresenter {
  readonly visible$: Stream<boolean>;
  /**
   * Synchronous current visibility. UI bindings seed their first-render
   * default from this so a `?nosplash`/webdriver load never flashes the
   * opaque splash for one frame before the stream's real value lands.
   */
  readonly visible: boolean;
  /** Re-raise the boot splash (Reboot HUD). Splash replay only. */
  reboot(): void;
  /** Lower the boot splash once its fade-out completes (or is skipped). */
  dismiss(): void;
}
