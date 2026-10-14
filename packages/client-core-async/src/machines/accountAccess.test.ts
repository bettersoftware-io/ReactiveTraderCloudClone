import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { AccountFlowOutcome, AccountFlowPort } from "@rtc/domain";

import { createAccountAccessMachine } from "#/machines/accountAccess";

describe("createAccountAccessMachine (async)", () => {
  it("a register reaches the port and dispose releases its subscription", () => {
    const { port, calls, answer } = createRecordingPort();
    const m = createAccountAccessMachine(port);
    m.intents.startRegistration();
    m.intents.register({
      email: "ann@desk.io",
      displayName: "Ann Desk",
      password: "Correct-Horse-9x",
    });
    expect(calls).toEqual(["register:ann@desk.io"]);
    expect(answer.observed).toBe(true);
    m.dispose();
    expect(answer.observed).toBe(false);
  });
});

interface RecordingPort {
  port: AccountFlowPort;
  calls: string[];
  answer: Subject<AccountFlowOutcome>;
}

function createRecordingPort(): RecordingPort {
  const calls: string[] = [];
  const answer = new Subject<AccountFlowOutcome>();
  const port = {
    register: (email: string): Subject<AccountFlowOutcome> => {
      calls.push(`register:${email}`);
      return answer;
    },
  } as unknown as AccountFlowPort;
  return { port, calls, answer };
}
