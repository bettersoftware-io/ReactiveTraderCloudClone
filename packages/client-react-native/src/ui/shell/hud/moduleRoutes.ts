/** The five trading modules, in prototype dock order (rates → equities). The
 * single source of truth for the radial dock, the status strip's MODULE
 * label, and route navigation. `path` is the expo-router href for each file
 * route under `app/(app)/`; Rates is the group's index route (`/`). */
export interface ModuleRoute {
  readonly key: string;
  readonly glyph: string;
  readonly label: string;
  readonly path: "/" | "/blotter" | "/analytics" | "/credit" | "/equities";
}

export const MODULE_ROUTES: readonly ModuleRoute[] = [
  { key: "rates", glyph: "⇅", label: "RATES", path: "/" },
  { key: "blotter", glyph: "▤", label: "BLOTTER", path: "/blotter" },
  { key: "analytics", glyph: "◵", label: "ANALYTICS", path: "/analytics" },
  { key: "credit", glyph: "◈", label: "CREDIT", path: "/credit" },
  { key: "equities", glyph: "▦", label: "EQUITIES", path: "/equities" },
];
