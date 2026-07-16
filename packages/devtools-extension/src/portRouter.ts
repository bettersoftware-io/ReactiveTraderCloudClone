import type { RuntimePort } from "#/ports";

interface Pairing {
  panel?: RuntimePort;
  content?: RuntimePort;
}

/** Tab-keyed relay between a DevTools panel port and a content-script port.
 * Holds no message state — only the two live ports per tab — so it survives a
 * service-worker restart cleanly (both sides reconnect and re-register). When
 * either side disconnects, the surviving sibling is disconnected too, so the
 * transport tears down symmetrically and the inspector shows "disconnected". */
export function createPortRouter(): {
  connectPanel(tabId: number, port: RuntimePort): void;
  connectContent(tabId: number, port: RuntimePort): void;
} {
  const pairings = new Map<number, Pairing>();

  function pairingFor(tabId: number): Pairing {
    const existing = pairings.get(tabId);

    if (existing) {
      return existing;
    }

    const created: Pairing = {};
    pairings.set(tabId, created);

    return created;
  }

  function teardown(tabId: number): void {
    const pairing = pairings.get(tabId);

    if (!pairing) {
      return;
    }

    pairings.delete(tabId);
    pairing.panel?.disconnect();
    pairing.content?.disconnect();
  }

  function relay(from: RuntimePort, to: () => RuntimePort | undefined): void {
    from.onMessage.addListener((msg: unknown): void => {
      to()?.postMessage(msg);
    });
  }

  return {
    connectPanel(tabId: number, port: RuntimePort): void {
      const pairing = pairingFor(tabId);
      pairing.panel = port;
      relay(port, (): RuntimePort | undefined => pairings.get(tabId)?.content);
      port.onDisconnect.addListener((): void => {
        teardown(tabId);
      });
    },

    connectContent(tabId: number, port: RuntimePort): void {
      const pairing = pairingFor(tabId);
      pairing.content = port;
      relay(port, (): RuntimePort | undefined => pairings.get(tabId)?.panel);
      port.onDisconnect.addListener((): void => {
        teardown(tabId);
      });
    },
  };
}
