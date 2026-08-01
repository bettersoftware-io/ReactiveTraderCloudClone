import type { Observable } from "rxjs";

import type { JarvisEvent } from "@rtc/shared";

export type { JarvisEvent } from "@rtc/shared";

/**
 * Application-layer chat port (deliberately NOT in domain/ports — chat is an
 * app concern; @rtc/domain stays byte-identical in phase 1). The event union
 * mirrors what the phase-2 JARVIS_* wire messages will carry, so swapping in
 * a WsJarvisAdapter is invisible to JarvisMachine.
 */
export interface JarvisPort {
  /** Run one turn. Emits reply events; completes after "done" or "error". */
  ask(text: string): Observable<JarvisEvent>;
  /** Resolve a pending confirmRequest (approve or decline). */
  confirm(confirmationId: string, approved: boolean): void;
}
