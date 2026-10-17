import type { AccountRouteMode, AppRoute, WorkspaceTab } from "@rtc/core-api";

export function workspaceRoute(tab: WorkspaceTab): AppRoute {
  return { area: "workspace", tab };
}

export function accountRoute(mode: AccountRouteMode): AppRoute {
  return { area: "account", mode };
}

/** One table for both directions, so the reader and the writer cannot
 * disagree. */
const ROUTE_SLUGS: readonly (readonly [string, AppRoute])[] = [
  ["fx", workspaceRoute("fx")],
  ["credit", workspaceRoute("credit")],
  ["equities", workspaceRoute("equities")],
  ["admin", workspaceRoute("admin")],
  ["sign-in", accountRoute("signIn")],
  ["create-account", accountRoute("register")],
  ["forgot-password", accountRoute("requestReset")],
  ["enter-code", accountRoute("enterCode")],
];

const HASH_PREFIX = "#/";

export function isSameRoute(a: AppRoute | null, b: AppRoute | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }

  if (a.area === "workspace") {
    return b.area === "workspace" && a.tab === b.tab;
  }

  return b.area === "account" && a.mode === b.mode;
}

/** The route a `location.hash` names; null for an empty, unknown or
 * malformed hash. */
export function parseAppRoute(hash: string): AppRoute | null {
  if (!hash.startsWith(HASH_PREFIX)) {
    return null;
  }

  const slug = hash.slice(HASH_PREFIX.length);
  const entry = ROUTE_SLUGS.find(([candidate]) => {
    return candidate === slug;
  });

  return entry === undefined ? null : entry[1];
}

export function formatAppRoute(route: AppRoute): string {
  const entry = ROUTE_SLUGS.find(([, candidate]) => {
    return isSameRoute(candidate, route);
  });

  // Every AppRoute has a row: the table covers both unions exhaustively.
  return `${HASH_PREFIX}${entry?.[0] ?? ""}`;
}
