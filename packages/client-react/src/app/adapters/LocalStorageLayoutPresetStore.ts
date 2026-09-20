import type { LayoutPresetStore } from "@rtc/client-core";

/**
 * localStorage-backed LayoutPresetStore, one key per tab. Copy of
 * LocalStorageDockLayoutStore: best-effort persistence, tolerant of storage
 * failures (private mode, disabled cookies, quota) by no-oping on write and
 * returning null on read rather than throwing. The stored value is the raw
 * opaque serialized list string `createLayoutPresets` hands `store.save` —
 * no shape validation here; an unreadable record or whole-list is
 * `layoutPresetCodec`'s own concern (client-core owns every rule once).
 */
export class LocalStorageLayoutPresetStore implements LayoutPresetStore {
  private key(tab: string): string {
    return `rtc-layout-presets-${tab}`;
  }

  load(tab: string): string | null {
    try {
      return localStorage.getItem(this.key(tab));
    } catch {
      return null;
    }
  }

  save(tab: string, serialized: string): void {
    try {
      localStorage.setItem(this.key(tab), serialized);
    } catch {
      // ignore — persistence is best-effort
    }
  }

  clear(tab: string): void {
    try {
      localStorage.removeItem(this.key(tab));
    } catch {
      // ignore — best-effort, matches save
    }
  }
}
