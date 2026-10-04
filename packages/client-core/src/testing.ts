// Test scaffolding for anything that composes an application core over these
// adapters — the RxJS core's own tests today. Not part of the root index: a
// client's source has no use for a fake, and the root is what a client
// imports.
export * from "#/adapters/__tests__/awaitPendingRpc";
export * from "#/adapters/__tests__/FakeWsAdapter";
export * from "#/adapters/connectionIntents.testHelpers";
