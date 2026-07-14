/** Shared `HH:MM:SS.mmm` timestamp formatter for the log-derived panels
 * (`EventLogPanel`, `WirePanel`) — both render `LogRow.ts` (epoch ms) the
 * same way, so the formatting lives here once instead of twice. */
export function formatLogTime(ts: number): string {
  const d = new Date(ts);
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const ms = String(d.getMilliseconds()).padStart(3, "0");

  return `${hh}:${mm}:${ss}.${ms}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
