import { BehaviorSubject } from "rxjs";

/** Fake presenter with one manifest-listed observable prop (`trades$`) and one
 * that's never mentioned in the manifest (`untracked$`), for
 * `instrumentPresenters` pass-through coverage. */
export class FakeBlotter {
  readonly trades$ = new BehaviorSubject<readonly string[]>([]);

  readonly untracked$ = new BehaviorSubject<number>(0);
}
