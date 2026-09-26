import type { IncidentKind, IncidentState } from "@rtc/core-api";
import type { ConnectionEvent } from "@rtc/domain";

/** The incident machine's seed, and what a `clear` returns — ONE object, so a
 * clear on pristine state re-emits the seed itself rather than an equal copy. */
export const INCIDENT_INITIAL_STATE: IncidentState = { active: [] };

// latencySpike & serviceDown break the gateway; errorBurst is degraded-but-connected.
const DISCONNECTING: ReadonlySet<IncidentKind> = new Set([
  "latencySpike",
  "serviceDown",
]);

/** One incident intent, as the pure fold sees it. */
export type IncidentEvent =
  | { readonly kind: "inject"; readonly incident: IncidentKind }
  | { readonly kind: "clear" };

/** The state transition for one incident intent. */
export function reduceIncident(
  state: IncidentState,
  event: IncidentEvent,
): IncidentState {
  if (event.kind === "clear") {
    return INCIDENT_INITIAL_STATE;
  }

  return state.active.includes(event.incident)
    ? state
    : { active: [...state.active, event.incident] };
}

/** The connection event an incident intent pushes, if any — latencySpike and
 * serviceDown break the gateway; errorBurst is degraded-but-connected; a
 * clear always reconnects. */
export function incidentConnectionEvent(
  event: IncidentEvent,
): ConnectionEvent | null {
  if (event.kind === "clear") {
    return { type: "gatewayConnected" };
  }

  return DISCONNECTING.has(event.incident)
    ? { type: "gatewayDisconnected" }
    : null;
}
