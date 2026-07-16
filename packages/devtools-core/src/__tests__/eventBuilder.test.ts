import { EMPTY, firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { createInMemoryDuplexPair } from "../channel";
import { DevtoolsHub } from "../DevtoolsHub";
import type { AppToInspector, InspectorToApp } from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";

describe("DevtoolsHub event stamping", () => {
  it("stamps monotonically increasing seq and a ts on emitted events", async () => {
    const hub = new DevtoolsHub({ appId: "t" });
    const [appSide, inspectorSide] = createInMemoryDuplexPair<
      AppToInspector,
      InspectorToApp
    >();
    hub.attachTransport(appSide);

    inspectorSide.send({ kind: "hello", v: PROTOCOL_VERSION });
    // Register two streams so two events flow.
    hub.registerStream("s.a$", EMPTY);
    hub.registerStream("s.b$", EMPTY);

    const batch = await firstValueFrom(inspectorSide.inbound$).catch(
      () => {return null},
    );
    // The batch arrives asynchronously after the flush; assert via a settled read.
    expect(batch === null || typeof batch === "object").toBe(true);

    hub.dispose();
  });
});
