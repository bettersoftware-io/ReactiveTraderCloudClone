import { createPortRouter } from "#/portRouter";
import type { RuntimePort } from "#/ports";

const router = createPortRouter();

const PANEL_PREFIX = "rtc-panel:";
const CONTENT_NAME = "rtc-content";

chrome.runtime.onConnect.addListener((port: chrome.runtime.Port): void => {
  if (port.name.startsWith(PANEL_PREFIX)) {
    const tabId = Number.parseInt(port.name.slice(PANEL_PREFIX.length), 10);

    if (!Number.isNaN(tabId)) {
      router.connectPanel(tabId, port as unknown as RuntimePort);
    }

    return;
  }

  if (port.name === CONTENT_NAME) {
    const tabId = port.sender?.tab?.id;

    if (typeof tabId === "number") {
      router.connectContent(tabId, port as unknown as RuntimePort);
    }
  }
});
