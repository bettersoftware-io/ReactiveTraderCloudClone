import { BehaviorSubject, type Observable, type Subscription } from "rxjs";

import type {
  AuthViewState,
  JarvisOwnKeyPresenter as JarvisOwnKeyPresenterApi,
  JarvisPort,
  OwnKeyInput,
  OwnKeyStore,
  SavedOwnKey,
} from "@rtc/core-api";
import { createOwnKeyFold, type OwnKeyFold } from "@rtc/core-logic";

/** Implements `JarvisOwnKeyPresenter` (`@rtc/core-api`): a `BehaviorSubject`
 * over the shared `createOwnKeyFold`. `followAuth` is separate from the
 * constructor so the composition holds the subscription: ending it stops the
 * fold, intents included, and wipes nothing, because a hot swap resumes with
 * the key in place. */
export class JarvisOwnKeyPresenter implements JarvisOwnKeyPresenterApi {
  private readonly saved = new BehaviorSubject<SavedOwnKey | null>(null);

  private readonly fold: OwnKeyFold;

  readonly saved$: Observable<SavedOwnKey | null> = this.saved.asObservable();

  constructor(
    jarvis: Pick<JarvisPort, "setOwnKey">,
    store: OwnKeyStore | undefined,
  ) {
    this.fold = createOwnKeyFold({
      jarvis,
      store,
      publish: (saved: SavedOwnKey | null): void => {
        this.saved.next(saved);
      },
    });
  }

  followAuth(authState$: Observable<AuthViewState>): Subscription {
    const subscription = authState$.subscribe((auth) => {
      this.fold.readAuth(auth);
    });

    subscription.add(() => {
      this.fold.stop();
    });
    return subscription;
  }

  save(input: OwnKeyInput): void {
    this.fold.save(input);
  }

  setCap(capUsd: number | null): void {
    this.fold.setCap(capUsd);
  }

  remove(): void {
    this.fold.remove();
  }
}
