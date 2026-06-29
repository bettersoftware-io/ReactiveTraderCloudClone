import { firstValueFrom } from "rxjs";
import { filter } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import { ConnectionStatus } from "@rtc/domain";

import { buildDefaultPorts, createApp } from "./composition";

describe("composition — incident ↔ connection seam", () => {
  it("IncidentMachine.inject(serviceDown) drives ConnectionStatusPresenter to DISCONNECTED", async () => {
    const app = createApp(buildDefaultPorts());
    // status$ starts CONNECTING → CONNECTED (simulator gatewayConnected).
    await firstValueFrom(
      app.presenters.connection.status$.pipe(
        filter((s) => s === ConnectionStatus.CONNECTED),
      ),
    );

    app.presenters.incident.intents.inject("serviceDown");

    const next = await firstValueFrom(
      app.presenters.connection.status$.pipe(
        filter((s) => s === ConnectionStatus.DISCONNECTED),
      ),
    );
    expect(next).toBe(ConnectionStatus.DISCONNECTED);
  });
});
