import type { WorkspaceTab } from "#/layout";

/** A login-screen mode a URL can name. The code step of the reset flow and
 * the three notices have no route of their own (spec §6). */
export type AccountRouteMode =
  | "signIn"
  | "register"
  | "requestReset"
  | "enterCode";

/** The four `accountAccess` intents that only change the screen. */
export type AccountNavigation =
  | "returnToSignIn"
  | "startRegistration"
  | "startReset"
  | "startCodeEntry";

/** What a hash route names: a workspace tab or a login-screen mode. */
export type AppRoute =
  | { readonly area: "workspace"; readonly tab: WorkspaceTab }
  | { readonly area: "account"; readonly mode: AccountRouteMode };

/** The page's history, as routes. A subscriber hears history traversal
 * (Back, Forward, an edited hash) only — never this port's own push or
 * replace. A host without one (React Native, most tests) has no routing. */
export interface RouteHistory {
  /** The route the URL names now, or null for none. */
  current(): AppRoute | null;
  /** A new history entry. */
  push(route: AppRoute): void;
  /** Rewrites the current history entry. */
  replace(route: AppRoute): void;
  subscribe(listener: (route: AppRoute | null) => void): () => void;
}
