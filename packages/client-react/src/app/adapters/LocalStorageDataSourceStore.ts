import {
  DATA_SOURCE_STORAGE_KEY,
  type DataSource,
  type DataSourceStore,
  isDataSource,
} from "@rtc/client-core";

/**
 * localStorage-backed `DataSourceStore` (hardening spec §8.2) — the last
 * login's sim/live choice, read once at composition by `buildBrowserPorts`.
 * Modelled on `LocalStorageSessionStore`: tolerant of missing, corrupt or
 * denied storage (private mode, hand-edited devtools values) by reading as
 * absent rather than throwing.
 */
export class LocalStorageDataSourceStore implements DataSourceStore {
  read(): DataSource | null {
    try {
      const raw = localStorage.getItem(DATA_SOURCE_STORAGE_KEY);
      return isDataSource(raw) ? raw : null;
    } catch {
      return null;
    }
  }

  write(source: DataSource): void {
    try {
      localStorage.setItem(DATA_SOURCE_STORAGE_KEY, source);
    } catch {
      // Best-effort persistence: a denied write only costs an extra relaunch
      // decision on the next login, which falls back to the default rule.
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(DATA_SOURCE_STORAGE_KEY);
    } catch {
      // Same best-effort posture as write().
    }
  }
}
