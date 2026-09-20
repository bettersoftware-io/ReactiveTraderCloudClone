import type { LayoutPresetStore } from "@rtc/client-core";

import type { World } from "./world";

/**
 * The raw preset store sitting BEHIND a World's ViewModel — the per-framework
 * half of the swap-trio registers it here, exactly as `activeDriver.ts`
 * registers the renderer, so a framework-neutral spec can reach it without
 * either client's test tree being importable from `@rtc/ui-contract`.
 *
 * It exists for ONE contract the UI cannot otherwise be shown: a listed
 * preset whose record has vanished from storage (another browser tab deleted
 * it). Only a write that bypasses the controller can produce that state — this
 * client's own `remove` republishes the list, so the row disappears with it —
 * and the World's `layoutPresetsSeed` is read once, at controller
 * construction. Every OTHER preset case goes through the menu, and must.
 */
export type LayoutPresetStoreLookup = (world: World) => LayoutPresetStore;

let lookup: LayoutPresetStoreLookup | null = null;

export function setLayoutPresetStoreLookup(
  next: LayoutPresetStoreLookup,
): void {
  lookup = next;
}

export function layoutPresetStoreFor(world: World): LayoutPresetStore {
  if (!lookup) {
    throw new Error(
      "No ui-contract layout-preset store lookup registered. Ensure the " +
        "tier's setupFiles entry (tests/ui/contract/react/setup.ts) ran " +
        "before the spec.",
    );
  }

  return lookup(world);
}
