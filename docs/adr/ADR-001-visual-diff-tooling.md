# ADR-001: Tooling for the visual (visual-diff) test tier

This ADR lives with the code it governs:
[`packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md`](../../packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md).

It is not duplicated here because the golden trees, Playwright CT config, and
runners it decides between all live in that same directory — keeping the
record beside the code it governs means the ADR and the config it describes
can never drift apart.

See also: [§21 Cross-Framework Testing](../architecture/21-cross-framework-testing.md),
which cites this ADR's framework-migration goal as the reason the visual tier
became `client-solid`'s assert-only pixel proof.
