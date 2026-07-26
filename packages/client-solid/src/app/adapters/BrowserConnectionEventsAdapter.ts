import { Observable } from "rxjs";

import {
  type ConnectionEvent,
  type ConnectionEventsPort,
  IDLE_TIMEOUT_MS,
} from "@rtc/domain";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
] as const;

export class BrowserConnectionEventsAdapter implements ConnectionEventsPort {
  events(): Observable<ConnectionEvent> {
    return new Observable<ConnectionEvent>((subscriber) => {
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      function armIdleTimer(): void {
        if (idleTimer) {
          clearTimeout(idleTimer);
        }

        idleTimer = setTimeout(() => {
          subscriber.next({ type: "idleTimeout" });
        }, IDLE_TIMEOUT_MS);
      }

      function emitUserActivity(): void {
        subscriber.next({ type: "userActivity" });
        armIdleTimer();
      }

      function emitBrowserOnline(): void {
        subscriber.next({ type: "browserOnline" });
      }

      function emitBrowserOffline(): void {
        subscriber.next({ type: "browserOffline" });
      }

      for (const eventName of ACTIVITY_EVENTS) {
        window.addEventListener(eventName, emitUserActivity, { passive: true });
      }

      window.addEventListener("online", emitBrowserOnline);
      window.addEventListener("offline", emitBrowserOffline);
      armIdleTimer();

      return (): void => {
        for (const eventName of ACTIVITY_EVENTS) {
          window.removeEventListener(eventName, emitUserActivity);
        }

        window.removeEventListener("online", emitBrowserOnline);
        window.removeEventListener("offline", emitBrowserOffline);

        if (idleTimer) {
          clearTimeout(idleTimer);
        }
      };
    });
  }
}
