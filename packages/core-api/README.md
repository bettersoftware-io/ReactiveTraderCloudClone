# @rtc/core-api

Types only. The contract every application core (`@rtc/client-core`,
`@rtc/client-core-async`, `@rtc/client-core-effect`) implements and every
binding consumes: `Presenters`, `MachineFactories`, `AppCommands`, `App`,
`AppPorts`, `CoreFactory`, the `Machine` shape, and the `Stream` /
`StateStream` envelope aliases. Exports no runtime value (grep gate 42).
See `docs/adr/ADR-006-pluggable-application-core.md`.
