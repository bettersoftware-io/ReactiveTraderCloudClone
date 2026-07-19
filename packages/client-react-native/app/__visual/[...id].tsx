import { useLocalSearchParams } from "expo-router";
import type { JSX } from "react";
import { Text } from "react-native";

import { getScenario } from "#/../tests/visual/scenarios";
import { visualHarnessEnabled } from "#/app/visualHarnessGate";

/**
 * Dev-only visual-harness route: renders exactly one registered `Scenario`
 * (see `tests/visual/scenarios.ts`) on sim ports, pinned skin/mode, frozen
 * motion — the surface the capture drivers (Tasks 1.x-3.x) screenshot.
 *
 * A CATCH-ALL segment (`[...id]`, not `[id]`), because scenario ids are
 * namespaced with a slash (`"blotter/empty"`, `"credit/rfq-tiles-empty"`) —
 * a single dynamic segment would only ever match the last path component.
 *
 * Lives under the top-level `app/` directory (NOT `src/app/`, which
 * `app.config.ts`'s `extra.router.root: "./app"` deliberately excludes from
 * routing — `src/app/` holds the composition-root/adapters, not routes).
 *
 * Inert (not absent) unless `EXPO_PUBLIC_VISUAL_HARNESS === "1"` — importing
 * `getScenario`/the leaves it composes is fine even when disabled, since the
 * gate short-circuits before anything renders.
 *
 * The `(app)` route group (the authed shell) renders its active route via a
 * generic `<Slot/>` plus a `RadialCommandDock` for module navigation — there
 * is no tab navigator. `__visual/[...id]` is a top-level sibling of `(app)`
 * (registered directly under this root `_layout.tsx`, outside the group), so
 * it is unaffected by the dock or `(app)`'s `<Slot/>` and reachable via
 * `router.push`/a deep link without surfacing anywhere in the app's own
 * navigation.
 */
type VisualHarnessParams = {
  id: string | string[];
};

export default function VisualHarnessRoute(): JSX.Element {
  const { id } = useLocalSearchParams<VisualHarnessParams>();

  if (!visualHarnessEnabled()) {
    return <Text>disabled</Text>;
  }

  const scenarioId = Array.isArray(id) ? id.join("/") : id;
  const scenario =
    typeof scenarioId === "string" ? getScenario(scenarioId) : undefined;

  if (!scenario) {
    return (
      <Text testID="visual-not-found">no scenario: {String(scenarioId)}</Text>
    );
  }

  return <>{scenario.build()}</>;
}
