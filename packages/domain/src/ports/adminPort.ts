import type { Observable } from "rxjs";

export interface AdminPort {
  getThroughput(): Observable<number>;
  setThroughput(value: number): Observable<void>;
}
