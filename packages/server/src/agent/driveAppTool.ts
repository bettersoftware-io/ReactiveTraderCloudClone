import type { JarvisToolDefinition } from "@rtc/agent-tools";
import {
  DRIVE_COMMAND_JSON_SCHEMA,
  type DriveBatchV1,
  parseDriveBatch,
} from "@rtc/shared";

export const DRIVE_APP_TOOL_NAME = "drive_app";

/**
 * `emitDrive` mirrors `RenderPanelDeps.emitPanel` — injected so the
 * handler can push the resulting `command` `JarvisEvent` onto THIS turn's
 * own event stream (the session supplies a closure over its own
 * `currentPush`, see `AnthropicAgentSession.emitCommandEvent`). Unlike
 * `render_panel`, `drive_app` mints nothing and checks no roster, so it
 * needs no further deps.
 */
export interface DriveAppDeps {
  readonly emitDrive: (batch: DriveBatchV1) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Raw JSON Schema for `drive_app`'s own input envelope. `commands` is
 * embedded VERBATIM from `DRIVE_COMMAND_JSON_SCHEMA` — the same
 * anyOf-per-kind item schema `parseDriveBatch` validates against, so the
 * two descriptions of "what a command looks like" cannot drift apart. The
 * batch's `v: 1` discriminant is an internal versioning concern with no
 * informational value to the model, so it is deliberately left OFF this
 * model-facing envelope (see the R1 envelope-drift lesson in
 * `jarvisPersona.ts`'s drive few-shots) — `run` below fills it in before
 * calling `parseDriveBatch`. */
type DriveCommandJsonSchemaShape = {
  readonly properties: { readonly commands: unknown };
};

function buildInputSchema(): Record<string, unknown> {
  const { commands } = (
    DRIVE_COMMAND_JSON_SCHEMA as DriveCommandJsonSchemaShape
  ).properties;

  return {
    type: "object",
    properties: { commands },
    required: ["commands"],
    additionalProperties: false,
  };
}

/**
 * The `drive_app` desk tool: lets a live brain act on the desk directly —
 * switch tabs, maximize/restore/collapse/expand a panel, drive the
 * equities chart controls, change theme/power-saver, or dismiss a panel —
 * by emitting a batch of 1-8 `DriveCommandV1`s, applied in order. NOT
 * confirm-gated (like `render_panel`, unlike `execute_trade`): driving the
 * UI has no execution risk, so it resolves straight through. Validation is
 * `parseDriveBatch`'s job (shared with the client-side apply adapter) —
 * this handler's only responsibilities are filling in the batch's constant
 * `v: 1` (kept off the model-facing schema above, see `buildInputSchema`)
 * and relaying the result to `deps.emitDrive`. Rejection is all-or-nothing
 * at the batch level: `parseDriveBatch` stops at the first invalid command,
 * so a batch with 7 good commands and 1 bad one applies NONE of them.
 */
export function buildDriveAppTool(deps: DriveAppDeps): JarvisToolDefinition {
  return {
    name: DRIVE_APP_TOOL_NAME,
    description:
      "Drive the app on the user's behalf: switch tabs, maximize/restore/" +
      "collapse/expand a panel, change the equities symbol/timeframe/chart " +
      "type/indicators/panes, change the theme skin, change the " +
      "power-saver level, or dismiss a panel. Pass 1-8 commands, applied " +
      "in order, all-or-nothing — if any command is invalid, none are " +
      "applied. Only call this on an explicit user request to change " +
      "something, or once the user accepts an offer you made — never as " +
      "an unprompted action.",
    inputSchema: buildInputSchema(),
    run: async (input: unknown) => {
      if (!isRecord(input)) {
        return 'Invalid input: expected an object with a "commands" field.';
      }

      const result = parseDriveBatch({ v: 1, commands: input.commands });

      if (!result.ok) {
        return result.error;
      }

      deps.emitDrive(result.batch);

      return `Drove the app, sir — applied: ${result.batch.commands.length} command(s).`;
    },
  };
}
