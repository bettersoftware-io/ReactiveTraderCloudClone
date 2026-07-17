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
