import { vi } from "vitest";

export interface RecordingChannel {
  /** The channel names the hub opened, in order. */
  readonly names: string[];
  /** Every message the hub posted, in order. */
  readonly posted: unknown[];
  /** Hands the hub a message, as an inspector on the channel would. */
  readonly deliver: (data: unknown) => void;
}

/** Replaces BroadcastChannel with a stub that records the names it was opened
 * with and what the hub posts, and can hand the hub an inbound message. */
export function createRecordingBroadcastChannel(): RecordingChannel {
  const names: string[] = [];
  const posted: unknown[] = [];
  const receivers: Array<(event: MessageEvent) => void> = [];

  vi.stubGlobal(
    "BroadcastChannel",
    class {
      constructor(name: string) {
        names.push(name);
      }

      set onmessage(receiver: (event: MessageEvent) => void) {
        receivers.push(receiver);
      }

      postMessage(message: unknown): void {
        posted.push(message);
      }

      close(): void {}
    },
  );

  return {
    names,
    posted,
    deliver: (data: unknown): void => {
      for (const receiver of receivers) {
        receiver(new MessageEvent("message", { data }));
      }
    },
  };
}
