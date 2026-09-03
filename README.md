# Sway

Panic attack first aid for Android. Open the app and it is already pulsing a slow breathing rhythm you can
follow with the phone in your pocket and your eyes shut. When the wave passes there are grounding tools, a
two tap storm log, an Almanac that shows patterns over months, and a night shelf with your person, a crisis
line and a card you can hand to a stranger.

Free and complete. No account, no subscription, no ads, and no internet permission.

- **Play listing:** https://play.google.com/store/apps/details?id=com.mohdshayan.sway
- **Site:** https://shayanmohd.github.io/sway/
- **Try it in a browser:** https://shayanmohd.github.io/sway/play/
- **Privacy policy:** https://shayanmohd.github.io/sway/privacy-policy.html

Sway is a self help wellness tool. It is not a medical device, it does not diagnose anything, and it is not
a treatment for panic disorder or any other condition.

## How it is built

`web/` is the whole app: plain HTML, CSS and JavaScript, no build step and no dependencies.

- `js/store.js` holds every piece of state in one `localStorage` record under `sway.v1`.
- `js/engine.js` is the breath clock, the haptic wave vocabulary, the synthesised tide underlay and the
  horizon renderer. The inhale is a rising amplitude swell, the hold is silence, the exhale is a pulse
  train that fades and spreads apart.
- `js/content.js` is the bundled content: the grounding scripts, the crisis line list and the Learn cards.
- `js/app.js` is the two layer navigation. Layer one is the session screen with no navigation at all;
  layer two is Shelter, Almanac and Learn, reachable only through a deliberate "not in a storm" door.

`android/` is a thin Kotlin WebView shell that serves `web/` from an app private https origin through
`WebViewAssetLoader`, adds amplitude controlled haptics, keep awake and file export, and declares
`VIBRATE` as its only permission. The web core is copied into the app's assets by the `syncWebAssets`
Gradle task on every build.

`docs/` is the GitHub Pages site: landing page, privacy policy, and a playable copy of the app.

`store/` holds the brand spec, the screenshot spec, the generated Play assets and the listing copy. The
icon and feature graphic are drawn procedurally from `store/brand.json`; nothing is model generated.

## Build

```sh
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew bundleRelease assembleRelease
```

Signing reads `android/keystore.properties`, which is not in this repository.

## Regenerate the assets

```sh
python _shiptools/brand.py store/brand.json --out store --res android/app/src/main/res
python _shiptools/privacy.py store/policy.json --out docs/privacy-policy.html
python3 -m http.server 8731 --directory web
node _shiptools/shots.js store/shots.json
rsync -a --delete web/ docs/play/
```

`docs/privacy-policy.html` is generated, so edit `store/policy.json` rather than the HTML.

## What is deliberately not here

No Quick Settings tile, home screen widget or launcher shortcut: those need native Android components
this shell does not provide. No Wear OS companion. No spoken grounding audio. English only. The app is
dark themed only, because the hours it is built for are dark ones.
