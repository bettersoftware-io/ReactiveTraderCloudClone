import type { JSX } from "solid-js";

import type { PanelId } from "@rtc/client-core";

/** Maps a panel id to the module root that fills it. The app references panels
 * only by id; this registry is the single id→component map (Task 13+ wires the
 * real module roots). */
export type PanelRegistry = Record<PanelId, () => JSX.Element>;

/** `next`'s id set, but with `previous`'s entry REFERENCE kept for every id
 * both carry — so a registry slice rebuilt from scratch (fresh closures per
 * call, e.g. `instanceRegistryFor`) stays reference-stable per id across a
 * sibling joining or leaving. The Dockview bridge's per-slot memo only
 * re-runs a panel's factory when its entry reference changes, so this is
 * what keeps an already-mounted panel's DOM (and its stream subscriptions)
 * alive. Only sound for a slice whose entry is a pure function of its id —
 * true of chart instances, whose id encodes the symbol. */
export function reuseRegistryEntries(
  previous: PanelRegistry,
  next: PanelRegistry,
): PanelRegistry {
  const entries = Object.entries(next).map(([panelId, entry]) => {
    return [panelId, previous[panelId] ?? entry] as const;
  });
  return Object.fromEntries(entries);
}
