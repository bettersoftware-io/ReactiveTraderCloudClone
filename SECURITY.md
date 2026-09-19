# Security Policy

This repository is a **demonstration project** — a clean-architecture
re-creation of ReactiveTraderCloud. It handles no real money, no customer data,
and its trading, pricing and accounts are simulated. The demo login roster is
committed on purpose (see `CLAUDE.md`, "Demo accounts & auth env") and is not a
finding.

That said, the pipeline and the deployed demo are real, and reports are welcome.

## Reporting a vulnerability

Please report privately through GitHub:
**[Security → Report a vulnerability](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/security/advisories/new)**
(private vulnerability reporting is enabled on this repository).

Please do **not** open a public issue or pull request for a suspected
vulnerability.

Useful things to include: what you found, where (file / workflow / deployed
URL), and how to reproduce it.

## What to expect

This is maintained by one person, best-effort: expect an acknowledgement within
about a week. There is no bug bounty.

## Scope

In scope:

- the code in this repository;
- its GitHub Actions workflows and supply chain (`.github/`, `scripts/`);
- the deployed demo (the web clients and `wss://rtc-clone-server.fly.dev`).

Out of scope:

- the committed demo credentials and anything reachable only with them — they
  are public by design;
- denial of service against the free-tier demo hosting;
- findings in third-party dependencies with no demonstrated impact here —
  please report those upstream (Dependabot and Dependency Review track known
  advisories already).

## Supported versions

Only the tip of `main` is supported; there are no releases.

## How this repository defends itself

The security tooling in CI — what runs, what was declined and why — is recorded
in [ADR-007](docs/adr/ADR-007-ci-security-tooling.md).
