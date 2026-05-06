import {
  distinctUntilChanged, map, type Observable, shareReplay,
} from "rxjs";
import {
  type Quote, type Rfq, type RfqStreamState,
  WorkflowEventStreamUseCase,
  CreateRfqUseCase, type CreateRfqInput,
  type WorkflowPort, type QuoteRequest,
} from "@rtc/domain";

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
}
