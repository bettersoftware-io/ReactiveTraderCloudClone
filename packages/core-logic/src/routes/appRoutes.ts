import type { AccountRouteMode, AppRoute, WorkspaceTab } from "@rtc/core-api";

export function workspaceRoute(tab: WorkspaceTab): AppRoute {
  return { area: "workspace", tab };
}

export function accountRoute(mode: AccountRouteMode): AppRoute {
  return { area: "account", mode };
}

/** The slug of every tab and every login mode. Keyed by the unions, so a
 * new `WorkspaceTab` or `AccountRouteMode` without a slug fails typecheck;
 * the reader below is built from these same tables, so the reader and the
 * writer cannot disagree. */
const WORKSPACE_SLUGS: Readonly<Record<WorkspaceTab, string>> = {
  fx: "fx",
  credit: "credit",
  equities: "equities",
  admin: "admin",
};

const ACCOUNT_SLUGS: Readonly<Record<AccountRouteMode, string>> = {
  signIn: "sign-in",
  register: "create-account",
  requestReset: "forgot-password",
  enterCode: "enter-code",
};

const ROUTES_BY_SLUG: ReadonlyMap<string, AppRoute> = new Map<string, AppRoute>(
  [
    ...(Object.keys(WORKSPACE_SLUGS) as WorkspaceTab[]).map((tab) => {
      return [WORKSPACE_SLUGS[tab], workspaceRoute(tab)] as const;
    }),
    ...(Object.keys(ACCOUNT_SLUGS) as AccountRouteMode[]).map((mode) => {
      return [ACCOUNT_SLUGS[mode], accountRoute(mode)] as const;
    }),
  ],
);

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

  return ROUTES_BY_SLUG.get(hash.slice(HASH_PREFIX.length)) ?? null;
}

export function formatAppRoute(route: AppRoute): string {
  const slug =
    route.area === "workspace"
      ? WORKSPACE_SLUGS[route.tab]
      : ACCOUNT_SLUGS[route.mode];

  return `${HASH_PREFIX}${slug}`;
}
