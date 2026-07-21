# @rtc/boot-splash

Framework-free boot / splash feature shared by the web clients
(`@rtc/client-react`, `@rtc/client-solid`): the canvas boot-animation engine
(`bootCanvas.ts` + `variants/*`), the play-decision gate (`bootSplashGate.ts`),
and the shared boot stylesheets.

Zero `@rtc/*` dependencies. Unlike `@rtc/motion-core` (pure, no-DOM math) this
package legitimately touches the DOM: the engine draws to a `CanvasRenderingContext2D`
and the gate reads `navigator`/`window.location`. Its only architectural
constraint is that it imports no other `@rtc` package
(`boot-splash-stays-pure` in `.dependency-cruiser.cjs`).

Symbols keep the `Boot*` vocabulary; the package name marries the code term
("boot") with the user-facing term ("splash").
