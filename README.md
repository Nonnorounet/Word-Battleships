# Word Battleships

A two-team Battleships game for adult English learners. To fire at a cell, a team writes a sentence using that cell's row word and column word; the other team accepts or rejects it on its own device. Every ship is a hidden English word, and hits reveal its letters. The board is in 3D, in dark and light themes, with the whole interface in English or French.

## Play

1. One device presses **New game** and gets a code (for example `ORBIT-42A`).
2. The other device opens the same page or app, presses **Join a game** and types the code.
3. The first device chooses the options (word pack, grammar focus, timer, who picks the ship words and where the ships go) and starts.

**Practice on this device** opens a second window on the same computer, which is handy for trying the game alone.

The two devices connect directly to each other (WebRTC through the free PeerJS service). Some company networks block this; if the devices can't connect, try another network (for example a phone hotspot).

## Word lists

The game ships with an **Aerospace** pack. To use your own lists, copy the layout of the [Word Battleships – word lists](https://docs.google.com/spreadsheets/d/1FTocqbtlV8p9xo8FZwJY4snjVw-LptKboBonSOdGrwQ/edit) Sheet (tabs `Grid words`, `Ship words`, `Challenges`), share it as **Anyone with the link can view**, and paste its link under **Load words from a Google Sheet** in the game options. Only the device that starts the game reads the Sheet.

## Downloads

Each release (tag `v*`) attaches:

| File | For |
|---|---|
| `WordBattleships-x.y.z.html` | Any browser. One file that works offline; it can also be embedded in Google Sites. |
| `WordBattleships-x.y.z.apk` | Android 7 and later. |
| `WordBattleships-x.y.z-portable.exe` | Windows 10 and 11, no installation. Windows SmartScreen will warn on first launch because the exe is not code-signed: click **More info → Run anyway**. |

The web version is also published on GitHub Pages.

## Develop

```bash
npm ci
npm run dev          # local server with hot reload
npm test             # game rules and Sheet parsing
npm run build:web    # dist/index.html (single file)
npm run electron     # run the Windows app shell on your machine (after build:web)
npx cap sync android # copy the web build into the Android project
```

Code map:

- `src/state/` game rules, pure and unit-tested (`rules.ts`)
- `src/net/` the host keeps the full game; the other device only receives what it may see
- `src/sheet/` Google Sheet CSV loading
- `src/scene/` three.js board
- `src/ui/` screens, `src/i18n/` English and French text
- `electron/` Windows shell, `android/` Capacitor project

## Release

1. Set the version in `package.json`.
2. Tag and push: `git tag v0.1.0 && git push origin v0.1.0`.
3. The three workflows build and attach the HTML, APK and EXE to the release.

One-time setup:

- **GitHub Pages:** Settings → Pages → Source: **GitHub Actions**.
- **Signed APK (optional):** add the repository secrets `ANDROID_KEYSTORE_B64` (the keystore file in base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. Without them the workflow builds a debug APK, which installs fine for classroom use.

The full specification is in [HANDOFF.md](HANDOFF.md).
