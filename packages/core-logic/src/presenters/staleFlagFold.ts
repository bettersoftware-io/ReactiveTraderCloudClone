import { ConnectionStatus } from "@rtc/domain";

/** One input of the stale-flag fold: a connection status or a watched value. */
export type StaleFlagEvent<T> =
  | { kind: "status"; status: ConnectionStatus }
  | { kind: "value"; value: T };

export interface StaleFlagAcc<T> {
  readonly wasDisconnected: boolean;
  readonly current: T | undefined;
  readonly hasValue: boolean;
  readonly valueAtReconnect: T | undefined;
  readonly stale: boolean;
}

export function createStaleFlagAcc<T>(): StaleFlagAcc<T> {
  return {
    wasDisconnected: false,
    current: undefined,
    hasValue: false,
    valueAtReconnect: undefined,
    stale: false,
  };
}

/** The rule, reference-equality and all (relocated from the old
 * useStaleDetection hook): latch `wasDisconnected` whenever status leaves
 * CONNECTED; on the reconnect record the value reference held at that moment
 * and go stale; clear the moment a NEW value reference (`!==`) arrives; a
 * same-reference re-emission after reconnect is not new data. */
export function reduceStaleFlag<T>(
  acc: StaleFlagAcc<T>,
  event: StaleFlagEvent<T>,
): StaleFlagAcc<T> {
  if (event.kind === "status") {
    if (event.status !== ConnectionStatus.CONNECTED) {
      return { ...acc, wasDisconnected: true };
    }

    if (acc.wasDisconnected) {
      return {
        ...acc,
        wasDisconnected: false,
        valueAtReconnect: acc.current,
        stale: true,
      };
    }

    return acc;
  }

  const next: StaleFlagAcc<T> = {
    ...acc,
    current: event.value,
    hasValue: true,
  };

  if (acc.stale && event.value !== acc.valueAtReconnect) {
    return { ...next, stale: false };
  }

  return next;
}
