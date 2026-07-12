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

      function onActivity(): void {
        subscriber.next({ type: "userActivity" });
        armIdleTimer();
      }

      function onOnline(): void {
        subscriber.next({ type: "browserOnline" });
      }

      function onOffline(): void {
        subscriber.next({ type: "browserOffline" });
      }

      for (const eventName of ACTIVITY_EVENTS) {
        window.addEventListener(eventName, onActivity, { passive: true });
      }

      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      armIdleTimer();

      return (): void => {
        for (const eventName of ACTIVITY_EVENTS) {
          window.removeEventListener(eventName, onActivity);
        }

        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);

        if (idleTimer) {
          clearTimeout(idleTimer);
        }
      };
    });
  }
}
