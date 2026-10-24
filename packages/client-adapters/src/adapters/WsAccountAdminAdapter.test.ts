import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { AccountAdminPort, AccountSummary } from "@rtc/domain";
import { CLIENT_MSG, type RpcResponse } from "@rtc/shared";
import { rpcAck, rpcNack } from "@rtc/shared/__fixtures__/wireFrames";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { createWsAccountAdminAdapter } from "./WsAccountAdminAdapter";

const ACCOUNT_ID = "6f1f3b3e-2b0a-4c43-9d57-0a1f5d9a7c11";

describe("createWsAccountAdminAdapter :: listAccounts", () => {
  it("sends one list rpc per subscription, and nothing before it", async () => {
    const { ws, port } = createFixture();
    const outcome = port.listAccounts();
    expect(ws.sentMessages()).toEqual([]);

    const promise = firstValueFrom(outcome);
    await awaitPendingRpc(ws, CLIENT_MSG.ADMIN_ACCOUNTS_LIST);
    ws.nextRpcResponse(
      CLIENT_MSG.ADMIN_ACCOUNTS_LIST,
      rpcAck({ accounts: [] }),
    );
    await promise;

    expect(ws.sentMessages()).toHaveLength(1);
    ws.dispose();
  });

  it("maps the accounts answer to an ok outcome with the same fields", async () => {
    const { ws, port } = createFixture();
    const summary: AccountSummary = {
      id: ACCOUNT_ID,
      email: "ann@example.com",
      displayName: "Ann",
      access: "admin",
      status: "active",
      joinedAt: 1_700_000_000_000,
      isSelf: true,
    };
    const promise = firstValueFrom(port.listAccounts());
    await awaitPendingRpc(ws, CLIENT_MSG.ADMIN_ACCOUNTS_LIST);
    ws.nextRpcResponse(
      CLIENT_MSG.ADMIN_ACCOUNTS_LIST,
      rpcAck({ accounts: [summary] }),
    );

    await expect(promise).resolves.toEqual({ ok: true, accounts: [summary] });
    ws.dispose();
  });

  it("maps a refusal to ok:false with that reason", async () => {
    const { ws, port } = createFixture();
    const promise = firstValueFrom(port.listAccounts());
    await awaitPendingRpc(ws, CLIENT_MSG.ADMIN_ACCOUNTS_LIST);
    ws.nextRpcResponse(
      CLIENT_MSG.ADMIN_ACCOUNTS_LIST,
      rpcAck({ error: "forbidden" }),
    );

    await expect(promise).resolves.toEqual({ ok: false, reason: "forbidden" });
    ws.dispose();
  });

  it("answers unavailable on a nack", async () => {
    const { ws, port } = createFixture();
    const promise = firstValueFrom(port.listAccounts());
    await awaitPendingRpc(ws, CLIENT_MSG.ADMIN_ACCOUNTS_LIST);
    ws.nextRpcResponse(CLIENT_MSG.ADMIN_ACCOUNTS_LIST, rpcNack());

    await expect(promise).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    ws.dispose();
  });

  it("answers unavailable on a malformed answer", async () => {
    const { ws, port } = createFixture();
    const promise = firstValueFrom(port.listAccounts());
    await awaitPendingRpc(ws, CLIENT_MSG.ADMIN_ACCOUNTS_LIST);
    ws.nextRpcResponse(
      CLIENT_MSG.ADMIN_ACCOUNTS_LIST,
      rpcAck({ accounts: [{ id: ACCOUNT_ID }] }),
    );

    await expect(promise).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    ws.dispose();
  });

  it("answers unavailable when the socket is not connected", async () => {
    const { ws, port } = createFixture();

    ws.rpc = (): Promise<unknown> => {
      return Promise.reject(new Error("WebSocket not connected"));
    };

    await expect(firstValueFrom(port.listAccounts())).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    ws.dispose();
  });
});

describe("createWsAccountAdminAdapter :: actOn", () => {
  const CASES = [
    [
      { kind: "approve" },
      CLIENT_MSG.ADMIN_ACCOUNTS_APPROVE,
      { accountId: ACCOUNT_ID },
    ],
    [
      { kind: "block" },
      CLIENT_MSG.ADMIN_ACCOUNTS_BLOCK,
      { accountId: ACCOUNT_ID },
    ],
    [
      { kind: "unblock" },
      CLIENT_MSG.ADMIN_ACCOUNTS_UNBLOCK,
      { accountId: ACCOUNT_ID },
    ],
    [
      { kind: "rename", displayName: "Bea" },
      CLIENT_MSG.ADMIN_ACCOUNTS_RENAME,
      { accountId: ACCOUNT_ID, displayName: "Bea" },
    ],
    [
      { kind: "delete" },
      CLIENT_MSG.ADMIN_ACCOUNTS_DELETE,
      { accountId: ACCOUNT_ID },
    ],
  ] as const;

  it.each(CASES)(
    "%j sends one rpc with the right payload and maps done to ok",
    async (action, type, payload) => {
      const { ws, port } = createFixture();
      const promise = firstValueFrom(port.actOn(ACCOUNT_ID, action));
      await awaitPendingRpc(ws, type);
      expect(ws.sentMessages()).toEqual([{ type, payload }]);
      ws.nextRpcResponse(type, rpcAck({ done: true }));

      await expect(promise).resolves.toEqual({ ok: true });
      ws.dispose();
    },
  );

  it("maps a refusal word to ok:false", async () => {
    const { ws, port } = createFixture();
    const promise = firstValueFrom(port.actOn(ACCOUNT_ID, { kind: "block" }));
    await awaitPendingRpc(ws, CLIENT_MSG.ADMIN_ACCOUNTS_BLOCK);
    ws.nextRpcResponse(
      CLIENT_MSG.ADMIN_ACCOUNTS_BLOCK,
      rpcAck({ error: "self" }),
    );

    await expect(promise).resolves.toEqual({ ok: false, reason: "self" });
    ws.dispose();
  });

  it("answers unavailable on a nack", async () => {
    const { ws, port } = createFixture();
    const promise = firstValueFrom(port.actOn(ACCOUNT_ID, { kind: "delete" }));
    await awaitPendingRpc(ws, CLIENT_MSG.ADMIN_ACCOUNTS_DELETE);
    ws.nextRpcResponse(CLIENT_MSG.ADMIN_ACCOUNTS_DELETE, rpcNack());

    await expect(promise).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    ws.dispose();
  });

  it("answers unavailable when the list answer arrives for an action (wrong shape)", async () => {
    const { ws, port } = createFixture();
    const promise = firstValueFrom(port.actOn(ACCOUNT_ID, { kind: "approve" }));
    await awaitPendingRpc(ws, CLIENT_MSG.ADMIN_ACCOUNTS_APPROVE);
    ws.nextRpcResponse(
      CLIENT_MSG.ADMIN_ACCOUNTS_APPROVE,
      rpcAck({ accounts: [] }) as RpcResponse<unknown>,
    );

    await expect(promise).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    ws.dispose();
  });

  it("answers unavailable on a disconnect", async () => {
    const { ws, port } = createFixture();

    ws.rpc = (): Promise<unknown> => {
      return Promise.reject(new Error("WsAdapter session ended"));
    };

    await expect(
      firstValueFrom(port.actOn(ACCOUNT_ID, { kind: "unblock" })),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
    ws.dispose();
  });
});

interface AdminFixture {
  readonly ws: FakeWsAdapter;
  readonly port: AccountAdminPort;
}

function createFixture(): AdminFixture {
  const ws = new FakeWsAdapter();

  return { ws, port: createWsAccountAdminAdapter(ws) };
}
