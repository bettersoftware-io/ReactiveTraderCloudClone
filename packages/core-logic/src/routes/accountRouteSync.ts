import type {
  AccountAccessIntents,
  AccountAccessState,
  AccountNavigation,
  AccountRouteMode,
  AppRoute,
  RouteHistory,
} from "@rtc/core-api";

import { accountRoute, isSameRoute } from "#/routes/appRoutes";

const NAVIGATION_MODES: Readonly<Record<AccountNavigation, AccountRouteMode>> =
  {
    returnToSignIn: "signIn",
    startRegistration: "register",
    startReset: "requestReset",
    startCodeEntry: "enterCode",
  };

const MODE_NAVIGATIONS: Readonly<Record<AccountRouteMode, AccountNavigation>> =
  {
    signIn: "returnToSignIn",
    register: "startRegistration",
    requestReset: "startReset",
    enterCode: "startCodeEntry",
  };

/** The route the URL shows for a phase (spec §6). The reset code step has
 * no route of its own: no intent reopens it with nothing held. */
export function accountRouteOf(state: AccountAccessState): AppRoute {
  switch (state.phase) {
    case "register":
      return accountRoute("register");
    case "requestReset":
      return accountRoute("requestReset");
    case "code":
      return accountRoute(
        state.flow === "signup" ? "enterCode" : "requestReset",
      );
    case "signIn":
    case "pendingApproval":
    case "passwordUnset":
    case "passwordChanged":
      return accountRoute("signIn");
  }
}

/** True when the URL already shows the phase. The sign-in form also shows
 * on a workspace route: a signed-out visitor keeps the tab they asked for,
 * and lands on it once signed in. */
export function accountRouteShows(
  state: AccountAccessState,
  route: AppRoute | null,
): boolean {
  if (state.phase === "signIn" && route?.area === "workspace") {
    return true;
  }

  return isSameRoute(route, accountRouteOf(state));
}

export interface AccountRouteSyncDeps {
  readonly routes: RouteHistory;
  readonly intents: Pick<AccountAccessIntents, AccountNavigation>;
  /** False on a page with no server: only the sign-in form is reachable. */
  readonly registrationAvailable: boolean;
}

export interface AccountRouteSync {
  /** Every state the machine emits, the first one included: the first
   * call opens the mode the URL names, later ones keep the URL in step.
   * Observing the state last observed does nothing. */
  observe(state: AccountAccessState): void;
  /** One of the login screen's links: a new history entry, then the intent. */
  navigate(navigation: AccountNavigation): void;
  dispose(): void;
}

export function createAccountRouteSync({
  routes,
  intents,
  registrationAvailable,
}: AccountRouteSyncDeps): AccountRouteSync {
  let opened = false;
  let lastObserved: AccountAccessState | null = null;
  const unsubscribe = routes.subscribe(openRequestedMode);

  /** The mode a URL asks for: an account route's own (sign in only, on a
   * page without registration), or the sign-in form for a workspace route
   * or none. A route the page cannot honour is rewritten first. */
  function openRequestedMode(route: AppRoute | null): void {
    if (route?.area === "workspace") {
      intents.returnToSignIn();
      return;
    }

    const mode =
      route !== null && registrationAvailable ? route.mode : "signIn";
    const target = accountRoute(mode);

    if (!isSameRoute(route, target)) {
      routes.replace(target);
    }

    intents[MODE_NAVIGATIONS[mode]]();
  }

  return {
    observe: (state: AccountAccessState): void => {
      if (state === lastObserved) {
        return;
      }

      // Before any write or intent: an intent can re-enter this call.
      lastObserved = state;

      if (!opened) {
        opened = true;
        openRequestedMode(routes.current());
        return;
      }

      if (!accountRouteShows(state, routes.current())) {
        routes.replace(accountRouteOf(state));
      }
    },
    navigate: (navigation: AccountNavigation): void => {
      const target = accountRoute(NAVIGATION_MODES[navigation]);

      if (!isSameRoute(routes.current(), target)) {
        routes.push(target);
      }

      intents[navigation]();
    },
    dispose: unsubscribe,
  };
}
