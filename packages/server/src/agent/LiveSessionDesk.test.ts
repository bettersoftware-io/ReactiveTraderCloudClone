import { describe, expect, it, vi } from "vitest";

import type {
  ConfirmGate,
  JarvisConfirmDetails,
  JarvisToolDefinition,
} from "@rtc/agent-tools";
import { Direction, type JarvisEvent } from "@rtc/domain";

import { LiveSessionDesk } from "./LiveSessionDesk.js";

describe("LiveSessionDesk", () => {
  it("sorts tools by name and includes render_panel and drive_app", () => {
    const { desk } = createDesk(["zeta_tool", "alpha_tool"]);
    const names = desk.tools.map((tool) => {
      return tool.name;
    });

    expect(names).toEqual([
      "alpha_tool",
      "drive_app",
      "render_panel",
      "zeta_tool",
    ]);
  });

  it("answers false with no turn bound", async () => {
    const { confirm } = createDesk();

    await expect(confirm(DETAILS)).resolves.toBe(false);
  });

  it("answers false at once for an aborted turn and pushes nothing", async () => {
    const { desk, confirm } = createDesk();
    const push = vi.fn();
    const controller = new AbortController();

    desk.bindTurn({ push, signal: controller.signal });
    controller.abort();

    await expect(confirm(DETAILS)).resolves.toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("answers false after the turn is unbound", async () => {
    const { desk, confirm } = createDesk();
    const push = vi.fn();

    desk.bindTurn({ push, signal: new AbortController().signal });
    desk.bindTurn(null);

    await expect(confirm(DETAILS)).resolves.toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("resolves a pending confirmation through resolveConfirmation, once, for its own id only", async () => {
    const { desk, confirm } = createDesk();
    const push = vi.fn();

    desk.bindTurn({ push, signal: new AbortController().signal });
    const answer = confirm(DETAILS);
    const settled = vi.fn();
    void answer.then(settled);

    desk.resolveConfirmation("confirm-not-issued", true);
    await Promise.resolve();

    expect(settled).not.toHaveBeenCalled();

    desk.resolveConfirmation(confirmIdOf(push), true);

    await expect(answer).resolves.toBe(true);
  });

  it("releasePendingConfirmations resolves every pending confirmation false", async () => {
    const { desk, confirm } = createDesk();
    const push = vi.fn();

    desk.bindTurn({ push, signal: new AbortController().signal });
    const first = confirm(DETAILS);
    const second = confirm(DETAILS);

    desk.releasePendingConfirmations();

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
  });
});

function createTool(name: string): JarvisToolDefinition {
  return {
    name,
    description: name,
    inputSchema: { type: "object" },
    run: (): Promise<string> => {
      return Promise.resolve("ok");
    },
  };
}

interface DeskFixture {
  desk: LiveSessionDesk;
  confirm: ConfirmGate;
}

function createDesk(toolNames: readonly string[] = []): DeskFixture {
  let captured: ConfirmGate | undefined;
  const desk = new LiveSessionDesk((confirm) => {
    captured = confirm;

    return toolNames.map(createTool);
  }, []);

  if (captured === undefined) {
    throw new Error("buildTools was not called");
  }

  return { desk, confirm: captured };
}

const DETAILS: JarvisConfirmDetails = {
  symbol: "EURUSD",
  direction: Direction.Buy,
  notional: 1_000_000,
  quotedPrice: 1.1,
  ratePrecision: 5,
};

function confirmIdOf(push: ReturnType<typeof vi.fn>): string {
  const event = push.mock.calls[0]?.[0] as JarvisEvent;

  if (event.type !== "confirmRequest") {
    throw new Error("expected a confirmRequest");
  }

  return event.confirmationId;
}
