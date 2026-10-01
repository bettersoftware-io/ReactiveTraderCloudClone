import { catchError, mergeMap, NEVER, type Observable, of } from "rxjs";

import type { AuthOutcome, AuthPort } from "@rtc/domain";

import type { DataSource, DataSourceStore } from "./dataSource.js";
import type { SessionStore, StoredSession } from "./sessionStore.js";

export interface RoutingAuthPortDeps {
  /** Verifies the committed demo roster IN THE BROWSER (an `AuthSimulator`). */
  readonly demo: AuthPort;
  /** The server's `/login` (an `HttpAuthAdapter`). Tried only after `demo` says no. */
  readonly live: AuthPort;
  /** The data source THIS page composed — a login that resolves to the other
   * one cannot be served in place (ports are composed once, before login). */
  readonly composed: DataSource;
  readonly sessionStore: SessionStore;
  readonly dataSourceStore: DataSourceStore;
  /** Slot: reloads the page so the next composition reads the stored choice. */
  readonly relaunch: () => void;
}

interface AuthenticatedShape {
  readonly ok: true;
}

type Authenticated = Extract<AuthOutcome, AuthenticatedShape>;

const NO_LOCAL_MATCH: AuthOutcome = { ok: false, reason: "invalid" };
const UNAVAILABLE: AuthOutcome = { ok: false, reason: "unavailable" };

/**
 * The hybrid login (hardening spec §8). Demo credentials never leave the
 * browser: the server is only asked once the local roster has rejected them,
 * and a credential MATCH (username and password) is what routes locally, so a
 * demo username with another password is an ordinary server login.
 *
 * Same-mode success: record the choice, emit the outcome — the presenter
 * writes the session and the app renders. Cross-mode success: write the
 * session ourselves (the presenter never sees this outcome), record the
 * choice, relaunch, and NEVER EMIT — the login screen stays in its
 * authenticating state for the milliseconds until the page unloads, and the
 * reloaded page resumes the stored session into the right composition (spec
 * §8.3). `NEVER`, not `EMPTY`: the async and Effect cores await the first
 * value (`once` / `rpc`) and treat a completion WITHOUT one as an error they
 * rethrow out of band, so an `EMPTY` here would surface an uncaught exception
 * on every mode change in those two cores while the RxJS core stayed quiet —
 * a behavioural difference between cores. A pending observable is torn down
 * with the page (or the presenter's lifetime) and is silent in all three.
 * The session is written before `relaunch()` on purpose: a page that
 * reloaded first would find nothing to resume.
 *
 * Each leg is error-isolated: an ERRORING `demo` observable reads as "no local
 * match" and falls through to the server; an erroring `live` one reads as the
 * server being unavailable. Today neither errors (`AuthSimulator` is `of()`,
 * `HttpAuthAdapter` catches to `unavailable`), so this is cheap insurance,
 * not a path the tests saw fail in production.
 */
export function createRoutingAuthPort(deps: RoutingAuthPortDeps): AuthPort {
  function settle(
    username: string,
    target: DataSource,
    outcome: Authenticated,
  ): Observable<AuthOutcome> {
    deps.dataSourceStore.write(target);

    if (target === deps.composed) {
      return of(outcome);
    }

    const session: StoredSession = {
      token: outcome.token,
      user: outcome.user,
      username,
      exp: outcome.exp,
    };
    deps.sessionStore.write(session);
    deps.relaunch();
    return NEVER;
  }

  function askServer(
    username: string,
    password: string,
  ): Observable<AuthOutcome> {
    return deps.live.login(username, password).pipe(
      catchError((): Observable<AuthOutcome> => {
        return of(UNAVAILABLE);
      }),
      mergeMap((remote): Observable<AuthOutcome> => {
        return remote.ok ? settle(username, "live", remote) : of(remote);
      }),
    );
  }

  return {
    login(username: string, password: string): Observable<AuthOutcome> {
      return deps.demo.login(username, password).pipe(
        catchError((): Observable<AuthOutcome> => {
          return of(NO_LOCAL_MATCH);
        }),
        mergeMap((local): Observable<AuthOutcome> => {
          return local.ok
            ? settle(username, "sim", local)
            : askServer(username, password);
        }),
      );
    },
  };
}
