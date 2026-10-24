export type AccountActionKind =
  | "approve"
  | "block"
  | "unblock"
  | "rename"
  | "delete";

/** One account row's action, by phase. `idle` is the machine at rest. */
export type AccountActionState =
  | { readonly phase: "idle" }
  | { readonly phase: "confirmingDelete" }
  | {
      readonly phase: "renaming";
      readonly draft: string;
      /** The live display-name check's text, or null when the draft passes. */
      readonly draftError: string | null;
    }
  | { readonly phase: "inFlight"; readonly action: AccountActionKind }
  | {
      readonly phase: "failed";
      readonly action: AccountActionKind;
      readonly message: string;
    };

export interface AccountActionIntents {
  approve(): void;
  block(): void;
  unblock(): void;
  startRename(current: string): void;
  editName(draft: string): void;
  submitRename(): void;
  requestDelete(): void;
  confirmDelete(): void;
  cancel(): void;
  dismiss(): void;
}
