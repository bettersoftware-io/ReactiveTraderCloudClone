import { SESSION_ENDED_CLOSE_CODE, SESSION_ENDED_REASON } from "@rtc/shared";

import { REVOCATION_LEDGER_MAX_ENTRIES } from "../config/limits.js";

export interface ClosableSocket {
  close(code: number, reason: string): void;
}

export interface SessionRegistry {
  /** Returns the unregister function for this socket. */
  register(accountId: string, socket: ClosableSocket): () => void;
  /** Closes every registered socket of the account with the session-ended
   * code; returns how many were closed. */
  closeAll(accountId: string): number;
  /** A number that grows each time the account's sessions are ended (0 for an
   * account never ended here). Read BEFORE an async check, compared after it:
   * a larger value means a revocation ran in between. */
  epochOf(accountId: string): number;
}

/** The live sockets of each account, so ending a session can close them. */
export function createSessionRegistry(
  maxEpochs: number = REVOCATION_LEDGER_MAX_ENTRIES,
): SessionRegistry {
  const sockets = new Map<string, Set<ClosableSocket>>();
  // Epochs come from one global counter, never reused, so an evicted account
  // reads 0 (never greater than a captured value): eviction cannot cause a
  // spurious close, only forget a revocation older than every live capture.
  const epochs = new Map<string, number>();
  let counter = 0;

  return {
    register(accountId: string, socket: ClosableSocket): () => void {
      const set = sockets.get(accountId) ?? new Set<ClosableSocket>();
      set.add(socket);
      sockets.set(accountId, set);

      return (): void => {
        set.delete(socket);

        if (set.size === 0 && sockets.get(accountId) === set) {
          sockets.delete(accountId);
        }
      };
    },
    epochOf(accountId: string): number {
      return epochs.get(accountId) ?? 0;
    },
    closeAll(accountId: string): number {
      // Bump first: a handshake already past its status read sees the new
      // epoch when it registers, even though no socket is here to close yet.
      counter += 1;
      epochs.delete(accountId);

      if (epochs.size >= maxEpochs) {
        const oldest = epochs.keys().next().value;

        if (oldest !== undefined) {
          epochs.delete(oldest);
        }
      }

      epochs.set(accountId, counter);

      const set = sockets.get(accountId);

      if (set === undefined) {
        return 0;
      }

      let closed = 0;

      for (const socket of [...set]) {
        try {
          socket.close(SESSION_ENDED_CLOSE_CODE, SESSION_ENDED_REASON);
          closed += 1;
        } catch {
          // One socket failing to close must not keep the rest open.
        }
      }

      return closed;
    },
  };
}
