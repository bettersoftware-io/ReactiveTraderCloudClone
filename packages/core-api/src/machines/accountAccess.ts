/** Which emailed code the code step is for. */
export type AccountAccessFlow = "signup" | "reset";

/** The login screen's account flows, by phase. `signIn` is the machine at
 * rest (the ordinary sign-in form). No phase ever carries a password or a
 * code: the machine holds the chosen password in its closure until the
 * confirmation request leaves (spec §5.3). */
export type AccountAccessState =
  | { readonly phase: "signIn" }
  | {
      readonly phase: "register";
      readonly busy: boolean;
      readonly error: string | null;
    }
  | {
      readonly phase: "code";
      readonly flow: AccountAccessFlow;
      /** The address the code went to, when this machine sent it; null when
       * the user arrived with a code of their own and types the address. */
      readonly email: string | null;
      /** True while the machine holds the password chosen on the
       * create-account form; the form shows a password field when false. */
      readonly passwordHeld: boolean;
      /** True right after a resend the server accepted. */
      readonly resent: boolean;
      readonly busy: boolean;
      readonly error: string | null;
    }
  | {
      readonly phase: "requestReset";
      readonly busy: boolean;
      readonly error: string | null;
    }
  | { readonly phase: "pendingApproval"; readonly email: string }
  | { readonly phase: "passwordUnset"; readonly email: string }
  | { readonly phase: "passwordChanged"; readonly email: string };

export interface RegistrationInput {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

/** What the code form submits. `email` and `password` are read only when
 * the machine holds none (`email === null` / `passwordHeld === false`). */
export interface CodeInput {
  readonly email?: string;
  readonly code: string;
  readonly password?: string;
}

export interface AccountAccessIntents {
  startRegistration(): void;
  startReset(): void;
  /** "I already have a code": the sign-up code step with nothing held. */
  startCodeEntry(): void;
  returnToSignIn(): void;
  register(input: RegistrationInput): void;
  requestReset(email: string): void;
  submitCode(input: CodeInput): void;
  /** Sends a fresh code to the held address, or to `email` when none is held. */
  resendCode(email?: string): void;
}
