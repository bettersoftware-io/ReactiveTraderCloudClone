import type { Observable } from "rxjs";

import type { SessionUser } from "../auth/sessionUser.js";

export type AuthOutcome =
  | { readonly ok: true; readonly token: string; readonly user: SessionUser }
  | { readonly ok: false; readonly reason: "invalid" | "unavailable" };

export interface AuthPort {
  login(username: string, password: string): Observable<AuthOutcome>;
}
