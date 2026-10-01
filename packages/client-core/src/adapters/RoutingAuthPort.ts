import { EMPTY, type Observable, of, switchMap } from "rxjs";

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

/**
 * The hybrid login (hardening spec §8). Demo credentials never leave the
 * browser: the server is only asked once the local roster has rejected them,
 * and a credential MATCH (username and password) is what routes locally, so a
 * demo username with another password is an ordinary server login.
 *
 * Same-mode success: record the choice, emit the outcome — the presenter
 * writes the session and the app renders. Cross-mode success: write the
 * session ourselves (the presenter never sees this outcome), record the
 * choice, relaunch, and COMPLETE WITHOUT EMITTING — the login screen stays in
 * its authenticating state for the milliseconds until the page unloads, and
 * the reloaded page resumes the stored session into the right composition
 * (spec §8.3). The session is written before `relaunch()` on purpose: a page
 * that reloaded first would find nothing to resume.
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
    return EMPTY;
  }

  return {
    login(username: string, password: string): Observable<AuthOutcome> {
      return deps.demo.login(username, password).pipe(
        switchMap((local): Observable<AuthOutcome> => {
          if (local.ok) {
            return settle(username, "sim", local);
          }

          return deps.live.login(username, password).pipe(
            switchMap((remote): Observable<AuthOutcome> => {
              return remote.ok ? settle(username, "live", remote) : of(remote);
            }),
          );
        }),
      );
    },
  };
}
