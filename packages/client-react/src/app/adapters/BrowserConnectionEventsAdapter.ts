import { Observable } from "rxjs";
import {
  IDLE_TIMEOUT_MS,
  type ConnectionEvent,
  type ConnectionEventsPort,
} from "@rtc/domain";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart"] as const;

export class BrowserConnectionEventsAdapter implements ConnectionEventsPort {
  events(): Observable<ConnectionEvent> {
    return new Observable<ConnectionEvent>((subscriber) => {
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      const armIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          subscriber.next({ type: "idleTimeout" });
        }, IDLE_TIMEOUT_MS);
      };

      const onActivity = () => {
        subscriber.next({ type: "userActivity" });
        armIdleTimer();
      };
      const onOnline = () => subscriber.next({ type: "browserOnline" });
      const onOffline = () => subscriber.next({ type: "browserOffline" });

      for (const eventName of ACTIVITY_EVENTS) {
        window.addEventListener(eventName, onActivity, { passive: true });
      }
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      armIdleTimer();

      return () => {
        for (const eventName of ACTIVITY_EVENTS) {
          window.removeEventListener(eventName, onActivity);
        }
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
        if (idleTimer) clearTimeout(idleTimer);
      };
    });
  }
}
