# Design drift — app vs mobile-v1 prototype

> **Generated. Do not edit by hand** — run `pnpm prototype-shots:drift`.
>
> **This is not a test report.** The prototype is frozen: it cannot change and
> cannot break, so a difference here is *never* a failure. It measures how far
> the app has moved from the design, and where. See
> [the spec](../../../../../docs/superpowers/specs/2026-08-02-rn-prototype-deviation-corpus-design.md)
> and [the rules](README.md).

Both sides are 1206×2622 — the prototype's simulated screen is exactly the
iPhone 17 logical viewport — so the panels are directly comparable rather than
merely adjacent.

**One expected difference that is NOT drift:** the app column carries the real
iOS status bar and dynamic island; the prototype column does not, because those
are drawn by the simulated bezel outside the captured element. Hardware standing
in for hardware.

## Paired — 14 scenarios

| scenario | app | prototype |
|---|---|---|
| **boot/core** | <img src="../../../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/boot/core.png" width="300"> | <img src="./boot/core.png" width="300"> |
| **boot/laser** | <img src="../../../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/boot/laser.png" width="300"> | <img src="./boot/laser.png" width="300"> |
| **boot/docking** | <img src="../../../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/boot/docking.png" width="300"> | <img src="./boot/docking.png" width="300"> |
| **boot/hologram** | <img src="../../../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/boot/hologram.png" width="300"> | <img src="./boot/hologram.png" width="300"> |
| **boot/geo** | <img src="../../../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/boot/geo.png" width="300"> | <img src="./boot/geo.png" width="300"> |
| **boot/layers** | <img src="../../../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/boot/layers.png" width="300"> | <img src="./boot/layers.png" width="300"> |
| **boot/jarvis** | <img src="../../../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/boot/jarvis.png" width="300"> | <img src="./boot/jarvis.png" width="300"> |
| **boot/topo** | <img src="../../../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/boot/topo.png" width="300"> | <img src="./boot/topo.png" width="300"> |
| **blotter/seeded** | <img src="../../../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/blotter/seeded.png" width="300"> | <img src="./blotter/seeded.png" width="300"> |
| **analytics/dashboard** | <img src="../../../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/analytics/dashboard.png" width="300"> | <img src="./analytics/dashboard.png" width="300"> |
| **credit/rfq-tiles** | <img src="../../../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/credit/rfq-tiles.png" width="300"> | <img src="./credit/rfq-tiles.png" width="300"> |
| **credit/sell-side** | <img src="../../../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/credit/sell-side.png" width="300"> | <img src="./credit/sell-side.png" width="300"> |
| **shell/appearance** | <img src="../../../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/shell/appearance.png" width="300"> | <img src="./shell/appearance.png" width="300"> |
| **lock/hold** | <img src="../../../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/lock/hold.png" width="300"> | <img src="./lock/hold.png" width="300"> |

## Prototype only — 7

Surfaces the app has no golden for. Not drift — design reference. `rates/*`
exists because that golden was never pinned; `equities/*` because the module is
not built yet, so these are Phase 5b's reference.

| scenario | prototype |
|---|---|
| **rates/grid** | <img src="./rates/grid.png" width="300"> |
| **rates/ticket** | <img src="./rates/ticket.png" width="300"> |
| **equities/markets** | <img src="./equities/markets.png" width="300"> |
| **equities/trade** | <img src="./equities/trade.png" width="300"> |
| **equities/blotter** | <img src="./equities/blotter.png" width="300"> |
| **credit/new-rfq** | <img src="./credit/new-rfq.png" width="300"> |
| **shell/dock-open** | <img src="./shell/dock-open.png" width="300"> |

## Ceremony filmstrips — 3

One ceremony, sampled at several instants, left to right. Prototype only: the
app side of a motion reference needs a booted simulator and a human, which is
the dependency this corpus exists to remove.

| ceremony | instants (s) | prototype |
|---|---|---|
| **rates/exec-ceremony** | 0, 0.35, 0.75, 1.6 | <img src="./filmstrips/rates/exec-ceremony.png" width="620"> |
| **credit/accept-ceremony** | 0, 0.4, 0.9, 1.8 | <img src="./filmstrips/credit/accept-ceremony.png" width="620"> |
| **credit/countdown-ring** | 0, 3, 6, 9 | <img src="./filmstrips/credit/countdown-ring.png" width="620"> |

## App only — 2

The app has these; the design never specified them. Worth knowing: a corpus that
only looked for missing app surfaces would never surface this direction.

- `boot/static`
- `shell/connection-banner`
