# Running mobile tests in CI — options, costs and trade-offs

Decision-support for [rn-open-items.md](rn-open-items.md) **T1**: the RN visual
and e2e tiers gate nothing in CI, because iOS pixels need a Mac and every job in
[`ci.yml`](../.github/workflows/ci.yml) runs `ubuntu-latest`. This page is the
landscape — what the options are, what they cost, what they actually buy, what
teams really do — and a staged recommendation for this repo.

**Written 2026-07-25.**

> **Every price on this page has a shelf life.** Vendor pricing, free tiers and
> runner images change without notice, and a stale figure quoted confidently is
> the main way this document could do harm. Re-check anything you are going to
> budget against, at the source, before you spend. Figures verified against a
> primary source are cited; figures that could not be verified are labelled
> **UNVERIFIED** and listed together in the last section.

---

## 1. The constraint, stated precisely

### iOS cannot run on Linux — and it is a licence, not a missing port

Building or simulating an iOS app requires Xcode, and Xcode runs only on macOS.
macOS in turn may only be run on Apple hardware: Apple's software licence
agreement for macOS Tahoe 26 permits installing and running the OS "on a single
Apple-branded computer at a time", and permits virtual instances only "within
virtual operating system environments **on each Apple-branded computer you
own**" — capped at **two additional copies or instances** per machine
([Apple SLA, macOS Tahoe 26](https://www.apple.com/legal/sla/docs/macOSTahoe.pdf)).

Three consequences follow, and they explain the entire cost structure of iOS CI:

1. **No Linux container can host it.** There is no legitimate `docker run
   xcode`. Every iOS CI provider, without exception, is reselling access to
   physical Apple hardware sitting in a rack somewhere.
2. **Density is legally capped.** Even a beefy Mac Studio may host only two
   macOS VMs. A Linux host runs dozens of containers. That ~1:2 ceiling is why
   a macOS CI minute costs roughly **10×** a Linux one on GitHub-hosted runners
   (see §2.1), and why every cloud Mac provider bills by the *whole machine* or
   by the hour with a long minimum, never by the second.
3. **Capacity is procured, not summoned.** Providers buy Macs in advance. That
   is why queue times on macOS runners are worse than on Linux, why macOS
   concurrency limits are separate and much lower, and why AWS makes you hold a
   Mac host for a full day.

The Apple Developer Program membership ($99/yr) is *not* needed to run
simulator tests — it is needed to sign builds for real devices, TestFlight and
the App Store. Simulator-only CI needs no membership. (Xcode Cloud is the
exception: it is sold through the Developer Program — see §2.4.)

### Android is a completely different problem

The Android emulator is a QEMU-based x86_64 virtual machine. It runs on Linux,
it is hardware-accelerated by KVM, and GitHub's **x86 Linux runners expose
`/dev/kvm`** — GitHub extended hardware-accelerated Android virtualisation down
to 2-vCPU Linux runners in April 2024
([changelog](https://github.blog/changelog/2024-04-02-github-actions-hardware-accelerated-android-virtualization-now-available/)).
The widely used
[`reactivecircus/android-emulator-runner`](https://github.com/ReactiveCircus/android-emulator-runner)
action boots an AVD on `ubuntu-latest` after a one-line udev rule, and its own
README now recommends Linux runners over macOS ones as "2-3 times faster … and
a lot more expensive". Note the asymmetry inside the asymmetry: GitHub's **arm64
Linux runners do not expose KVM**, so an Android emulator job must pin an x86_64
Linux runner.

**So: Android e2e and Android visual tests can be gated like any other job, on
free Linux runners, today.** Only iOS is expensive.

This matters more for this repo than it first appears. The RN client is
Expo/React Native and its Maestro tier is already cross-platform by
construction — [`BAKEOFF.md`](../packages/client-react-native/tests/visual/BAKEOFF.md)
scores Maestro "Android-portable ✅" against simctl's "❌ Apple-only". An Android
tier would be a *new* golden set and a new device pin, not a rewrite. It is the
cheapest way to make the RN UI gate *something* in CI, and it is worth weighing
against every paid iOS option below.

---

## 2. The options

### 2.1 GitHub-hosted macOS runners

**What it is.** `runs-on: macos-26` (or `macos-latest`) in an existing workflow.
Apple silicon VMs managed by GitHub, pre-loaded with Xcode and simulator
runtimes.

**Cost.** For **public repositories, standard runners — including macOS — are
free and unlimited**
([GitHub docs](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)).
This repo is public, so **the iOS runner minutes cost nothing.** For private
repos, from the
[billing reference](https://docs.github.com/en/billing/reference/actions-minute-multipliers)
(fetched 2026-07-25):

| Runner | $/minute |
|---|---:|
| Linux 2-core x64 (standard) | 0.006 |
| Linux 2-core arm64 (standard) | 0.005 |
| Windows 2-core (standard) | 0.010 |
| **macOS 3–4 core (standard)** | **0.062** |
| macOS 12-core x64 (larger) | 0.077 |
| macOS 5-core M2 Pro arm64 (larger) | 0.102 |

Included monthly minutes on private repos: Free 2,000 · Pro 3,000 · Team 3,000 ·
Enterprise 50,000. **Larger runners are never free, even on public
repositories.** A macOS minute is ~10× a Linux minute — the old "10× minute
multiplier" model, now expressed as explicit per-minute rates.

**Concurrency and time limits**
([limits reference](https://docs.github.com/en/actions/reference/limits)):
total concurrent jobs Free 20 / Pro 40 / Team 60 / Enterprise 500, but
**concurrent macOS jobs are capped separately at 5** (Free/Pro/Team) or 50
(Enterprise), *shared across standard and larger runners*. Max 6 h per job.
That cap is the real constraint on fan-out — you cannot shard an iOS suite 20
ways on a Team plan.

**Images.** `macos-latest` is migrating to `macos-26` between 15 June and 15
July 2026
([changelog](https://github.blog/changelog/2026-02-26-macos-26-is-now-generally-available-for-github-hosted-runners/),
[runner-images#14167](https://github.com/actions/runner-images/issues/14167)).
The `macos-26` arm64 image (version `20260715.0248.1`, from the
[image manifest](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md))
ships:

- Xcode **26.6, 26.5, 26.4.1, 26.3, 26.2, 26.1.1, 26.0.1** (default 26.5 at
  that manifest revision; GitHub set the macOS 26 default to Xcode 26.6 on
  2026-07-21)
- iOS simulator runtimes **26.2, 26.4, 26.5**
- Simulator devices including **iPhone 17, 17 Pro, 17 Pro Max, 17e**
- Node 24, npm, Yarn — but **not** pnpm, idb or Maestro

GitHub is also moving to a support model where each macOS image is keyed to a
major *Xcode* version rather than a macOS version, and Xcode 27 is already in
public preview
([changelog](https://github.blog/changelog/2026-07-16-xcode-27-runner-image-now-in-public-preview/)).
Expect the installed-Xcode set to churn; pin explicitly with
`xcode-select` / `DEVELOPER_DIR`, never rely on the default.

**This is directly relevant to this repo.** The RN goldens are pinned to
`ios-iphone17-26` — iPhone 17 on iOS 26.x
([`shared/goldens.ts`](../packages/client-react-native/tests/visual/shared/goldens.ts)).
GitHub's `macos-26` image has exactly that device and runtime family. The
device pin is *reachable* on a free runner. Whether the *pixels* match is a
separate question (§5) — almost certainly they will not, at first.

**Pros**
- Free on this repo. No account, no card, no procurement.
- Same workflow syntax, same actions, same secrets as existing jobs.
- Xcode and simulators pre-installed; no image maintenance.
- Machine is discarded after each job — no state drift between runs.

**Cons**
- **14 GB of SSD is documented for macOS standard runners.** Xcode plus extra
  simulator runtimes plus a `node_modules` tree plus an Expo dev build is a
  real squeeze; expect to delete unused Xcodes/runtimes as a workflow step.
- 3 cores / 7 GB RAM (arm64 standard). Booting a simulator, running Metro, and
  building a dev client on that is slow — budget **10–25 min** per run, not 2.
  *(That range is an estimate from the shape of the work, not a measurement —
  UNVERIFIED.)*
- **5 concurrent macOS jobs** ceiling.
- Image contents change on GitHub's schedule, not yours. A default-Xcode bump
  can move every golden pixel overnight.
- Tooling this repo needs is not preinstalled: `pnpm` (Corepack handles it),
  Maestro (a `curl` install + JDK 17), and **`idb`**, whose Python client
  `fb-idb` requires Python ≤ 3.13 per
  [the harness README](../packages/client-react-native/tests/visual/README.md)
  and whose `idb-companion` comes from a Homebrew tap. Whether that installs
  cleanly and quickly on the `macos-26` arm64 image is **unverified** and is the
  single most likely thing to make a first attempt fail.

**Right choice when:** you have a public repo, or a private repo with modest
iOS needs, and you want simulator-based iOS CI with zero procurement. Which
describes this repo exactly.

### 2.2 Self-hosted Mac runner

**What it is.** Register a Mac — a dedicated Mac mini, or the dev machine that
already runs the suite by hand — as a GitHub Actions self-hosted runner, and
target it with `runs-on: [self-hosted, macOS, ARM64]`.

**Cost.** Hardware + electricity + your time. GitHub charges nothing for
self-hosted runners on any plan. Buying a Mac mini: see §2.3 for current retail.

**Pros**
- **Bit-for-bit the machine the goldens were captured on** — if you register the
  same Mac that produced `__screenshots__/ios-iphone17-26/`, the cross-machine
  pixel problem (§5) simply does not exist on day one. Nothing else on this list
  can say that.
- No per-minute cost, no macOS concurrency cap, no 6-hour job limit.
- Simulators stay warm between runs; a re-run is seconds of boot, not minutes.
- Full control of Xcode version — it changes when *you* change it.

**Cons**
- **Statefulness is the whole problem.** A self-hosted runner accumulates
  simulator state, Derived Data, Metro caches, Homebrew drift. The repo has
  already been bitten by exactly this class of thing:
  [`README.md`](../packages/client-react-native/tests/visual/README.md)
  documents a corrupt `node_modules` producing a phantom Reanimated Babel crash,
  and [rn-open-items.md](rn-open-items.md) T4 records `expo start` rewriting
  `tsconfig.json` on every capture run. On an ephemeral runner these self-heal;
  on a persistent Mac they compound.
- **Security.** Self-hosted runners on a *public* repository are explicitly
  discouraged by GitHub: a fork PR can execute arbitrary code on your machine.
  This is not a soft warning — it is the reason most OSS projects do not do it.
  Mitigations exist (require approval for fork PRs; run only on `push` to
  `main` and on `workflow_dispatch`; never on `pull_request_target`), but they
  must be deliberate.
- Availability. A laptop that sleeps, travels, or gets rebooted is not CI.
- Single point of failure and a bus factor of one.

**Right choice when:** you own a Mac that is already on and idle, the repo is
private (or you are willing to restrict triggers), and pixel-identity with local
goldens matters more than hygiene. Also the natural *second* stage after a
hosted-runner experiment proves the suite works headlessly.

### 2.3 Cloud Mac providers — renting the hardware

Renting bare Apple hardware by the hour or month, then installing your own CI
agent on it. Highest control, highest operational burden.

**AWS EC2 Mac.** Bare-metal Mac Dedicated Hosts. The trap is structural: *"Mac
instances are available only as bare metal instances on Dedicated Hosts, with a
**minimum allocation period of 24 hours** before you can release the Dedicated
Host"*, one instance per host, On-Demand only — no Spot, no Reserved
([AWS EC2 Mac user guide](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-mac-instances.html),
fetched 2026-07-25). Billing is per second *after* that 24 h floor, so an
occasional CI job pays for a full day. On-demand `us-east-1` rates from AWS's own
[pricing feed](https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/dedicatedhost-ondemand.json)
(publication date `2026-07-24`):

| Host family | $/hr | Cost of one isolated build (24 h floor) |
|---|---:|---:|
| `mac2.metal` (M1, 16 GB) | 0.650 | **$15.60** |
| `mac2-m2.metal` (M2, 24 GB) | 0.878 | $21.07 |
| `mac-m4.metal` (M4, 24 GB) | 1.230 | **$29.52** |
| `mac-m4pro.metal` (M4 Pro, 48 GB) | 1.970 | $47.28 |
| `mac1.metal` (Intel i7, 32 GB) | 1.083 | $25.99 |

Launch-to-ready is documented as roughly 6–20 minutes, so even the first build
of a window is slow. Within a held 24 h window you can run unlimited sequential
builds at no extra host cost — which is the shape AWS Mac actually suits:
a busy pipeline, not a nightly job.

**MacStadium.** Monthly-billed dedicated Macs, prices from
[macstadium.com/pricing](https://www.macstadium.com/pricing) (2026-07-25, USD/month,
pre-paid on the 1st): Mac mini M2 8 GB/256 GB **$109**; **M4 16 GB/256 GB $149**;
M4 24 GB/512 GB $249; M4 Pro 48 GB/1 TB $349; Mac Studio M2 Ultra 64 GB $369. No
free trial. **Orka** (their Mac virtualisation/orchestration layer) is still a
current product line but has **no published pricing** — contact-sales / AWS
Marketplace only.

**Scaleway Apple silicon.** Hourly, EUR excl. tax, PAR-1, from
[scaleway.com/en/pricing/apple-silicon](https://www.scaleway.com/en/pricing/apple-silicon/)
(2026-07-25): M1-M €0.11/hr (€75/mo); M2-M €0.17 (€115); **M4-S 16 GB/256 GB
€0.22/hr (€149/mo)**; M4-M €0.29 (€199); M4-XL €0.49 (€335). Same 24-hour floor
as AWS, and Scaleway names the cause: *"Due to license constraints, the minimum
lease for Apple silicon-as-a-Service is 24 hours"*
([Mac mini M4 page](https://www.scaleway.com/en/mac-mini-m4/)). One isolated
M4-S build therefore costs **≈ €5.28** — the cheapest per-build floor of any
hourly cloud Mac found.

**GitHub-Actions-compatible macOS runner resellers** — drop-in `runs-on:`
replacements, all fetched 2026-07-25:

| Provider | macOS shape | $/min |
|---|---|---:|
| [Depot](https://depot.dev/docs/github-actions/runner-types) | `depot-macos-26` (M4), 8 CPU / 24 GB | 0.08 |
| [WarpBuild](https://www.warpbuild.com/pricing) | M4 Pro 6 vCPU / 22 GB | 0.08 |
| [Blacksmith](https://www.blacksmith.sh/pricing) | M4 (3,000 free min/mo) | 0.08 |
| [Namespace](https://namespace.so/pricing) | Apple silicon, Team plan ($100/mo) required | 0.05–0.18 prepaid |

All of them are *more* expensive than GitHub's own $0.062/min standard macOS
runner and all of them cost money on a public repo, where GitHub's is free. They
exist to buy **queue depth and bigger machines**, not a lower price.

**Two market changes worth knowing.** **Cirrus Labs shut Cirrus CI down
effective 1 June 2026** and closed Cirrus Runners to new customers
([cirruslabs.org](https://cirruslabs.org/)) — but relicensed its macOS VM tooling
(Tart, Orchard) permissively with licensing fees dropped, so self-hosted macOS
virtualisation is now free tooling. And **Hetzner no longer offers Mac hosting**
([Hetzner docs](https://docs.hetzner.com/robot/dedicated-server/server-lines/apple-rx-server/):
the Mac mini M1 models *"are no longer available on our website"*). Any
comparison written before 2026 is stale on both counts.

**Buying outright.** Apple's US store lists the Mac mini **M4 from $799** and
**M4 Pro from $1,599**
([apple.com/shop/buy-mac/mac-mini](https://www.apple.com/shop/buy-mac/mac-mini),
2026-07-25). That is ~5.4 months of MacStadium's M4.S, or ~27 isolated 24-hour
AWS `mac-m4` allocations. Per-upgrade RAM/storage deltas could not be read from
the static page — **UNVERIFIED**. Licensing caps what one box can do: host macOS
plus **at most two macOS VMs** (Apple SLA, §1), and the SLA also bars using those
virtual instances *"in connection with service bureau, time-sharing, terminal
sharing, relay service or other similar types of services"*.

**Pros:** full control of the image and the Xcode version; unlimited job time;
no macOS concurrency cap; can be pinned to match your golden-generating
environment.
**Cons:** you own patching, Xcode upgrades, disk hygiene, agent registration and
secrets; the 24-hour floors make hourly providers a bad fit for nightly jobs;
monthly providers mean paying 24×7 for a machine used 20 minutes a day.

**Right choice when:** you need many concurrent macOS jobs, a specific Xcode
your CI provider does not offer, or long-running builds — i.e. an org, not a
side project.

### 2.4 Managed mobile CI

Services whose product *is* a mobile build machine with an opinionated pipeline.

**Codemagic.** The best free macOS allowance outside GitHub: **500 minutes/month
on a Mac mini M2**, personal accounts only, resetting monthly and retained after
enabling billing ([codemagic.io/pricing](https://codemagic.io/pricing/) and
[docs](https://docs.codemagic.io/billing/pricing/), page last updated
2026-06-26). Beyond that, **M2 $0.095/min**, **M4 $0.114/min**, Linux/Windows
$0.045/min; annual unlimited-minute plans from $3,990 (M2) with 3 concurrencies;
extra concurrency $49/mo. Teams get no free minutes. No named open-source
programme (the page mentions only teachers, students and non-profits).

**Bitrise.** Free "Hobby" tier: **300 credits/month**, 1 private app, 90-minute
build timeout, no card ([bitrise.io/pricing](https://bitrise.io/pricing)). Paid
from $89/mo (annual) / $99 (monthly); Pro from $200/mo. macOS machines are M2
Pro / M4 / M4 Pro classes. **Two figures could not be resolved and you should
not plan against them:** the pricing page shows macOS Medium at $0.0072 under a
"Cost per minute" header — ~$0.43/hour for a Mac, an order of magnitude below
every competitor, almost certainly a mislabelled credits column — and **the
credit-to-macOS-minute conversion is not published anywhere**, so the 300 free
credits cannot be converted into minutes. Their open-source programme's only
primary source is a 2018 blog post for a tier that no longer exists.

**Apple Xcode Cloud.** **25 compute hours/month included with an Apple Developer
Program membership** ([Apple](https://developer.apple.com/xcode-cloud/); origin
[news post](https://developer.apple.com/news/?id=ik9z4ll6), Dec 2023, still
stated on the 2026 page), then $49.99/mo for 100 h, $99.99 for 250 h, $399.99
for 1,000 h, $3,999.99 for 10,000 h. It **requires** the Developer Program
($99/yr). React Native works via the three documented custom scripts
(`ci_post_clone.sh`, `ci_pre_xcodebuild.sh`, `ci_post_xcodebuild.sh` — see
[Writing custom build scripts](https://developer.apple.com/documentation/xcode/writing-custom-build-scripts)),
but the images ship **no Node.js**, so every build installs its own toolchain.
Two caveats: compute hours are billed **cumulatively across parallel actions and
per-destination test runs**, not by wall-clock — testing on N simulators costs
N× the time (from WWDC22 session 110374, **partially verified**) — and RN support
is community practice, not an Apple guarantee.

**CircleCI macOS.** Free tier **30,000 credits/month**, no rollover; Performance
from $15/mo. M1/M2 macOS classes reached **end-of-life 2026-02-16**; current
classes are `m4pro.medium` (6 CPU / 28 GB) at **200 credits/min** and
`m4pro.large` at 400 ([price list](https://circleci.com/pricing/price-list/),
updated 2026-07-21). At 25,000 credits for $15 that derives to **≈ $0.12/min**
and **≈ 150 free macOS minutes/month** — both *derived*, not published as such.
Their open-source programme grants up to 400,000 credits/month but **only on
Linux/Arm/Docker**, so OSS status buys **no extra macOS minutes**.

**Cirrus CI — dead.** Shut down effective **1 June 2026**
([cirruslabs.org](https://cirruslabs.org/)); `cirrus-ci.org` no longer resolves.
Remove it from consideration; every free-OSS-credit figure you may have seen for
it is moot.

**Others**, all fetched 2026-07-25: **Semaphore** macOS $0.09/min ($15 free
credits/mo, macOS eligibility unverified); **Buildkite** hosted Mac agents at
$0.02/vCPU-min (M4 Medium ≈ $0.12/min), with **zero** Mac minutes on the free
personal plan; **Travis CI** still operating but its billing docs list no macOS
credit multiplier at all; **Depot** and **Namespace** as in §2.3.

**Expo EAS Build** deserves a separate mention because this *is* an Expo app.
Free plan: **up to 15 iOS and 15 Android builds/month**, 1 concurrency,
low-priority queue, 45-minute timeout; then Starter $19/mo (+$45 credit) and
Production $199/mo (+$225 credit)
([expo.dev/pricing](https://expo.dev/pricing)). iOS workers are 5 or 10
performance cores on Mac mini hosts with a fresh VM per build, and the current
default image is **`macos-tahoe-26.5-xcode-26.6`**, tagged `sdk-57`
([EAS build infrastructure](https://docs.expo.dev/build-reference/infrastructure/),
updated 2026-07-08) — i.e. it already matches this repo's SDK and iOS-26 pin.
Its per-build overage rates are **not published** (the figures in Expo's
usage-based-pricing doc are explicitly labelled illustrative). EAS Build produces
a **binary**; it is not a test runner. It would pair with, not replace, a tier
that boots a simulator.

**Pros of managed CI generally:** somebody else owns the Mac fleet, the Xcode
images and the signing story; mobile-shaped primitives (code signing, artifact
distribution, device farms) are first-class.
**Cons:** another vendor, another config language, another place secrets live,
and — for this repo — a *worse* free tier than the GitHub macOS runners it
already has access to.

**Right choice when:** the pipeline is genuinely mobile-first, signing and store
distribution matter, or GitHub's macOS concurrency cap is the binding
constraint.

### 2.5 Device farms — real devices, rented by the minute

**What they are.** Racks of physical phones you drive remotely. They answer a
question no simulator can: *does it work on the actual hardware, at that OS
version, with that GPU, that font stack and that thermal envelope.* They are
also the most expensive tier and the flakiest, for exactly the same reason.

All figures fetched 2026-07-25.

| Service | Entry price | Free tier | Notes |
|---|---|---|---|
| [AWS Device Farm](https://aws.amazon.com/device-farm/pricing/) | **$0.17 / device-minute**, or **$250 / slot / month** unmetered (same for iOS and Android) | **1,000 device-minutes, one-time**, non-renewing | Most transparent pricing here. `us-west-2` only. Remote access needs a *separate* slot type. |
| [BrowserStack App Automate](https://www.browserstack.com/pricing?product=app-automate) | **$175/mo** annual, 1 parallel (Desktop & Mobile, real devices) | 100 trial minutes | Month-to-month price for App Automate not rendered on the page — UNVERIFIED. [OSS programme](https://www.browserstack.com/open-source) names Live, Automate and Percy — **App Automate is not named**, so free real-device *app* automation is unconfirmed. |
| [Sauce Labs](https://saucelabs.com/pricing) Real Device Cloud | **$199/mo** annual, **$249/mo** monthly, 1 parallel | 28-day trial, 60 minutes, no card | Scaling beyond 1 parallel is unpublished. The old Open Sauce OSS page 404s and no current terms exist anywhere primary. |
| [Firebase Test Lab](https://firebase.google.com/docs/test-lab/usage-quotas-pricing) | **$5 / hour** per physical device, **$1 / hour** virtual (Blaze) | Spark: **5 physical + 10 virtual runs/day** | The only no-application free real-device path. iOS accepts **XCTest/XCUITest, Robo and Game Loop** — not Maestro. |
| [TestMu AI](https://www.testmuai.com/pricing/) (formerly LambdaTest) | **$199/mo** per parallel for Real Device Plus; $139 for simulators only | Genuinely persistent monthly free tiers (100 automation min) | Rebranded 2026-01-12; `lambdatest.com/pricing` now 301-redirects. Has a real [OSS programme](https://www.testmuai.com/open-source/), though real-device inclusion is unstated. |

**On Firebase Test Lab and iOS specifically** — worth stating because the
opposite is widely assumed: **iOS is not deprecated and not being sunset.** The
[iOS get-started](https://firebase.google.com/docs/test-lab/ios/get-started) and
[available devices](https://firebase.google.com/docs/test-lab/ios/available-testing-devices)
docs both carry a 2026-07-20 last-updated stamp with no deprecation banner. What
is true is that the iOS catalogue is **thin and stale**: the last unambiguous
iOS device-catalogue change in the
[release notes](https://firebase.google.com/support/releases) was Oct/Nov 2025
(adding `iphonese3/18.4` and `iphone16pro/18.3`, removing five older entries),
no iPhone 17-family device appears in any 2026 note, and Google does **not
publish the iOS device list on any web page** — you must query it via `gcloud`
or the console. That opacity is itself the finding. Also note *"iOS 18+ devices
don't support videos in the results"*.

**Pros:** real hardware; broad OS/device matrices; parallel sharding; managed
device health.
**Cons:** the most expensive option per test; the flakiest (Slack's own account
in §4 singles out Firebase Test Lab runs as their higher-flakiness population);
device availability queues; and — decisive for *this* repo — a real-device
screenshot is **not comparable to a simulator golden**. Adopting one means a new
baseline, not a new runner for the existing one.

**Right choice when:** you ship to a wide install base and need pre-release
breadth, or you are chasing a bug that only reproduces on hardware. Not for
golden diffs.

### 2.6 Maestro's own hosted cloud

Worth its own entry because this repo already has a working Maestro tier
([`tests/visual/maestro/`](../packages/client-react-native/tests/visual/README.md)),
and because it is the one hosted service where the existing flows would run
**unchanged**.

**What it is.** The hosted counterpart to the open-source Maestro CLI, run by
Mobile Dev Inc. Naming has moved — the company and product are now both
"Maestro" (`app.maestro.dev`); the old `mobile.dev` branding is gone. This was a
**rebrand, not an acquisition** — the GitHub org is still `mobile-dev-inc` and
actively committing, and no acquisition announcement exists.

**Cost.** Local/OSS CLI: **free**. Cloud: **$250 per device per month**, where
"device" means a concurrent-execution slot — *"Price per month is based on max
concurrent executions"* ([maestro.dev/pricing](https://maestro.dev/pricing)).
7-day trial, no card. No persistent free cloud tier. Included minutes per slot
are not published — **UNVERIFIED**.

**Two facts that matter specifically here:**

1. **The OSS CLI is the cloud CLI.** Per
   [the docs](https://docs.maestro.dev/maestro-cloud/build-your-app-for-the-cloud.md):
   *"Maestro does not provide a separate 'Cloud CLI'. To take advantage of
   Maestro Cloud features, you use the `cloud` subcommand within the standard
   Maestro CLI."* The generated flows in `tests/visual/maestro/` would upload
   as-is.
2. **iOS on Maestro Cloud is simulators only** — the uploaded artifact *"Must
   be built for the iOS Simulator"* and *"Do not upload binaries built for
   physical iOS devices"*. Counter-intuitively this is a **fit**, not a
   limitation, for this repo: the committed goldens *are* simulator screenshots.
   (Android accepts APK only, not AAB.)

**Pros:** zero migration cost from the existing tier; screenshots and video per
run; parallel shards.
**Cons:** $250/mo/slot against a $0 GitHub macOS runner; a screenshot taken on
their simulator on their Xcode is a **third** golden bucket (§5); and it does
not solve anything GitHub-hosted runners do not, for this repo's scale.

**Right choice when:** you run a large Maestro suite, want managed sharding and
artifact retention, and the per-slot price is smaller than the engineering time
it replaces. Not the case here.

### 2.7 Device-free: render RN through react-native-web and snapshot on Linux

**What it is.** Skip the device entirely. `react-native-web` maps React Native
primitives (`View`, `Text`, `Image`, `StyleSheet`, `Pressable`) onto DOM
elements, so RN components can be mounted in a real browser on a free Linux
runner and screenshotted with the tooling this repo already runs at scale —
Playwright, against committed PNG goldens.

**Cost.** Zero marginal cost. The repo already has the entire pipeline: a
Playwright visual tier, a golden-management workflow
([`update-visual-goldens.yml`](../.github/workflows/update-visual-goldens.yml)),
a post-merge diff run ([`visual.yml`](../.github/workflows/visual.yml)) that
publishes failure reports, and a container-pinned environment. Adding an RN-web
scenario set is incremental work on an existing tier, not a new tier.

**Where it works on this stack.** Better than you would guess:

- **Reanimated 4 supports web** — the Worklets Babel plugin plus a
  `react-native` → `react-native-web` alias, per
  [the official web-support guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/web-support/).
  Animations run in JavaScript rather than on the UI thread, so they are slower,
  but they *run*.
- **`@shopify/react-native-skia` has a real web build.** Per
  [the Skia web docs](https://shopify.github.io/react-native-skia/docs/getting-started/web/),
  it "runs in the browser via CanvasKit, a WebAssembly build of Skia", loaded
  asynchronously (~2.9 MB gzipped WASM) via `LoadSkiaWeb()` or `<WithSkiaWeb />`,
  and it explicitly "can be used on projects without the need to install React
  Native Web". That is genuinely promising for the boot scenes, which are the
  most visually distinctive thing in the RN client.

**The honest caveats — and they are large.**

- **It tests the web rendering, not iOS.** A green RN-web golden proves your
  component tree and style objects produce the intended layout *in Chromium*.
  It says nothing about UIKit text metrics, iOS font rasterisation, safe-area
  insets, the status bar, or Core Animation. Every one of the RN-only wrinkles
  already logged in [rn-open-items.md](rn-open-items.md) §3 is invisible to it:
  **P1** (Skia draws zero glyphs on real iOS because `Skia.Font()` has no
  typeface) would very likely *pass* on CanvasKit, which resolves fonts through
  a different path. That is the failure mode to fear — a tier that is green
  precisely where the product is broken.
- **Not every dependency crosses.** This client depends on `expo-blur`,
  `expo-haptics`, `expo-sensors`, `@gorhom/bottom-sheet`,
  `react-native-gesture-handler`, `react-native-svg`, `expo-router`. Some have
  web support of varying completeness; some do not. Each is a mock or an
  exclusion, and every mock is a place the tier stops testing the real thing.
- **Skia CanvasKit is not pixel-identical to Skia-on-Metal.** Same library,
  different backend (WebGL vs Metal), different rasterisation. A CanvasKit
  golden cannot be compared against an iOS golden; it is its own baseline.
- **Setup is not free even if runtime is.** A separate Vite/webpack alias
  config, a WASM asset copy step, a font-loading strategy, and a scenario
  registry that can be mounted headlessly.

**Adjacent variants.** Chromatic and Percy are hosted versions of the same idea
(both have OSS programmes; **pricing UNVERIFIED here**) and would replace the
committed-goldens mechanism this repo deliberately built. There is little reason
to add a hosted diff service to a repo that already publishes its own diff
reports to gh-pages.

**Right choice when:** you want *some* automated paint coverage for RN UI logic
on every PR at zero cost and accept that it is a layout/structure net, not a
platform-fidelity net. It is a genuine complement to a real-device tier, and a
poor substitute for one.

---

## 3. Comparison table

Costs are as verified above (2026-07-25) and will drift. "Fidelity" is *how much
of the real product this actually exercises*. "Setup" is one-off engineering
effort, not runtime.

| Option | Cost | Setup | Fidelity | Speed | Device | Best for |
|---|---|---|---|---|---|---|
| **GitHub `macos-26`** | **$0** public repo · $0.062/min private | Low — a workflow file | High (real Xcode, real simulator) | Slow (3 cores, cold builds) | Simulator | **Public repos wanting iOS CI at zero cost.** This repo. |
| **Android emulator on `ubuntu-latest`** | **$0** | Low–medium (never built here) | High for Android, **zero for iOS** | Fast | Emulator | Making the cross-platform Maestro tier gate *something*, free |
| **Self-hosted Mac** | Hardware ($799+) + electricity | Medium, then **ongoing** | Highest — identical to golden capture | Fastest (warm sims) | Simulator (or attached device) | Eliminating cross-machine pixel drift |
| **AWS EC2 Mac** | **24 h floor**: $15.60 (M1) – $29.52 (M4) per isolated build | High (host mgmt, AMIs, agent) | High | Slow to launch (6–20 min) | Simulator | Busy pipelines that keep a host hot; never nightly jobs |
| **Scaleway Apple silicon** | €0.22/hr M4-S, 24 h floor ⇒ **≈€5.28/build** | High | High | Medium | Simulator | Cheapest hourly cloud Mac floor found |
| **MacStadium** | $149/mo (M4 16 GB) | High | High | Fast (dedicated) | Simulator | Always-on dedicated Mac without owning it |
| **Depot / WarpBuild / Blacksmith** | $0.08/min | Very low (`runs-on:` swap) | High | Fast (M4-class) | Simulator | Escaping GitHub's macOS queue/concurrency cap — costs money on public repos |
| **Codemagic** | **500 free min/mo (M2)**, then $0.095/min | Medium (new config) | High | Medium | Simulator | Best free macOS allowance outside GitHub |
| **Bitrise** | 300 free credits/mo (**conversion unpublished**) | Medium | High | Medium | Simulator | Mobile-first orgs; pricing opacity is a real cost |
| **Xcode Cloud** | 25 h/mo with $99/yr Dev Program; $49.99/mo per 100 h | Medium (no Node preinstalled) | High | Medium | Simulator | Teams already in Apple's tooling; **parallel tests bill cumulatively** |
| **CircleCI macOS** | ~150 free min/mo (derived); ≈$0.12/min | Medium | High | Fast (M4 Pro) | Simulator | Teams already on CircleCI. OSS credits are Linux-only |
| **Expo EAS Build** | 15 iOS builds/mo free; $19–$199/mo | Low (it's an Expo app) | High for *building* | Medium | n/a | Producing the binary — **not a test runner** |
| **Maestro Cloud** | $250/mo per concurrency slot | **Very low** — flows run unchanged | High | Fast | **Simulator only (iOS)** | Large managed Maestro suites |
| **AWS Device Farm** | $0.17/device-min · $250/slot/mo | Medium–high | **Highest** (real hardware) | Slow | **Real** | Low-volume real-device runs; transparent pricing |
| **BrowserStack / Sauce / TestMu** | $175–$249/mo per parallel | Medium | **Highest** | Slow | **Real** | Broad pre-release device matrices |
| **Firebase Test Lab** | $5/device-hr; **5 free physical runs/day** | Medium (XCTest only on iOS) | Highest | Slow | **Real** | Free real-device smoke — but **no Maestro on iOS** |
| **react-native-web + Playwright on Linux** | **$0** | Medium–high (aliasing, WASM, mocks) | **Low for iOS** — DOM/CanvasKit, not UIKit | **Fastest** | None | Per-PR layout/structure net; **not** platform fidelity |

---

## 4. What companies actually do

The short version: **almost nobody gates every pull request on real-device
tests, and most do not gate PRs on emulator/simulator UI tests either.** The
pattern that recurs across published engineering practice is a *tiered* one —
fast hermetic tests block merges; slow, environment-coupled tests run on a
schedule or in non-blocking mode.

Two things drive that, and both are documented rather than folklore:

**Flakiness makes device tests unfit as a gate.** Slack's mobile org — 120+
developers, 550+ PRs/week, 16,000+ Android and 11,000+ iOS automated tests —
reported that before automated flake handling, **57% of failing builds were test
job failures** and main-branch stability sat around **20%**; after building
automatic flaky-test detection and suppression, test job failures fell to
**3.85%** and main stability rose to **96%**, across **1,185 suppression PRs**
([Slack Engineering](https://slack.engineering/handling-flaky-tests-at-scale-auto-detection-suppression/)).
Notably, they call out that their E2E and instrumentation tests *running on
Firebase Test Lab* were the higher-flakiness population. Uber's approach is the
same shape stated as policy: tests marked **critical** run on CI regardless of
flakiness, while "other flaky tests, such as integration tests, are run in
**non-blocking mode as FYI only**" — against a backdrop of 2,500+ diffs/day and
10k+ tests per diff
([Uber Engineering](https://www.uber.com/en-GB/blog/flaky-tests-overhaul/)).

**Cost and wall-clock make them unfit as a gate.** A macOS runner minute is ~10×
a Linux one and macOS concurrency is capped at 5 concurrent jobs on most plans
(§2.1); device-farm minutes are billed per device. A 20-minute iOS job on every
push to every branch is both the slowest thing in the pipeline and, on a private
repo, usually the most expensive.

The resulting shape, near-universal in practice:

| Frequency | What runs | Why |
|---|---|---|
| **Every PR** | Unit + component tests, lint, typecheck, build. Often a single "does the app compile for iOS/Android" job. Sometimes a small emulator smoke on Linux (Android only). | Fast, hermetic, cheap, low flake. A gate must be trustworthy. |
| **Post-merge / on `main`** | Broader UI + visual suites. Red here means "investigate", not "your PR is blocked". | Catches regressions without holding up authors. **This repo already does exactly this for web** — [`visual.yml`](../.github/workflows/visual.yml) is post-merge-only and explicitly says so. |
| **Nightly** | Full device-farm or simulator matrices across OS versions and form factors; long e2e journeys. | Expensive and slow; a once-a-day signal is enough for a regression class that takes days to introduce. |
| **Pre-release** | The widest device matrix, real devices, upgrade/migration paths, manual exploratory. | The only point where breadth genuinely pays. |

Two corollaries worth stating plainly:

- **"Not gating" is not "not valuable".** A nightly iOS visual run that emails a
  diff is a real net. The repo's own web visual tier is non-gating and has
  caught real regressions.
- **Retry policy is part of the design, not a patch.** Every published account
  above pairs device/UI suites with auto-retry plus quarantine. If a tier is
  added without deciding what happens on a flake, the tier will be ignored
  within a month.

---

## 5. Golden/snapshot stability across machines

**Pixel output is a function of hardware, OS, Xcode, GPU and font
rasterisation.** Move any one of them and byte-comparison fails, even though the
UI is unchanged. This is not a hypothetical risk for an iOS CI set — it is the
default outcome.

The evidence is consistent across the iOS snapshot-testing ecosystem: reference
images must be generated with the same Xcode version *and* simulator runtime as
CI; Apple silicon machines produce snapshots that differ from x86 ones; devices
render differently at @2x vs @3x and between iOS versions; and teams report the
same simulator, OS and Xcode producing different snapshot *sizes* on two
developer machines of the same model but different years. See the long-running
threads on
[`pointfreeco/swift-snapshot-testing#382`](https://github.com/pointfreeco/swift-snapshot-testing/issues/382)
(differences between iOS versions),
[`#424`](https://github.com/pointfreeco/swift-snapshot-testing/issues/424)
(Apple silicon) and
[`#749`](https://github.com/pointfreeco/swift-snapshot-testing/issues/749)
(Xcode Cloud vs local), plus
[Apple's own developer forum thread](https://developer.apple.com/forums/thread/749824)
on local-vs-Xcode-Cloud mismatches.

**This repo has already fought and won this exact fight on the web side.** The
resolution was a **dual golden set**, and the reasoning transfers directly:

- Goldens live in `packages/ui-contract/goldens/playwright/__screenshots__/` in
  **three buckets** — `react/` (the CI x86 Linux set, generated inside the
  pinned Playwright container) and `react-local/{darwin,linux}-arm64` (native
  developer machines). See the "Single container-canonical golden set" entry in
  [STATUS.md](STATUS.md).
- Collapsing to a single container-canonical set **was implemented, merged, and
  then reverted** (#272–#275). It worked technically — container output is
  byte-identical to CI — but it destroyed the fast native inner loop: the only
  passing local check became a Docker run costing 1–2 minutes of container
  overhead per iteration. STATUS.md's verdict is explicit: *do not re-try as-is*
  unless a fast native quick-loop is preserved first.
- The web tier also has a live example of environment-sensitive rendering:
  classic-skin fonts resolve to OS-generic keywords (`system-ui`,
  `ui-monospace`) and **GitHub-hosted runners resolve them
  non-deterministically across runs** — the same scenario measured 1218 px in
  three runs and 1177 px in a fourth (STATUS.md, "Classic-skin fonts are
  host-environment-sensitive").

**What that implies for an iOS CI golden set.** Do not expect the committed
`ios-iphone17-26` goldens to pass on a GitHub runner. Plan for a **second
bucket** from the outset. The existing path helper already has the seam:

```ts
// packages/client-react-native/tests/visual/shared/goldens.ts
export const DEVICE_PIN = "ios-iphone17-26";
// → __screenshots__/<DEVICE_PIN>/<tier>/<scenario>.png
```

A CI set means making `DEVICE_PIN` (or a sibling segment) resolve per
environment — e.g. `ios-iphone17-26` for local capture and
`ios-iphone17-26-ci-xcode26.6` for the runner set — mirroring
`react/` vs `react-local/<arch>` on the web side. Pin the **Xcode version
explicitly** in the workflow (`DEVELOPER_DIR` / `xcode-select -s`) and put it in
the bucket name, because GitHub *will* change the image default.

Three further practical notes, from the harness's own documented experience:

- The tolerance is already 6% mismatched pixels
  ([`shared/diff.ts`](../packages/client-react-native/tests/visual/shared/diff.ts)),
  which absorbs the status-bar clock and the Expo dev-tools gear. Loosening it
  further to paper over cross-machine drift is a trap — BAKEOFF.md's injected-bug
  proof shows the real #147 shadow-clip regression only moved **0.04%** of
  pixels, comfortably under the existing tolerance. Widening the tolerance
  narrows what the tier can ever catch.
- The capture-failure-vs-regression distinction the harness now enforces (T2 in
  [rn-open-items.md](rn-open-items.md), fixed in #350/#353 — the driver throws
  rather than returning an unverified screenshot) is *more* important in CI, not
  less: nobody is watching the screen.
- Never run `:update` on CI output without eyeballing it. The harness README
  already warns that `:update` in a bad state pins a screenshot of the Expo
  launcher as the baseline.

---

## 6. Recommendation for this repo

Staged cheapest-and-most-reversible first. Each stage is independently useful;
stop whenever the value stops justifying the effort.

### Stage 0 — decide what you are actually buying (no code)

The RN client's *logic* is already covered: jest + RNTL component tests, plus
the shared `@rtc/client-core` presenters tested once for all three clients. The
gap T1 names is **paint** and **navigation** — pixels and flows. Before spending
anything, write down which of these you want a CI signal for:

- **(a) "The RN app still builds and bundles."** *Already covered* — the Expo
  export smoke runs in `ci.yml` on Linux today.
- **(b) "The RN UI still renders as intended."** Uncovered. This is the goldens.
- **(c) "A user can still complete a journey."** Uncovered. This is Maestro e2e.

(b) and (c) are different tiers with different costs. Do not buy both at once.

### Stage 1 — Android on free Linux runners (highest value per pound: £0)

**This is the recommendation the T1 note does not make, and it should probably
come first.** The Maestro tier is already the cross-platform one; the Android
emulator runs hardware-accelerated on free `ubuntu-latest` x86 runners; and
nothing about it needs a Mac, a queue, or a spending decision.

Concrete first step: add an Android job that boots an AVD via
`reactivecircus/android-emulator-runner` on `ubuntu-latest`, installs a debug
build, and runs the existing Maestro flows against a new `android-<device>-<api>`
golden bucket.

**What could go wrong.** The Expo Android build path has never been exercised in
this repo (`clean:deep` removes an `android/` directory, so prebuild works, but
no one has built it). Skia + Reanimated on the Android emulator's software GL
may render differently enough to need its own tolerance. And it proves nothing
about iOS — which is where the pinned goldens and the known P1/P4 wrinkles live.
Treat it as *additional* coverage, not as a substitute.

### Stage 2 — a nightly `macos-26` iOS job, non-gating (also £0)

Free on this public repo, no procurement, and the runner image genuinely has
iPhone 17 + iOS 26.x. Model it on `visual.yml`, which is already the repo's
"non-gating post-merge signal" pattern.

Concrete first step — **a spike, not a tier**: a `workflow_dispatch`-only
workflow on `macos-26` that does nothing but prove the environment. Pin Xcode
explicitly, install pnpm via Corepack, `expo prebuild` + build the app for the
simulator, boot an iPhone 17 / iOS 26.x sim, install Maestro + JDK 17, and run
**one** scenario in `--scratch` mode (which
[`simctl/run.ts`](../packages/client-react-native/tests/visual/simctl/run.ts)
already supports) — uploading the PNG as an artifact. Compare it by eye to the
committed golden. Total cost: one afternoon and zero pounds.

**What could go wrong, in descending order of likelihood:**

1. **Pixels differ from the local goldens.** Near-certain (§5). The answer is a
   second golden bucket, not a wider tolerance.
2. **`idb` does not install cleanly.** `fb-idb` needs Python ≤ 3.13 and
   `idb-companion` comes from a Homebrew tap; neither is on the image. **Prefer
   the Maestro tier for the CI spike** — BAKEOFF.md already rates it the more
   robust, pin-agnostic tier, and its only extra dependency (JDK 17) is a
   `brew install`. Leave simctl+idb as the Mac-local tier it was built to be.
3. **14 GB of disk.** Deleting unused Xcodes and simulator runtimes may need to
   be an explicit first step.
4. **Wall-clock.** A cold `expo prebuild` + native build on 3 cores could
   approach the interesting part of an hour. This is precisely why it is nightly
   and not per-PR.
5. **T4 bites.** `expo start` rewrites `tsconfig.json` and deletes
   `expo-env.d.ts`; on CI that is harmless (ephemeral checkout) but it means the
   workflow must not run `biome ci` after a Metro invocation.

Only after the spike is green: promote it to a `schedule:` nightly + a
`push: main` run with `paths-ignore` for markdown, exactly as `visual.yml` does.
**Do not make it a PR gate.** §4 is unanimous on that, and the repo's own web
visual tier already made this call for the same reasons.

### Stage 3 — react-native-web pixel tests on Linux, if Stage 2 proves too slow

Only if the nightly Mac job turns out to be too slow or too flaky to keep. It
is cheap, it reuses the entire existing Playwright + goldens + gh-pages
apparatus, and Reanimated 4 and Skia/CanvasKit both have real web builds. But
read §2.7's caveat first: it would likely have rendered P1 (Skia drawing zero
glyphs on iOS) green. A tier that is confidently wrong is worse than no tier.

**What could go wrong.** Every non-crossing dependency becomes a mock; the
mocked surface silently becomes untested surface; and there is a standing
temptation to treat a green RN-web run as iOS assurance. If this stage is taken,
name the tier something that cannot be misread — `rn-web-layout`, not
`rn-visual`.

### Stage 4 — a self-hosted Mac runner, only if Stage 2's pixel drift is intractable

The one option that eliminates cross-machine drift by construction, because it
*is* the machine the goldens came from. Only worth it if the CI bucket in Stage
2 proves unmaintainable.

**What could go wrong.** Self-hosted runners on a **public** repo let fork PRs
run arbitrary code on a personal machine — this must be restricted to `push`
and `workflow_dispatch` before the runner is ever registered. Beyond that, state
drift (§2.2) is the recurring cost, and this repo has already been burned twice
by exactly that class of thing (corrupt `node_modules`, T4's `tsconfig`
rewrite).

### Not recommended for this repo, and why

- **Paid cloud Mac / managed CI / device farms.** They solve procurement, queue
  depth, device *breadth* and org-scale concurrency. This repo has one
  contributor, one pinned device, and free macOS runners. None of those problems
  exist here yet.
- **Real-device farms specifically.** The pinned golden is a *simulator*
  screenshot. Real devices would need a whole new baseline and would introduce
  battery, thermal and OTA-update variance into a pixel-comparison tier. Real
  devices earn their keep for pre-release breadth, not for golden diffs.
- **Making any of this a PR gate.** See §4.

---

## 7. Figures that could NOT be verified from a primary source

Listed so nobody mistakes an estimate for a quote.

**Estimates of ours, not vendor claims**

- **"10–25 minutes per iOS run on a `macos-26` standard runner."** An estimate
  from the shape of the work (prebuild + native build + sim boot + Metro on 3
  cores / 7 GB), not a measurement. Stage 2's spike exists partly to replace it
  with a real number.
- **Whether `fb-idb` / `idb-companion` install cleanly on the `macos-26` arm64
  image.** Not tested. The Python ≤ 3.13 constraint is from this repo's own
  harness README; the runner image's default Python is unknown to us. This is
  why §6 routes the spike through Maestro instead.
- **Whether the committed `ios-iphone17-26` goldens would pass on a GitHub
  runner.** Untested. §5 argues they almost certainly will not, but that is
  inference from the wider ecosystem, not a measurement of this suite.
- **Whether Skia/CanvasKit, Reanimated-on-web and the Expo module set render
  this app's screens faithfully enough for a useful RN-web tier.** Not
  prototyped. Both libraries document web support; nothing was built.
- **How the Android emulator renders this app's Skia/Reanimated scenes.** Never
  run — the repo has no `android/` build history at all.

**Vendor figures we could not confirm from a primary source**

- **Bitrise `$/minute`.** The pricing page shows macOS Medium at $0.0072 under a
  "Cost per minute" header — implausible, and read identically on two fetches.
  Almost certainly a mislabelled *credits* column. Do not budget against it.
- **Bitrise credit → macOS-minute conversion.** Not published on the pricing
  page, the machine-types doc, or the credit-usage doc, so the 300 free
  credits/month cannot be converted into minutes.
- **Bitrise open-source programme.** Only primary source is a 2018 blog post for
  a tier that no longer exists. Treat as defunct until shown otherwise.
- **Expo EAS Build per-build overage rates.** The figures in Expo's
  usage-based-pricing doc are explicitly labelled illustrative examples and the
  pricing page does not list them.
- **Mac mini RAM/storage upgrade deltas.** Apple's configurator loads option
  pricing via JavaScript; only the three "From" prices ($799 / $1,599 / $1,799)
  are readable from the static page.
- **MacStadium Orka pricing.** No public tier pricing exists — contact-sales /
  AWS Marketplace only. Third-party aggregators quote figures that disagree with
  MacStadium's own page even for the plain hosting SKUs.
- **Sauce Labs open-source programme.** `saucelabs.com/platform/open-source`
  **404s**; the widely-quoted terms (unlimited minutes, 3 parallel VMs) have no
  current primary source.
- **BrowserStack App Automate month-to-month pricing**, and **whether App
  Automate / App Live are included in their OSS programme** — the OSS page names
  only Live, Automate and Percy.
- **Per-parallel scaling beyond 1 parallel** — unpublished by BrowserStack,
  Sauce Labs and TestMu AI alike.
- **TestMu AI month-to-month (non-annual) prices**, and whether real devices are
  included in their OSS programme.
- **Maestro Cloud included minutes per concurrency slot.** Billing is per slot;
  no minute quota is published. Also unverified: whether Android cloud runs use
  emulators or real devices.
- **CircleCI's "$0.12/min" and "~150 free macOS minutes/month".** Both *derived*
  from published credit rates (200 credits/min; 25,000 credits for $15), not
  quoted by CircleCI.
- **Xcode Cloud's cumulative billing of parallel test destinations.** Sourced
  from WWDC22 session 110374 via search extraction rather than a directly read
  Apple page — treat as partially verified.
- **Travis CI macOS credit multiplier.** Their billing docs list Linux, Windows
  and FreeBSD rows only — no macOS row at all.
- **Semaphore free-credit eligibility for macOS**, **Depot's macOS treatment
  inside plan minute buckets**, and **Buildkite/Namespace OSS terms.**
- **Chromatic and Percy pricing** (§2.7) — not researched; both have OSS
  programmes whose current terms were not checked.
- **Namespace "$150/mo per concurrent runner, unlimited minutes."** Circulating
  in comparison blogs and contradicted by Namespace's own per-minute pricing
  page.

**Things that were true and are no longer** — a reminder that this whole page
decays:

- **Cirrus CI shut down on 1 June 2026.** Cirrus Runners is closed to new
  customers.
- **Hetzner no longer offers Mac hosting.**
- **LambdaTest became TestMu AI** on 2026-01-12; the old pricing URL redirects.
- **mobile.dev became Maestro** — a rebrand, not an acquisition.
- **CircleCI's M1/M2 macOS classes reached end-of-life on 2026-02-16.**
- **`macos-latest` is mid-migration from macOS 15 to macOS 26** (15 June – 15
  July 2026), and GitHub is switching to Xcode-major-versioned images. Pin
  explicitly.
