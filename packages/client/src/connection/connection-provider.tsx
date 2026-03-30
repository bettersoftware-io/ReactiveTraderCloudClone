import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ConnectionStatus,
  nextConnectionStatus,
  IDLE_TIMEOUT_MS,
} from "@rtc/domain";

export const ConnectionContext = createContext<ConnectionStatus | null>(null);

/**
 * In mock mode, the connection is always CONNECTED.
 * This provider still implements the full state machine so that
 * idle timeout and offline detection work correctly.
 */
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>(
    ConnectionStatus.CONNECTED,
  );
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dispatch = useCallback(
    (event: Parameters<typeof nextConnectionStatus>[1]) => {
      setStatus((prev) => nextConnectionStatus(prev, event));
    },
    [],
  );

  // Idle timeout: reset on user activity
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      dispatch({ type: "idleTimeout" });
    }, IDLE_TIMEOUT_MS);
  }, [dispatch]);

  // Reconnect from idle on user activity
  const handleUserActivity = useCallback(() => {
    setStatus((prev) => {
      if (prev === ConnectionStatus.IDLE_DISCONNECTED) {
        // In mock mode, go straight to CONNECTED (skip CONNECTING)
        return ConnectionStatus.CONNECTED;
      }
      return prev;
    });
    resetIdleTimer();
  }, [resetIdleTimer]);

  // Set up activity listeners and online/offline detection
  useEffect(() => {
    const activityEvents = ["mousemove", "mousedown", "keydown", "touchstart"];
    for (const event of activityEvents) {
      window.addEventListener(event, handleUserActivity, { passive: true });
    }

    const handleOffline = () => dispatch({ type: "browserOffline" });
    const handleOnline = () => {
      dispatch({ type: "browserOnline" });
      // In mock mode, immediately transition to CONNECTED
      setStatus(ConnectionStatus.CONNECTED);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    resetIdleTimer();

    return () => {
      for (const event of activityEvents) {
        window.removeEventListener(event, handleUserActivity);
      }
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [dispatch, handleUserActivity, resetIdleTimer]);

  return (
    <ConnectionContext.Provider value={status}>
      {children}
    </ConnectionContext.Provider>
  );
}
