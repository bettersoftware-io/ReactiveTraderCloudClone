import type { Observable } from "rxjs";

export interface OpsPort {
  getThroughput(): Observable<number>;
  setThroughput(value: number): Observable<void>;
}
