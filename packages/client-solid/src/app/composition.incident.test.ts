import { firstValueFrom } from "rxjs";
import { filter } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import { createApp } from "@rtc/client-core";
import { ConnectionStatus } from "@rtc/domain";

import { buildBrowserPorts } from "./buildBrowserPorts";

describe("composition — incident ↔ connection seam", () => {
  it("IncidentMachine.inject(serviceDown) drives ConnectionStatusPresenter to DISCONNECTED", async () => {
    const app = createApp(buildBrowserPorts());
    // Subscribe to the DISCONNECTED stream FIRST so the shared connection source
    // stays warm (refCount >= 1) across the inject — a plain Subject then delivers live.
    const disconnected = firstValueFrom(
      app.presenters.connection.status$.pipe(
        filter((s) => {
          return s === ConnectionStatus.DISCONNECTED;
        }),
      ),
    );
    await firstValueFrom(
      app.presenters.connection.status$.pipe(
        filter((s) => {
          return s === ConnectionStatus.CONNECTED;
        }),
      ),
    );
    app.presenters.incident.intents.inject("serviceDown");
    expect(await disconnected).toBe(ConnectionStatus.DISCONNECTED);
  });
});
