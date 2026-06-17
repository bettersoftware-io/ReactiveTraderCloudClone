import {
  distinctUntilChanged, map, type Observable, shareReplay,
  Subject, merge, of, timer, concat, EMPTY,
  catchError, switchMap, takeUntil,
} from "rxjs";
import { state, type StateObservable } from "@rx-state/core";
import {
  type Quote, type Rfq, type RfqStreamState,
  WorkflowEventStreamUseCase,
  CreateRfqUseCase, type CreateRfqInput,
  type WorkflowPort, type QuoteRequest,
} from "@rtc/domain";
import type { Machine } from "./machine";

/** Delay between confirming a freshly-created RFQ and redirecting the user back
 * to the RFQ list. Presenter-local — a UI cadence concern, not a domain
 * constant. Relocated from NewRfqForm's `setTimeout(..., 1500)`. */
const REDIRECT_DELAY_MS = 1500;

/** The create→confirmation→redirect lifecycle of NewRfqForm, relocated out of
 * the component's `await createRfq(...)` + `setTimeout` orchestration. The form
 * reads this state; draft input state stays in the component. */
export type RfqSubmissionState =
  | { status: "editing" }
  | { status: "submitting" }
  | { status: "confirmed"; rfqId: number };

export interface RfqSubmissionIntents {
  /** Submit the drafted RFQ; on success confirm, then fire onRedirect(rfqId)
   * after REDIRECT_DELAY_MS. */
  submit: (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => void;
}

/** The submit-price / pass lifecycle of TradeTicket, relocated out of the
 * component's `await quoteRfq(...)` / `await passQuote(...)` + `submitted`
 * useState. The price draft + parseFloat guard stay in the component. */
export interface TicketSubmissionState {
  submitted: boolean;
}

export interface TicketSubmissionIntents {
  submitPrice: (quoteId: number, price: number) => void;
  pass: (quoteId: number) => void;
}

function shallowArrayEquals<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class RfqsPresenter {
  private readonly state$: Observable<RfqStreamState>;
  readonly rfqs$: Observable<readonly Rfq[]>;
  readonly allQuotes$: Observable<ReadonlyMap<number, Quote>>;
  private readonly quotesByRfqCache = new Map<number, Observable<readonly Quote[]>>();

  constructor(private readonly workflow: WorkflowPort) {
    this.state$ = new WorkflowEventStreamUseCase(workflow).execute().pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.rfqs$ = this.state$.pipe(
      map((s) => Array.from(s.rfqs.values())),
      distinctUntilChanged(shallowArrayEquals),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.allQuotes$ = this.state$.pipe(
      map((s) => s.quotes),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  quotesForRfq$(rfqId: number): Observable<readonly Quote[]> {
    const cached = this.quotesByRfqCache.get(rfqId);
    if (cached) return cached;
    const stream = this.state$.pipe(
      map((s) => Array.from(s.quotes.values()).filter((q) => q.rfqId === rfqId)),
      distinctUntilChanged(shallowArrayEquals),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.quotesByRfqCache.set(rfqId, stream);
    return stream;
  }

  createRfq(input: CreateRfqInput): Observable<number> {
    return new CreateRfqUseCase(this.workflow).execute(input);
  }
  acceptQuote(quoteId: number): Observable<void> {
    return this.workflow.accept(quoteId);
  }
  cancelRfq(rfqId: number): Observable<void> {
    return this.workflow.cancelRfq(rfqId);
  }
  passQuote(quoteId: number): Observable<void> {
    return this.workflow.pass(quoteId);
  }
  quoteRfq(request: QuoteRequest): Observable<void> {
    return this.workflow.quote(request);
  }

  /** Per-mount machine for NewRfqForm's create→confirm→redirect flow. submit()
   * goes editing→submitting, calls the internal create-RFQ Observable, and on
   * success goes confirmed{rfqId} then fires onRedirect after REDIRECT_DELAY_MS.
   * dispose() cancels a pending redirect timer if torn down before it fires. */
  createSubmission(): Machine<RfqSubmissionState, RfqSubmissionIntents> {
    const submit$ = new Subject<{
      input: CreateRfqInput;
      onRedirect: (rfqId: number) => void;
    }>();

    const EDITING: RfqSubmissionState = { status: "editing" };
    const SUBMITTING: RfqSubmissionState = { status: "submitting" };

    const runs$ = submit$.pipe(
      switchMap(({ input, onRedirect }) =>
        concat(
          of(SUBMITTING),
          this.createRfq(input).pipe(
            switchMap((rfqId) =>
              merge(
                of<RfqSubmissionState>({ status: "confirmed", rfqId }),
                // Redirect after the delay. The mapped emission carries no new
                // state — it only side-effects onRedirect — so we drop it with
                // EMPTY tail; dispose() (completing submit$) tears the timer down.
                timer(REDIRECT_DELAY_MS).pipe(
                  switchMap(() => {
                    onRedirect(rfqId);
                    return EMPTY;
                  }),
                ),
              ),
            ),
            // A failed create returns to editing so the user can retry.
            catchError(() => of(EDITING)),
          ),
        ),
      ),
    );

    const state$: StateObservable<RfqSubmissionState> = state(runs$, EDITING);
    const warm = state$.subscribe();

    return {
      state$,
      intents: {
        submit: (input, onRedirect) => submit$.next({ input, onRedirect }),
      },
      dispose: () => {
        submit$.complete();
        warm.unsubscribe();
      },
    };
  }

  /** Per-mount machine for TradeTicket's submit-price / pass flow. Either intent
   * runs the corresponding internal Observable and, on success, flips
   * submitted:true (mirroring the component's old `setSubmitted(true)` after the
   * awaited command resolved). dispose() tears the subscription down. */
  createTicketSubmission(): Machine<
    TicketSubmissionState,
    TicketSubmissionIntents
  > {
    const action$ = new Subject<Observable<void>>();

    const NOT_SUBMITTED: TicketSubmissionState = { submitted: false };
    const SUBMITTED: TicketSubmissionState = { submitted: true };

    // Each action runs its command; success flips submitted:true. takeUntil is
    // unnecessary — these are one-shot commands — but a failed command leaves
    // submitted:false so the user can retry (matching the component, which only
    // set submitted after a resolved await).
    const runs$ = action$.pipe(
      switchMap((command$) =>
        command$.pipe(
          map((): TicketSubmissionState => SUBMITTED),
          catchError(() => of(NOT_SUBMITTED)),
        ),
      ),
    );

    const state$: StateObservable<TicketSubmissionState> = state(
      runs$,
      NOT_SUBMITTED,
    );
    const warm = state$.subscribe();

    return {
      state$,
      intents: {
        submitPrice: (quoteId, price) =>
          action$.next(this.quoteRfq({ quoteId, price })),
        pass: (quoteId) => action$.next(this.passQuote(quoteId)),
      },
      dispose: () => {
        action$.complete();
        warm.unsubscribe();
      },
    };
  }
}
