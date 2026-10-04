import { BehaviorSubject, type Observable } from "rxjs";

import type { BootGatePresenter as BootGatePresenterApi } from "@rtc/core-api";

/** Implements `BootGatePresenter` (`@rtc/core-api`) — see the interface for
 * the contract. Mirrors `SessionPresenter`'s shape: a
 * `BehaviorSubject<boolean>` seeded via the composition-injected
 * `bootSplash` port's `shouldPlayBootSplash()` — the environment sniffing
 * stays out of this framework-free core. */
export class BootGatePresenter implements BootGatePresenterApi {
  readonly visible$: Observable<boolean>;

  private readonly visibleSubject$: BehaviorSubject<boolean>;

  constructor(initiallyVisible = true) {
    this.visibleSubject$ = new BehaviorSubject<boolean>(initiallyVisible);
    this.visible$ = this.visibleSubject$.asObservable();
  }

  /**
   * Synchronous current visibility. UI bindings seed their first-render
   * default from this so a `?nosplash`/webdriver load never flashes the
   * opaque splash for one frame before the stream's real value lands.
   */
  get visible(): boolean {
    return this.visibleSubject$.getValue();
  }

  /** Re-raise the boot splash (Reboot HUD). Splash replay only. */
  reboot(): void {
    this.visibleSubject$.next(true);
  }

  /** Lower the boot splash once its fade-out completes (or is skipped). */
  dismiss(): void {
    this.visibleSubject$.next(false);
  }
}
