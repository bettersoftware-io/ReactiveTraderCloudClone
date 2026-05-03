import { useEffect, useRef, useState } from "react";
import { ConnectionStatus } from "@rtc/domain";
import { useConnection } from "../connection/useConnection";

/**
 * Returns true when a data stream should be considered stale.
 *
 * A stream is stale when the connection was lost and reconnected
 * but the stream has not yet received new data. The caller passes
 * a "version" value (e.g. a counter or latest timestamp) that
 * increments whenever the stream yields new data. Once a new value
 * arrives after reconnection, stale clears.
 */
export function useStaleDetection(dataVersion: number): boolean {
  const status = useConnection();
  const [stale, setStale] = useState(false);
  const wasDisconnectedRef = useRef(false);
  const versionAtReconnectRef = useRef(dataVersion);

  useEffect(() => {
    if (status !== ConnectionStatus.CONNECTED) {
      wasDisconnectedRef.current = true;
    } else if (wasDisconnectedRef.current) {
      // Just reconnected — mark stale until new data arrives
      versionAtReconnectRef.current = dataVersion;
      setStale(true);
      wasDisconnectedRef.current = false;
    }
  }, [status, dataVersion]);

  // Clear stale once dataVersion advances past the reconnection snapshot
  useEffect(() => {
    if (stale && dataVersion !== versionAtReconnectRef.current) {
      setStale(false);
    }
  }, [stale, dataVersion]);

  return stale;
}
