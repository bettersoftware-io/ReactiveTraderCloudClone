import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import {
  combineEffects,
  createWsListener,
  type Inbound,
  type Outbound,
  type Socket,
} from "@rtc/ws-effects";

import type { AccountAdminService } from "#/accounts/accountAdminService";
import type { Caller } from "#/services/serviceContainer";

import { accountAdminEffects } from "./accountAdmin.effects.js";
import type { Ctx } from "./context.js";

describe("account admin effects", () => {
  it.each(createIdCases())(
    "%s answers done for a valid payload and passes the caller",
    async (kind, request, response) => {
      const { messages$, sent, service } = harness(okService());
      messages$.next({
        type: request,
        payload: { accountId: ACCOUNT_ID },
        correlationId: "1",
      });
      await settle();

      expect(sent).toEqual([
        {
          type: response,
          payload: { type: "ack", payload: { done: true } },
          correlationId: "1",
        },
      ]);
      expect(service.act).toHaveBeenCalledWith(CALLER, ACCOUNT_ID, { kind });
    },
  );

  it.each(createIdCases())(
    "%s nacks a malformed payload without calling the service",
    async (_kind, request, response) => {
      const { messages$, sent, service } = harness(okService());
      messages$.next({
        type: request,
        payload: { accountId: "x" },
        correlationId: "bad",
      });
      await settle();

      expect(sent).toEqual([
        { type: response, payload: { type: "nack" }, correlationId: "bad" },
      ]);
      expect(service.act).not.toHaveBeenCalled();
    },
  );

  it("answers a refusal as a typed answer, not a nack", async () => {
    const { messages$, sent } = harness({
      list: vi.fn(),
      act: vi.fn(() => {
        return Promise.resolve({ ok: false, refusal: "forbidden" });
      }),
    } as unknown as AccountAdminService);
    messages$.next({
      type: CLIENT_MSG.ADMIN_ACCOUNTS_APPROVE,
      payload: { accountId: ACCOUNT_ID },
      correlationId: "2",
    });
    await settle();

    expect(sent).toEqual([
      {
        type: SERVER_MSG.ADMIN_ACCOUNTS_APPROVE_RESPONSE,
        payload: { type: "ack", payload: { error: "forbidden" } },
        correlationId: "2",
      },
    ]);
  });

  it("rename passes the display name through", async () => {
    const { messages$, sent, service } = harness(okService());
    messages$.next({
      type: CLIENT_MSG.ADMIN_ACCOUNTS_RENAME,
      payload: { accountId: ACCOUNT_ID, displayName: "Ann Lee" },
      correlationId: "3",
    });
    await settle();

    expect(service.act).toHaveBeenCalledWith(CALLER, ACCOUNT_ID, {
      kind: "rename",
      displayName: "Ann Lee",
    });
    expect(sent[0]?.payload).toEqual({ type: "ack", payload: { done: true } });
  });

  it("rename nacks a payload without a display name", async () => {
    const { messages$, sent } = harness(okService());
    messages$.next({
      type: CLIENT_MSG.ADMIN_ACCOUNTS_RENAME,
      payload: { accountId: ACCOUNT_ID },
      correlationId: "4",
    });
    await settle();

    expect(sent[0]?.payload).toEqual({ type: "nack" });
  });

  it("list answers the accounts, and a refusal as an error", async () => {
    const accounts = [
      {
        id: ACCOUNT_ID,
        email: "a@b.io",
        displayName: "Ann",
        access: "user",
        status: "active",
        joinedAt: 1,
        isSelf: false,
      },
    ];

    const listed = harness({
      list: vi.fn(() => {
        return Promise.resolve({ ok: true, value: accounts });
      }),
      act: vi.fn(),
    } as unknown as AccountAdminService);
    listed.messages$.next({
      type: CLIENT_MSG.ADMIN_ACCOUNTS_LIST,
      payload: {},
      correlationId: "5",
    });
    await settle();

    expect(listed.sent[0]?.payload).toEqual({
      type: "ack",
      payload: { accounts },
    });
    expect(listed.service.list).toHaveBeenCalledWith(CALLER);

    const refused = harness({
      list: vi.fn(() => {
        return Promise.resolve({ ok: false, refusal: "unavailable" });
      }),
      act: vi.fn(),
    } as unknown as AccountAdminService);
    refused.messages$.next({
      type: CLIENT_MSG.ADMIN_ACCOUNTS_LIST,
      payload: {},
      correlationId: "6",
    });
    await settle();

    expect(refused.sent[0]?.payload).toEqual({
      type: "ack",
      payload: { error: "unavailable" },
    });
  });
});

function okService(): AccountAdminService {
  return {
    list: vi.fn(),
    act: vi.fn(() => {
      return Promise.resolve({ ok: true, value: undefined });
    }),
  } as unknown as AccountAdminService;
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

interface Harness {
  readonly messages$: Subject<Inbound>;
  readonly sent: Outbound[];
  readonly service: AccountAdminService;
}

function harness(service: AccountAdminService): Harness {
  const messages$ = new Subject<Inbound>();
  const closed$ = new Subject<void>();
  const sent: Outbound[] = [];
  const socket: Socket = {
    messages$,
    closed$,
    send: (m: Outbound) => {
      sent.push(m);
    },
  };
  const ctx = { accountAdmin: service, caller: CALLER } as unknown as Ctx;
  createWsListener(combineEffects(...accountAdminEffects), ctx)(socket);

  return { messages$, sent, service };
}

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";
const CALLER: Caller = {
  username: "Desk Admin",
  accountId: "00000000-0000-4000-8000-000000000001",
  issuedAt: 10,
};

function createIdCases(): readonly (readonly [
  AccountAdminKind,
  string,
  string,
])[] {
  return [
    [
      "approve",
      CLIENT_MSG.ADMIN_ACCOUNTS_APPROVE,
      SERVER_MSG.ADMIN_ACCOUNTS_APPROVE_RESPONSE,
    ],
    [
      "block",
      CLIENT_MSG.ADMIN_ACCOUNTS_BLOCK,
      SERVER_MSG.ADMIN_ACCOUNTS_BLOCK_RESPONSE,
    ],
    [
      "unblock",
      CLIENT_MSG.ADMIN_ACCOUNTS_UNBLOCK,
      SERVER_MSG.ADMIN_ACCOUNTS_UNBLOCK_RESPONSE,
    ],
    [
      "delete",
      CLIENT_MSG.ADMIN_ACCOUNTS_DELETE,
      SERVER_MSG.ADMIN_ACCOUNTS_DELETE_RESPONSE,
    ],
  ];
}

type AccountAdminKind = "approve" | "block" | "unblock" | "delete";
