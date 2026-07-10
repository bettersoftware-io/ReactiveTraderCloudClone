import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createApp,
  createMachineFactories,
  createSimulatorPorts,
} from "@rtc/client-core";
import {
  ConnectionEventsSimulator,
  Direction,
  PreferencesSimulator,
} from "@rtc/domain";

import { createViewModel, type ViewModel } from "#/createViewModel";

describe("credit RFQ hooks", () => {
  it("useCreditRfqFilterPreference reads default live and writes closed", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useCreditRfqFilterPreference();
    });
    expect(result.current.filter).toBe("live");
    act(() => {
      result.current.setFilter("closed");
    });
    expect(result.current.filter).toBe("closed");
  });

  it("useCancelRfq resolves after the command completes", async () => {
    const hooks = makeHooks();
    const rfqId = await createOpenRfq(hooks);

    const { result } = renderHook(() => {
      return hooks.useCancelRfq();
    });

    await act(async () => {
      await result.current(rfqId);
    });

    await waitFor(() => {
      const rfqsHook = renderHook(() => {
        return hooks.useRfqs();
      });
      const rfq = rfqsHook.result.current.find((r) => {
        return r.id === rfqId;
      });
      expect(rfq?.state).toBe("Cancelled");
    });
  });
});

function makeHooks(): ViewModel {
  const { presenters, commands } = createApp(createSimPorts());
  return createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );

  function createSimPorts(): AppPorts {
    return {
      ...createSimulatorPorts({ preferences: new PreferencesSimulator() }),
      connectionEvents: new ConnectionEventsSimulator(),
    };
  }
}

/** Drives the real create-RFQ flow through useRfqSubmission so cancelRfq has a
 * live RFQ to act on (mirrors the presenter's actual workflow lifecycle). */
async function createOpenRfq(hooks: ViewModel): Promise<number> {
  const { result } = renderHook(() => {
    return hooks.useRfqSubmission();
  });

  act(() => {
    result.current.submit(
      {
        instrumentId: 1,
        dealerIds: [1],
        quantity: 1000,
        direction: Direction.Buy,
      },
      () => {},
    );
  });

  await waitFor(() => {
    expect(result.current.state.status).toBe("confirmed");
  });

  const confirmed = result.current.state;

  if (confirmed.status !== "confirmed") {
    throw new Error("not confirmed");
  }

  return confirmed.rfqId;
}
