import { SESSION_ENDED_CLOSE_CODE, SESSION_ENDED_REASON } from "@rtc/shared";

export interface ClosableSocket {
  close(code: number, reason: string): void;
}

export interface SessionRegistry {
  /** Returns the unregister function for this socket. */
  register(accountId: string, socket: ClosableSocket): () => void;
  /** Closes every registered socket of the account with the session-ended
   * code; returns how many were closed. */
  closeAll(accountId: string): number;
}

/** The live sockets of each account, so ending a session can close them. */
export function createSessionRegistry(): SessionRegistry {
  const sockets = new Map<string, Set<ClosableSocket>>();

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
    closeAll(accountId: string): number {
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
