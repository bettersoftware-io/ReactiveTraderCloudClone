/**
 * The hybrid data-source decision (hardening spec §8.2): which port set a
 * page composes — the in-browser simulators (`sim`) or the real WebSocket
 * transport (`live`) — chosen ONCE at load, before the login screen, from
 * the build's server URL, whether a demo roster was inlined, and what the
 * last login stored. Framework-free: the clients supply the storage.
 */
export type DataSource = "sim" | "live";

/** `localStorage` key the routing auth port writes on every successful login. */
export const DATA_SOURCE_STORAGE_KEY = "rtc.dataSource";

const DATA_SOURCES: readonly string[] = ["sim", "live"];

export function isDataSource(value: unknown): value is DataSource {
  return typeof value === "string" && DATA_SOURCES.includes(value);
}

/** The client-supplied persistence for the last login's data source. */
export interface DataSourceStore {
  read(): DataSource | null;
  write(source: DataSource): void;
  clear(): void;
}

/** Which rule picked the source — logged at composition so a surprising
 * mode is diagnosable from the console (mirrors `[core] booted … from …`). */
export type DataSourceReason =
  | "no-server-url"
  | "no-demo-roster"
  | "stored"
  | "session-without-choice"
  | "default";

export interface DataSourceDecision {
  readonly source: DataSource;
  /** True only when BOTH a server URL and a demo roster exist — the one
   * shape in which a login can change the composed source. */
  readonly hybrid: boolean;
  readonly reason: DataSourceReason;
}

export interface ResolveDataSourceInput {
  /** `VITE_SERVER_URL`; empty/undefined means there is no server to talk to. */
  readonly serverUrl: string | undefined;
  /** Whether `VITE_DEMO_AUTH` parsed to at least one credential. */
  readonly hasDemoRoster: boolean;
  /** The stored choice, or null when absent/corrupt. */
  readonly stored: DataSource | null;
  /** Whether a session is stored — a pre-hybrid live session has one and no choice. */
  readonly hasStoredSession: boolean;
}

/**
 * Spec §8.2's table. No server URL → sim (today's simulator mode, also the
 * simulator-only fallback build). Server URL without a demo roster → live
 * (today's WS-real mode, byte for byte — every dev/e2e flow lands here).
 * Both → hybrid: the stored choice decides; with no choice, a stored
 * session means a live login that predates the choice, else sim.
 */
export function resolveDataSource(
  input: ResolveDataSourceInput,
): DataSourceDecision {
  if (!input.serverUrl) {
    return { source: "sim", hybrid: false, reason: "no-server-url" };
  }

  if (!input.hasDemoRoster) {
    return { source: "live", hybrid: false, reason: "no-demo-roster" };
  }

  if (input.stored !== null) {
    return { source: input.stored, hybrid: true, reason: "stored" };
  }

  if (input.hasStoredSession) {
    return { source: "live", hybrid: true, reason: "session-without-choice" };
  }

  return { source: "sim", hybrid: true, reason: "default" };
}

export function formatDataSourceMessage(decision: DataSourceDecision): string {
  const suffix = decision.hybrid ? " (hybrid)" : "";
  return `[data] composed ${decision.source} from ${decision.reason}${suffix}`;
}
