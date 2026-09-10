# A2UI and the generative-UI standards landscape vs our `render_panel` contract

**Date:** 2026-09-10
**Status:** research note — no adoption decision taken
**Question:** Google's A2UI protocol standardises agent-driven UI. Is it useful
to this repo's Jarvis generative-UI surface — adopt, adapt, or watch?

## What A2UI is

A2UI ("Agent to UI") is a Google-led open protocol for **agent-driven
interfaces**: the agent streams declarative JSON describing UI components and
associated state; the client renders them with its **own native widgets** from
a **catalog the host advertises** at session start. No code crosses the wire —
only component references, props, data bindings, and events flowing back to
the agent. Announced late 2025; v0.8 shipped December 2025; v0.9 shipped April
2026 with reference renderers for Flutter, Lit, Angular, and React plus a
Python agent SDK; the v1.0 spec is in **Candidate** status (created 2025-11-20,
last updated 2026-06-08). Transports today are A2A and AG-UI; raw
WebSocket/SSE/REST are still "proposed."

Sources: [Google announcement](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/),
[v1.0 candidate spec](https://a2ui.org/specification/v1.0-a2ui/),
[InfoQ on v0.9](https://www.infoq.com/news/2026/07/google-a2ui-genui/).

## The competing standards (as of mid-2026)

| Standard | Backer | Model | Relevance here |
|---|---|---|---|
| **A2UI** | Google | declarative component JSON against a host-advertised catalog | closest conceptual match to our GenUI design |
| **MCP Apps** | Anthropic/MCP community | UI attached to MCP tool results | we already ship a `/mcp` endpoint (§18.14) — the transport is adopted |
| **AG-UI** | CopilotKit | agent↔user interaction event stream (also an A2UI transport) | overlaps our WS wire's Jarvis frames |
| **ChatKit** | OpenAI | hosted chat UI components | not applicable — vendor-hosted UI |

The standards fight is **not settled**: A2UI is pre-GA, the others are moving,
and each large vendor is promoting its own. That alone argues against adopting
any of them as the internal contract today.

## How A2UI compares to what we built

The repo's GenUI surface ([architecture §18.16](../architecture/18-jarvis-ai-agent-surface.md#1816-the-generative-ui-surface-round-1))
made the same architectural bet as A2UI, independently and earlier in our
timeline: `render_panel` emits `{renderer, props}` from a **closed
vocabulary**; each client renders with **committed renderers** (React, Solid —
RN pending its Skia ports); validation **fails closed**; the model never gets
arbitrary UI power. Line by line:

| Concern | A2UI v1.0-candidate | Our GenUI contract |
|---|---|---|
| UI description | declarative component JSON | `PanelSpec` (`renderer` + typed props) |
| Component set | generic catalog (cards, lists, forms, text) + custom components | domain vocabulary (price sparkline, heatmap, comparison table, …) |
| Catalog discovery | host advertises at session start | compiled in; server persona + tool schema pin the vocabulary |
| Safety | no arbitrary code; vetted components only | same; fail-closed `PanelSpec` validation, sanitized errors |
| Events back to agent | data-binding + event messages | drive outcomes (partial — see the correction-signal gap in STATUS) |
| Multi-client | per-framework renderers (Flutter/Lit/Angular/React) | React + Solid at pixel parity via ui-contract; RN pending |
| Transport | A2A, AG-UI | our WS wire (`CLIENT_MSG`/`SERVER_MSG`) + sim-mode in-process |

Two honest deltas in A2UI's favour: **catalog advertisement** (our vocabulary
is compiled in, not negotiated — a session-start capability handshake is the
one A2UI idea worth stealing if renderer versions ever skew between deployed
client and server) and **interop** (an A2UI-speaking host could render Jarvis
panels without knowing our wire).

Two in ours: our **domain vocabulary is stronger than A2UI's generic catalog**
for a trading desk (a depth ladder is not a `Card`), and our contract is
**pinned by the full test stack** (contract specs against both clients, visual
goldens, e2e) — churning it against a pre-1.0 external spec would spend that
hardening for interop we don't yet need.

## Assessment

- **Full adoption: no.** Pre-GA spec, unsettled standards race, generic
  catalog weaker than our domain vocabulary, and the internal contract is
  load-bearing across three clients and the test stack.
- **Adapter at the boundary: plausible, as a showcase round.** A server-side
  translation layer mapping `PanelSpec` ↔ A2UI messages — the same
  architectural move as the `/mcp` endpoint, which exposed `agent-tools` to
  external MCP clients without touching the registry. Moderate cost, zero
  churn to the internal contract, and the showcase gains "standards-aligned
  generative UI" honestly.
- **MCP Apps may be the closer fit.** Same vetted-components philosophy,
  riding a transport this repo already ships (`/mcp`, server-confined SDK).
  If an interop round ever happens, evaluate MCP Apps *first*, A2UI second.
- **Watch trigger:** A2UI v1.0 reaching final + a WebSocket/SSE transport
  landing would materially change the adapter cost; re-check then.

**Recommendation:** no action now; pointer filed under
[IDEAS §Jarvis](../IDEAS.md#jarvis). An adapter round, if ever, ranks behind
the correction-signal round and the GenUI × Dockview round on the Jarvis
backlog.
