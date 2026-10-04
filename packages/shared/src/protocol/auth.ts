export interface SessionUserDto {
  readonly name: string;
  readonly initials: string;
  readonly role: string;
  readonly id: string;
  readonly email: string;
  readonly desk: string;
  readonly clearance: string;
}

export interface LoginRequestDto {
  readonly username: string;
  readonly password: string;
}

export interface LoginResponseDto {
  readonly token: string;
  readonly user: SessionUserDto;
  readonly exp: number;
}

export function isLoginRequestDto(value: unknown): value is LoginRequestDto {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Record<string, unknown>;
  return typeof v.username === "string" && typeof v.password === "string";
}

export interface RegisterRequestDto {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

export interface EmailRequestDto {
  readonly email: string;
}

export interface ConfirmEmailRequestDto {
  readonly email: string;
  readonly code: string;
}

export interface ResetPasswordRequestDto {
  readonly email: string;
  readonly code: string;
  readonly password: string;
}

export type AccountFlowStatus =
  | "code_sent"
  | "pending_approval"
  | "password_changed";

export interface AccountFlowResponseDto {
  readonly status: AccountFlowStatus;
}

export type AccountErrorCode =
  | "banned"
  | "blocked"
  | "invalid_code"
  | "invalid_credentials"
  | "invalid_request"
  | "malformed_json"
  | "pending_approval"
  | "rate_limited"
  | "registration_closed"
  | "unavailable"
  | "unconfirmed";

export interface AccountErrorDto {
  readonly error: AccountErrorCode;
  /** Which input rule failed, on `invalid_request` (a `PasswordRuleId`,
   * `"email"` or `"display-name"`). */
  readonly rule?: string;
}

export function isRegisterRequestDto(
  value: unknown,
): value is RegisterRequestDto {
  return hasStringFields(value, ["email", "displayName", "password"]);
}

export function isEmailRequestDto(value: unknown): value is EmailRequestDto {
  return hasStringFields(value, ["email"]);
}

export function isConfirmEmailRequestDto(
  value: unknown,
): value is ConfirmEmailRequestDto {
  return hasStringFields(value, ["email", "code"]);
}

export function isResetPasswordRequestDto(
  value: unknown,
): value is ResetPasswordRequestDto {
  return hasStringFields(value, ["email", "code", "password"]);
}

function hasStringFields(value: unknown, fields: readonly string[]): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return fields.every((field) => {
    return typeof record[field] === "string";
  });
}
