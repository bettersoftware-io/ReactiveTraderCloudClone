import type {
  AccessLevel,
  AccountAdminRefusal,
  AccountStatus,
} from "@rtc/domain";

/** The wire form of `AccountSummary`. */
export interface AccountSummaryDto {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly access: AccessLevel;
  readonly status: AccountStatus;
  readonly joinedAt: number;
  readonly isSelf: boolean;
}

/** One of three answers: the list, a done action, or a refusal word. */
export type AccountAdminAnswerDto =
  | { readonly accounts: readonly AccountSummaryDto[] }
  | { readonly done: true }
  | { readonly error: AccountAdminRefusal };

export interface AccountIdPayload {
  readonly accountId: string;
}

export interface AccountRenamePayload extends AccountIdPayload {
  readonly displayName: string;
}

/** WebSocket close code and reason for a session the server has ended. */
export const SESSION_ENDED_CLOSE_CODE = 4401;
export const SESSION_ENDED_REASON = "session_ended";

/** Longest display name the frame guard lets through, in UTF-16 units. The
 * rule itself (invisible characters, stacking) is the server's. */
const DISPLAY_NAME_FRAME_MAX = 200;

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const REFUSALS: readonly string[] = [
  "forbidden",
  "self",
  "not_found",
  "invalid_name",
  "unavailable",
];

const ACCESS_LEVELS: readonly string[] = ["user", "admin"];
const STATUSES: readonly string[] = [
  "unconfirmed",
  "pending",
  "active",
  "blocked",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_SHAPE.test(value);
}

export function isAccountIdPayload(value: unknown): value is AccountIdPayload {
  return isRecord(value) && isUuid(value.accountId);
}

export function isAccountRenamePayload(
  value: unknown,
): value is AccountRenamePayload {
  return (
    isAccountIdPayload(value) &&
    typeof (value as unknown as Record<string, unknown>).displayName ===
      "string" &&
    ((value as unknown as Record<string, unknown>).displayName as string)
      .length <= DISPLAY_NAME_FRAME_MAX
  );
}

function isAccountSummaryDto(value: unknown): value is AccountSummaryDto {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.email === "string" &&
    typeof value.displayName === "string" &&
    typeof value.access === "string" &&
    ACCESS_LEVELS.includes(value.access) &&
    typeof value.status === "string" &&
    STATUSES.includes(value.status) &&
    typeof value.joinedAt === "number" &&
    typeof value.isSelf === "boolean"
  );
}

export function isAccountAdminAnswerDto(
  value: unknown,
): value is AccountAdminAnswerDto {
  if (!isRecord(value)) {
    return false;
  }

  if (Array.isArray(value.accounts)) {
    return value.accounts.every(isAccountSummaryDto);
  }

  if (value.done === true) {
    return true;
  }

  return typeof value.error === "string" && REFUSALS.includes(value.error);
}
