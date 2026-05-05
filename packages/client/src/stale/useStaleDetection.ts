import { useEffect, useRef, useState } from "react";
import { ConnectionStatus } from "@rtc/domain";
import { useHooks } from "../app/HooksProvider";

/**
 * Returns true when a data stream should be considered stale.
 *
 * A stream is stale when the connection was lost and reconnected
 * but the stream has not yet emitted a new reference. The caller
 * passes the latest value (any reference); a change indicates new
 * data, which clears the stale flag.
 */
export function useStaleDetection(value: unknown): boolean {
  const status = useHooks().useConnectionStatus();
  const [stale, setStale] = useState(false);
  const wasDisconnectedRef = useRef(false);
  const valueAtReconnectRef = useRef(value);

  useEffect(() => {
    if (status !== ConnectionStatus.CONNECTED) {
      wasDisconnectedRef.current = true;
    } else if (wasDisconnectedRef.current) {
      valueAtReconnectRef.current = value;
      setStale(true);
      wasDisconnectedRef.current = false;
    }
  }, [status, value]);

  useEffect(() => {
    if (stale && value !== valueAtReconnectRef.current) {
      setStale(false);
    }
  }, [stale, value]);

  return stale;
}
