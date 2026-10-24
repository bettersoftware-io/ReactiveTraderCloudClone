import type {
  AccountDirectory,
  AccountListing,
  AccountLookup,
  AdminWrite,
  ConfirmOutcome,
  PasswordCheck,
  PurgeOutcome,
  RegistrationCount,
  ResetOutcome,
  SendOutcome,
  SignUpOutcome,
} from "./AccountDirectory.js";

/**
 * The directory of a server with no account store configured: every
 * operation is `unavailable`. Registered logins then answer 503 and the
 * roster path is untouched. Also the base that tests override one method of.
 */
export function createDisabledAccountDirectory(): AccountDirectory {
  return {
    kind: "disabled",
    signUp: (): Promise<SignUpOutcome> => {
      return Promise.resolve("unavailable");
    },
    resendCode: (): Promise<SendOutcome> => {
      return Promise.resolve("unavailable");
    },
    confirmEmail: (): Promise<ConfirmOutcome> => {
      return Promise.resolve("unavailable");
    },
    checkPassword: (): Promise<PasswordCheck> => {
      return Promise.resolve({ outcome: "unavailable" });
    },
    requestReset: (): Promise<SendOutcome> => {
      return Promise.resolve("unavailable");
    },
    resetPassword: (): Promise<ResetOutcome> => {
      return Promise.resolve("unavailable");
    },
    findAccount: (): Promise<AccountLookup> => {
      return Promise.resolve({ outcome: "unavailable" });
    },
    findByEmail: (): Promise<AccountLookup> => {
      return Promise.resolve({ outcome: "unavailable" });
    },
    purgeUnconfirmedBefore: (): Promise<PurgeOutcome> => {
      return Promise.resolve({ outcome: "unavailable" });
    },
    countRegistrationsSince: (): Promise<RegistrationCount> => {
      return Promise.resolve({ outcome: "unavailable" });
    },
    ping: (): Promise<boolean> => {
      return Promise.resolve(false);
    },
    listAccounts: (): Promise<AccountListing> => {
      return Promise.resolve({ outcome: "unavailable" });
    },
    setApproved: (): Promise<AdminWrite> => {
      return Promise.resolve("unavailable");
    },
    setBlocked: (): Promise<AdminWrite> => {
      return Promise.resolve("unavailable");
    },
    rename: (): Promise<AdminWrite> => {
      return Promise.resolve("unavailable");
    },
    deleteAccount: (): Promise<AdminWrite> => {
      return Promise.resolve("unavailable");
    },
    revokeSessions: (): Promise<AdminWrite> => {
      return Promise.resolve("unavailable");
    },
  };
}
