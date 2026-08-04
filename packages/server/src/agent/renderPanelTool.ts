import type { JarvisToolDefinition } from "@rtc/agent-tools";
import {
  PANEL_SPEC_JSON_SCHEMA,
  type PanelSpecV1,
  parsePanelSpec,
} from "@rtc/shared";

export const RENDER_PANEL_TOOL_NAME = "render_panel";

/**
 * Wiring a live brain needs beyond `@rtc/agent-tools`' `JarvisToolDeps`:
 * `knownSymbols` for `parsePanelSpec`'s roster check, `emitPanel` to push the
 * resulting `panel` `JarvisEvent` onto THIS turn's own event stream (the
 * session supplies a closure over its own `currentPush`, mirroring how
 * `execute_trade`'s `ConfirmGate` closes over the session's own confirmation
 * registry — see `AnthropicAgentSession`), and `mintPanelId` — injected
 * rather than called inline so tests get a deterministic id without faking
 * `crypto.randomUUID()`. Production mints `"panel-" + crypto.randomUUID()`.
 */
export interface RenderPanelDeps {
  readonly knownSymbols: readonly string[];
  readonly emitPanel: (panelId: string, spec: PanelSpecV1) => void;
  readonly mintPanelId: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Raw JSON Schema for `render_panel`'s own input envelope — `spec` is the
 * full `PanelSpecV1` shape (`PANEL_SPEC_JSON_SCHEMA`, shared with the
 * scripted engine's vocabulary so the two descriptions can never drift
 * apart); `targetPanelId` is the edit-in-place affordance — set it to
 * restyle/refresh a panel the model already rendered this session rather
 * than opening a new one. */
function buildInputSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      spec: PANEL_SPEC_JSON_SCHEMA,
      targetPanelId: {
        type: "string",
        description:
          "Optional — the id of an EXISTING panel (from a prior render_panel " +
          "result) to update in place, rather than opening a new one. Omit to " +
          "author a brand-new panel.",
      },
    },
    required: ["spec"],
    additionalProperties: false,
  };
}

/**
 * The `render_panel` desk tool: lets a live brain draw a data-visual panel
 * on the desk — a line/table/gauge/sparkGrid/heatmap over live FX ticks,
 * price history, analytics, or the blotter. NOT confirm-gated (unlike
 * `execute_trade`): rendering a read-only visualization has no execution
 * risk, so it resolves straight through. Validation is `parsePanelSpec`'s
 * job (shared with the client-side parse seam) — this handler's only
 * responsibilities are minting/choosing the panel id and relaying the
 * result to `deps.emitPanel`.
 */
export function buildRenderPanelTool(
  deps: RenderPanelDeps,
): JarvisToolDefinition {
  return {
    name: RENDER_PANEL_TOOL_NAME,
    description:
      "Render a data-visualization panel on the desk — a line chart, table, " +
      "gauge, spark grid, or heatmap over live FX ticks, price history, " +
      "analytics, or the blotter. Call this when the user asks to see, chart, " +
      "plot, or visualize something, or when a picture would answer better " +
      "than a sentence. Pass targetPanelId to restyle or refresh a panel you " +
      "already rendered this session instead of opening a new one.",
    inputSchema: buildInputSchema(),
    run: async (input: unknown) => {
      if (!isRecord(input)) {
        return 'Invalid input: expected an object with a "spec" field.';
      }

      const rawTargetPanelId = input.targetPanelId;

      if (
        rawTargetPanelId !== undefined &&
        (typeof rawTargetPanelId !== "string" || rawTargetPanelId.length === 0)
      ) {
        return 'Invalid input: "targetPanelId" must be a non-empty string.';
      }

      const result = parsePanelSpec(input.spec, deps.knownSymbols);

      if (!result.ok) {
        return result.error;
      }

      const panelId = rawTargetPanelId ?? deps.mintPanelId();
      deps.emitPanel(panelId, result.spec);

      return `Rendered panel ${panelId}: ${result.spec.title}`;
    },
  };
}
