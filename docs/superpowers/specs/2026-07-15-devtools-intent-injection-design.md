# RTC DevTools — Intent Injection

**Date:** 2026-07-15
**Status:** Implemented (dev-build-only gate) — see the [implementation plan](../plans/2026-07-15-devtools-intent-injection.md)
**Depends on:** [2026-07-11-custom-devtools-design.md](2026-07-11-custom-devtools-design.md) (v1 shipped) — this realises future-extension §9.1
**Scope decisions (locked):**
- **Dev-build-only gate.** Injection is compiled out of production bundles entirely (`import.meta.env.DEV`); it is not merely disabled at runtime. The first inbound *write* surface cannot exist in a deployed build. A token gate is documented as a future add-on, not built.
- **Machines only for v1** (per-mount machine intents). Presenter-level intents are a documented follow-up.
- Works over **every transport** (same-origin BroadcastChannel, and the Chrome-extension / RN relay once those land) — it is a protocol + hub change, not a transport change.
- Still **confirm-gated in the UI**: the panel asks for explicit confirmation before sending an `intent:invoke` (no accidental fires).

## 1. Why

v1 devtools are strictly observe-only. The single most-requested "real devtools" capability beyond observation is *acting* — firing an intent (e.g. a machine's `change`, `execute`) from the inspector to reproduce a state without hand-driving the UI. Because the app's state layer already funnels every intent through the instrumented `MachineFactories` seam, the hub can invoke the very same wrapped intent function it already taps. This is the "decorator at the choke point pays off again" story — injection costs a new protocol message and a stored reference, not a framework.

The risk is equally real: this is the **first inbound write**. A devtools channel that could drive trades in a deployed build would be a security hole. Hence the dev-build-only gate.

## 2. Approach

Three small additions, no new package:

**(a) Thread the live intents to the hub.** Today `instrument/machines.ts` and `instrument/presenters.ts` call `hub.machineCreated(kind, args, state$)` — the hub stores no way to *call* the machine's intents. Add the wrapped intents map to that registration so the hub's machine entry holds `{ …, intents: Record<string, (...args) => unknown> }`. The wrapped intents are exactly the ones the hub already taps for `machine:intent` events, so an injected call is indistinguishable from a UI-driven one (it still reports a `machine:intent` event — the inspector will see its own injection echoed, which is correct and auditable).

**(b) New inbound protocol member.** Extend `InspectorToApp` (currently `hello | ping | bye`) with:

```ts
| { kind: "intent:invoke"; machineId: string; name: string; args: readonly unknown[] }
```

`PROTOCOL_VERSION` bumps to `2`. (The v1 handshake already surfaces a `protocolMismatch`; an old app + new panel simply won't act on the unknown message, and the panel shows the mismatch.)

**(c) Gated handler in the hub.** In `DevtoolsHub.attachTransport`'s `inbound$` subscription (which today switches on `hello`/`ping`/`bye`), add an `intent:invoke` case that is **only wired when `import.meta.env.DEV`**:

```ts
// Wired only in dev builds — production bundles never include this branch,
// so the tap stays strictly observe-only where it matters.
if (import.meta.env.DEV) {
  // case "intent:invoke": look up the machine entry, find entry.intents[name],
  // call it with args inside the existing try/catch (reportError on throw or
  // missing machine/intent). A successful call emits the usual machine:intent
  // + machine:state events back to the inspector.
}
```

The dead-code elimination is load-bearing: with `import.meta.env.DEV` statically `false` in a production build, the bundler drops the entire branch, so the machine-invocation code is physically absent from shipped JS.

**(d) Panel UI.** The Machines panel gains an "intents" affordance on the selected machine: each intent name becomes a button; clicking prompts for args (a small JSON input for non-trivial intents) and requires a confirm click before the panel sends `intent:invoke`. The affordance renders only when the store reports the app is a dev build — see §4.

## 3. What changes / what doesn't

**Changes (all in `@rtc/devtools-core`, plus the panel UI in `@rtc/devtools-app`):**
- `protocol.ts` — `InspectorToApp` gains `intent:invoke`; `PROTOCOL_VERSION → 2`.
- `instrument/machines.ts`, `instrument/presenters.ts` — pass the wrapped intents map to registration.
- `DevtoolsHub.ts` — machine entry stores `intents`; the gated inbound handler.
- `InspectorClient.ts` — a `invokeIntent(machineId, name, args)` method that sends the message.
- `@rtc/devtools-app` — Machines panel intent buttons + confirm + JSON-arg input, dev-build-gated.

**Does NOT change:** the domain, any machine/presenter/entity, the composition-root wiring shape, or the observe-only guarantee in production. The wrapped intents are already created by the instrumentation; injection just calls them.

## 4. Dev-build signalling to the panel

The panel must know whether the app is a dev build so it shows the affordance only when injection will work. The hub already sends `welcome { appId, v }`; add an optional `dev: boolean` to `welcome` (set from `import.meta.env.DEV` at the app composition root). The panel enables intent buttons only when `welcome.dev === true`. This is advisory UX only — the real enforcement is the compiled-out handler (b/c); a hostile panel sending `intent:invoke` to a prod app hits a hub with no handler for it.

## 5. Security model

- **Prod builds physically cannot inject** — the handler is dead-code-eliminated. This is the primary control.
- **Dev builds** are developer machines running the simulator or a dev server; injection there is expected and safe.
- **Auditability** — an injected intent flows through the normal `machine:intent` reporting, so the event log shows it like any other intent (optionally tagged `injected: true` for clarity).
- **Confirm-gate** — the panel requires an explicit confirm before sending, preventing fat-finger fires.
- **Future token gate** (not built) — would allow enabling injection in a non-dev build behind a provisioned secret, for controlled staging use. Explicitly out of v1.

## 6. Testing

1. **Hub handler (unit, node, dev-env):** with a fake transport, a registered machine whose intents are spies, send `intent:invoke` → assert the spy is called with the args and a `machine:intent` event is emitted. Send `intent:invoke` for an unknown machine / unknown intent → `devtools:error`, no throw.
2. **Gate (unit):** with `import.meta.env.DEV` stubbed false, `intent:invoke` is a no-op (no spy call). Vitest can set this via `vi.stubEnv`/define; assert both branches.
3. **Protocol (unit):** `InspectorClient.invokeIntent` sends the correctly-shaped message; version mismatch path unchanged.
4. **Panel (jsdom):** intent buttons render only when `welcome.dev === true`; clicking + confirming calls `invokeIntent`; the JSON-arg input parses/validates.
5. **Integration (jsdom):** the existing `devtoolsIntegration.test.ts` pattern extended — create a real machine via instrumented factories, inject its intent through a wired hub, assert the machine's state advances.

## 7. Non-goals / future

- **Presenter-level intent injection** — same mechanism, but presenters expose intents differently; deferred to a follow-up once machine injection is proven.
- **Token-gated injection in non-dev builds** — the documented future control for staging.
- **Arbitrary method/replay-time injection** — injection targets the current live instance only.

## 8. Success criteria

1. In a dev build, selecting a machine in the panel and firing an intent advances that machine's real state, visible live in the inspector.
2. A production build contains **no** intent-invocation code (verified by the compiled-out branch / a bundle grep in a build test).
3. Observe-only guarantee, dormancy, and the "tap never hurts the app" invariant are all preserved.
4. All gates green; hub handler + gate + panel unit-tested per §6.
