import { BehaviorSubject, type Observable } from "rxjs";

/**
 * App-layer presenter for the boot-splash overlay's visibility. Mirrors
 * SessionPresenter's shape: a `BehaviorSubject<boolean>` seeded from the
 * one-shot boot-splash decision made at composition time (the browser
 * composition passes `shouldPlayBootSplash()` through the optional
 * `bootSplash` port — the environment sniffing stays out of the UI and out of
 * this framework-free core). `reboot()` re-raises the splash (the account
 * menu's ⟳ Reboot HUD row — splash replay only, no app-state reset, matching
 * the prototype) and `dismiss()` lowers it once the splash has faded out.
 */
export class BootGatePresenter {
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
