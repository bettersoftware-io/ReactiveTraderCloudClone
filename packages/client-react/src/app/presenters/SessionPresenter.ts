import { BehaviorSubject, combineLatest, type Observable, of } from "rxjs";
import { map, shareReplay } from "rxjs/operators";

/** The signed-in operator shown on the lock overlay. */
export interface SessionUser {
  readonly name: string;
  readonly initials: string;
  readonly role: string;
  readonly id: string;
}

/** Session view-model: whether the session is locked plus the static user. */
export interface SessionState {
  readonly locked: boolean;
  readonly user: SessionUser;
}

/**
 * The static demo operator. The app has no real auth backend (Non-goals: "No
 * real backend, real market data, real auth"), so the identity is the
 * prototype's `this.user` (Reactive Trader.dc.html:772).
 */
export const DEMO_USER: SessionUser = {
  name: "Anthony Stark",
  initials: "AS",
  role: "Senior FX Trader",
  id: "TRD-0042",
};

/**
 * App-layer presenter for the session lock/unlock state. Models lock/unlock as
 * a `BehaviorSubject<boolean>` paired with the static demo user — REAL
 * orchestration over the session seam (the lock/unlock transition is genuinely
 * wired), only the biometric readout in the view is decorative. `unlock()`
 * re-authenticates (there is no real auth, so it simply clears the lock).
 */
export class SessionPresenter {
  readonly state$: Observable<SessionState>;

  private readonly locked$ = new BehaviorSubject<boolean>(false);

  constructor(private readonly user: SessionUser = DEMO_USER) {
    this.state$ = combineLatest([this.locked$, of(this.user)]).pipe(
      map(([locked, user]): SessionState => {
        return { locked, user };
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  /** Lock the session — shows the full-screen lock overlay. */
  lock(): void {
    this.locked$.next(true);
  }

  /** Re-authenticate — clears the lock and resumes the session. */
  unlock(): void {
    this.locked$.next(false);
  }
}
