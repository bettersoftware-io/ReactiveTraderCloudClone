import type { LayoutPresetStore } from "#/adapters/layoutPresetStore";

/** Map-backed `LayoutPresetStore` — the default when no
 * `AppPorts.layoutPresetStore` is supplied and the store the shared
 * contract/visual fakes seed directly. Mirrors `InMemoryDockLayoutStore`'s
 * shape. */
export class InMemoryLayoutPresetStore implements LayoutPresetStore {
  private readonly serializedLists = new Map<string, string>();

  load(tab: string): string | null {
    return this.serializedLists.get(tab) ?? null;
  }

  save(tab: string, serialized: string): void {
    this.serializedLists.set(tab, serialized);
  }

  clear(tab: string): void {
    this.serializedLists.delete(tab);
  }
}
