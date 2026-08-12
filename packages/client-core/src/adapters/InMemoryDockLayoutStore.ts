import type { DockLayoutStore } from "#/adapters/dockLayoutStore";

/** Map-backed `DockLayoutStore` — the default when no `AppPorts.dockLayoutStore`
 * is supplied (Presenters.dockLayoutStore's fallback) and the store the shared
 * contract/visual fakes seed directly. Mirrors `InMemorySessionStore`'s shape. */
export class InMemoryDockLayoutStore implements DockLayoutStore {
  private readonly blobs = new Map<string, string>();

  load(tab: string): string | null {
    return this.blobs.get(tab) ?? null;
  }

  save(tab: string, blob: string): void {
    this.blobs.set(tab, blob);
  }
}
