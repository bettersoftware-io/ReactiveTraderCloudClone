# Running the app on a real iPhone (free, no paid Apple account)

Installing `@rtc/client-react-native` on your own iPhone with a **free personal
Apple ID** — no $99/year Developer Program, no EAS, no distribution to anyone.

**Do this whenever you touch motion, Skia, or worklets.** The simulator draws
Skia on your Mac's GPU and has no gyroscope, so it cannot show you a whole class
of behaviour. Two examples from this repo: `Skia.Font()` drew **zero glyphs** on
real iOS while looking perfect in the simulator (#362), and the boot scenes'
gyro-tilt camera reads a flat `0.0°` on a simulator forever because there is no
sensor to read. See [rn-motion-architecture.md](rn-motion-architecture.md).

**Last updated: 2026-08-02** — walked end-to-end on an iPhone 16 Pro Max
(iOS 26.6) from a Mac running Xcode 26.

---

## What this is not

**Not EAS.** `eas.json` in the RN package has `internal`-distribution profiles,
but EAS iOS builds need ad-hoc provisioning, which needs a **distribution
certificate with registered UDIDs**, which needs the **paid** Developer Program.
You do not need `eas-cli`, `eas login`, or an EAS account for anything here.

**Not TestFlight, and not shareable.** The build runs on devices you sign for,
off your own machine. That is the whole point of the free tier.

## What the free tier costs you

| | |
|---|---|
| **Signature expires after ~7 days** | The app stops launching. Re-run the build command to reinstall. This is the only limitation that will actually annoy you. |
| ~3 sideloaded apps per device | Not a constraint for one app. |
| ~10 app IDs per week | Only matters if you keep changing the bundle id. |
| No push, App Groups, associated domains | This app uses none of them — its entitlements are just `application-identifier`, `team-identifier` and `get-task-allow`. |

Apple adjusts these periodically; treat the numbers as approximate. The 7-day
expiry is long-standing.

---

## One-time setup

### 1. Add your Apple ID to Xcode

**Xcode → Settings (⌘,) → Accounts → `+` → Apple ID → sign in.**

Any Apple ID. No payment, no enrolment. You now have a team called
**"Your Name (Personal Team)"**, and Xcode creates a development certificate in
your login keychain.

Verify from a shell — this should report one identity, not zero:

```bash
security find-identity -v -p codesigning
```

### 2. Select the team on the target

**Open `packages/client-react-native/ios/RTCMobile.xcworkspace` → select the
`RTCMobile` target → Signing & Capabilities → tick *Automatically manage
signing* → Team → "(Personal Team)".**

That writes `DEVELOPMENT_TEAM` into the project. Confirm:

```bash
grep DEVELOPMENT_TEAM packages/client-react-native/ios/RTCMobile.xcodeproj/project.pbxproj
```

Without it the build fails with *"Signing for RTCMobile requires a development
team."*

**If Xcode rejects the bundle id** (`io.bettersoftware.rtcmobile`) — ids are
globally unique and this one is registered to the project's EAS account — change
it in the same pane to something personal. Nothing depends on the value; the
deep-link scheme is separate (`rtcmobile://`).

**`ios/` is gitignored**, so none of this touches the repo. The flip side: if
that folder is ever regenerated, redo step 2.

### 3. Enable Developer Mode on the phone

**Settings → Privacy & Security → Developer Mode → on.** The phone restarts and
asks you to confirm after unlocking.

The entry only appears **after** a device has had a development build attempted,
so if you can't find it, run the build once first and look again.

What it does: lets the phone run code signed with a *development* certificate
instead of only App Store / notarised builds. It does not touch sandboxing,
encryption, Face ID or your data protections, and it is not a jailbreak. The
attack surface it reopens needs physical possession of your unlocked phone plus
your passcode. Turn it off when you're done, out of hygiene.

---

## Building and installing

Find the device UDID. **Use `xctrace`, not `devicectl`** — `devicectl` prints a
CoreDevice identifier that Expo will reject with *"No device UDID or name
matching…"*:

```bash
xcrun xctrace list devices     # look under "== Devices ==", NOT the simulators
```

Then, with the phone **plugged in, unlocked and trusted**:

```bash
cd packages/client-react-native
npx expo run:ios --device <UDID> --configuration Release
```

**`--configuration Release` is the point of the exercise.** The default Debug
build still loads JS from Metro on your Mac — same bundle the simulator runs.
Release gives you real Hermes bytecode with the worklet Babel plugin fully
applied, running standalone on the phone's own GPU. That is the configuration
that would have caught the zero-glyph Skia bug.

With no `EXPO_PUBLIC_SERVER_URL` set, the app defaults to the deployed server, so
it streams live with no laptop involved.

### First launch is refused — this is expected

```
Unable to launch io.bettersoftware.rtcmobile because it has an invalid code
signature, inadequate entitlements or its profile has not been explicitly
trusted by the user.
```

**Settings → General → VPN & Device Management → Developer App → your Apple ID →
Trust.** Then tap the app icon. No rebuild needed — the binary is already correct.

---

## Troubleshooting, in the order these actually happened

### "Signing for RTCMobile requires a development team"

One-time setup step 2 wasn't done. `security find-identity -v -p codesigning`
reporting **0 valid identities** means step 1 wasn't either.

### "No device UDID or name matching …"

You used the identifier from `xcrun devicectl list devices`. That is a
CoreDevice id, not the UDID. Use `xcrun xctrace list devices`.

### "Developer Mode disabled"

`xcodebuild` reports this inside its *available destinations* list rather than as
the headline error, so it is easy to miss:

```
{ platform:iOS, id:…, name:csx, error:Developer Mode disabled To use csx for
  development, enable Developer Mode in Settings → Privacy & Security. }
```

Setup step 3.

### `ApplicationVerificationFailed` at ~40%

The build succeeded and the install was rejected. Check, in this order:

1. **Keychain prompts.** `codesign` needs your private signing key, and macOS
   asks per-key. If a dialog was denied or left unanswered while the build ran,
   nested frameworks get signed badly and the device rejects the whole bundle.
   Click **"Always Allow"**, not "Allow". *"Deny" is not sticky* — only "Always
   Allow" records a decision, so a mistaken Deny just means you're asked again.
   To stop the prompts permanently: Keychain Access → **login** → *Keys* → the
   key under your *Apple Development* certificate → Get Info → Access Control.
2. **An older copy of the app on the phone**, signed with a different identity.
   iOS will not overwrite across signatures — delete it and reinstall.
3. **The provisioning profile**, which is worth ruling out before assuming
   either of the above:

```bash
APP=~/Library/Developer/Xcode/DerivedData/RTCMobile-*/Build/Products/Release-iphoneos/RTCMobile.app
security cms -D -i "$APP/embedded.mobileprovision" | plutil -p - | grep -A3 ProvisionedDevices
codesign -d --entitlements :- "$APP" | plutil -p -
```

`ProvisionedDevices` must contain your phone's UDID, and the entitlements should
be only the three listed above. If both are right, it is not a provisioning
problem — go back to (1).

### "The request was denied … profile has not been explicitly trusted"

Not a failure. The app installed; you just haven't tapped Trust yet. See above.

---

## What to actually check once it's running

The reason for doing this at all — none of these can be verified in a simulator:

- **Boot scenes animate.** Force-quit and relaunch to cycle variants; each cold
  start advances to the next.
- **Text inside the boot scenes is present.** The specific thing that once
  silently vanished on real hardware while looking fine in the simulator.
- **Tilt the phone** — the 3D scenes' camera should follow. `useGyroDrift` is a
  real sensor read, so a simulator pins it at `0.0°` and this path is otherwise
  never exercised at all.
- **Live data** — Rates and Credit streaming off the deployed server with the
  laptop out of the picture.
