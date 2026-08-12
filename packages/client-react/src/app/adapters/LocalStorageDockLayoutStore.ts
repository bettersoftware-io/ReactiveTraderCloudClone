import type { DockLayoutStore } from "@rtc/client-core";

/**
 * localStorage-backed DockLayoutStore, one key per tab. Modelled on
 * LocalStorageSessionStore: best-effort persistence, tolerant of storage
 * failures (private mode, disabled cookies, quota) by no-oping on write and
 * returning null on read rather than throwing. The stored value is the raw
 * opaque blob string `createDockEngine` hands `onLayoutChange` — no shape
 * validation here; a corrupt blob is `createDockEngine`'s own concern (it
 * falls back to the seed tree on ANY `JSON.parse`/`fromJSON` failure).
 */
export class LocalStorageDockLayoutStore implements DockLayoutStore {
  private key(tab: string): string {
    return `rtc-dock-layout-${tab}`;
  }

  load(tab: string): string | null {
    try {
      return localStorage.getItem(this.key(tab));
    } catch {
      return null;
    }
  }

  save(tab: string, blob: string): void {
    try {
      localStorage.setItem(this.key(tab), blob);
    } catch {
      // ignore — persistence is best-effort
    }
  }
}
