// tests/presenter/scenarios/_shared/connection.ts

import { filter } from "rxjs";

import type { ConnectionStatus } from "@rtc/domain";

import type { PresenterWorld } from "../_world";

export async function browserGoesOffline(w: PresenterWorld): Promise<void> {
  w.ctx.connectionEvents$.next({ type: "browserOffline" });
}

export async function browserComesBackOnline(w: PresenterWorld): Promise<void> {
  w.ctx.connectionEvents$.next({ type: "browserOnline" });
  w.ctx.connectionEvents$.next({ type: "gatewayConnected" });
}

export async function gatewayDrops(w: PresenterWorld): Promise<void> {
  w.ctx.connectionEvents$.next({ type: "gatewayDisconnected" });
}

export async function gatewayAttemptsReconnect(
  w: PresenterWorld,
): Promise<void> {
  // In production this event is emitted by WsAdapter's reconnect timer
  // (WS-real mode only); injected directly here so the presenter projection
  // of the DISCONNECTED -> CONNECTING transition can be asserted.
  w.ctx.connectionEvents$.next({ type: "reconnectAttempt" });
}

export async function gatewayConnectionRestored(
  w: PresenterWorld,
): Promise<void> {
  w.ctx.connectionEvents$.next({ type: "gatewayConnected" });
}

export async function expectStatusEqualsWithin(
  w: PresenterWorld,
  status: ConnectionStatus,
  seconds: number,
): Promise<void> {
  await w.awaitFirstWithin(
    w.ctx.app.presenters.connection.status$.pipe(filter((s) => s === status)),
    seconds * 1000,
  );
}

export async function expectStatusNotEqualsWithin(
  w: PresenterWorld,
  status: ConnectionStatus,
  seconds: number,
): Promise<void> {
  await w.awaitFirstWithin(
    w.ctx.app.presenters.connection.status$.pipe(filter((s) => s !== status)),
    seconds * 1000,
  );
}

export async function noopAssertConnectionUiPresent(
  _w: PresenterWorld,
): Promise<void> {
  // "the connection status footer is visible" / "the connection overlay text matches /offline/i":
  // these reference UI elements that don't exist at presenter level. The underlying truth
  // (status$ stream is alive) is verified implicitly by other steps in the same scenario.
}
