# Word Battleships: production handoff

A two-team Battleships game for adult English learners. Each shot needs an English sentence, every ship is a hidden word, and the board is drawn in 3D. One web codebase is shipped three ways:

| Target | What it is | Built with | Where it lives |
|---|---|---|---|
| **HTML** | One self-contained `index.html` that works offline | Vite (single-file build) | GitHub Pages, plus the file itself for Google Sites embeds |
| **APK** | Android app for tablets and phones | Capacitor (current major version) wrapping the web build | GitHub Actions artifact and Release asset |
| **EXE** | Windows 10/11 portable app | Electron + electron-builder (`portable` target) | GitHub Actions artifact and Release asset |

Suggested repo: `github.com/Nonnorounet/Word-Battleships`

Design canvas (source of truth for every screen): https://claude.ai/artifact/RqwSbKNchkiagJmfHKWAW3. Build the **Hybrid** row (dark), the **Light** row and the **Before the game** row. Rows A–C are rejected explorations, kept only for comparison.

Word lists: [Word Battleships – word lists](https://docs.google.com/spreadsheets/d/1FTocqbtlV8p9xo8FZwJY4snjVw-LptKboBonSOdGrwQ/edit), ID `1FTocqbtlV8p9xo8FZwJY4snjVw-LptKboBonSOdGrwQ`.

Files that come with this handoff:
- `HANDOFF.md`: this document.
- `scene-reference.html`: the three.js scene used for the canvas renders. Copy its geometry, colours and camera values; don't ship it as it is.

---

## 1. Game rules (what to implement)

### Setup
- **Teams:** two teams, one device each, paired by a game code (e.g. `ORBIT-42`). The host device creates the game; the other device joins.
- **Board:** 10×10. **Rows** are labelled 1–10 *and* carry a row word (usually a subject: "The client"). **Columns** are labelled A–J *and* carry a column word (usually a verb: "approve").
- **Fleet:** 5 ships whose words are 6, 5, 4, 3 and 3 letters long (21 cells). A ship is as long as its word, one letter per cell, horizontal or vertical.
- **Options screen** (host only, before fleet setup):
  - Word pack: one of the packs in the Sheet.
  - Grammar focus: free text or a list, e.g. "Past simple". It is shown on every card.
  - Time to judge a sentence: 30 s – 3 min, default 1 min 30.
  - When the judging time runs out: **Accept automatically** (default) | **Trainer decides**.
  - Hint unlocks after: 1 | 2 | 3 hits on the same ship (default 2).
  - **Ship words:** Random from the pack | Each team chooses.
  - **Ship placement:** Random | Each team places.
  - Checkboxes:
    - Allow words that are not in the pack (default on).
    - Each team writes an English hint for its own words (default on).
    - Trainer approves own words before the game (default off).
    - Ships may touch (default on).
  - If both Fleet options are Random, skip fleet setup and start the game.
- **Fleet setup** (when either option is "Each team…"):
  - Each team fills its 5 slots by typing a word of the right length or picking one from the pack.
  - Each team writes a hint for every word it typed itself. Words from the pack use the pack's hint.
  - Each team places its ships. Desktop: drag, and R to rotate. Touch: tap a ship, then tap its first cell, with a Rotate button. There are also Random placement and Clear board buttons.
  - Validation:
    - The word length matches its slot. Letters only, A–Z, stored in upper case.
    - Ships stay inside the board and don't overlap.
    - If "ships may touch" is off, no two ships share an edge.
  - Ready stays disabled until all 5 ships are valid. The game starts when both teams are Ready (and the trainer has approved, if that option is on).

### A turn
1. **Pick a cell.** The active team selects a cell on the opponent's board that hasn't been shot yet. Its row word and column word light up (see §5.4).
2. **Draw the challenge card.** The card shows:
   - The cell, e.g. `E4`.
   - The row word × the column word.
   - The grammar focus.
   - A sentence box.
   - One **bonus** question drawn at random, without repeats, from the pack's Challenges.
3. **Send.** The sentence and the bonus answer go to the other device.
4. **Judge.** The other team sees the sentence and taps **Accept** or **Reject** before the timer ends. When the timer runs out, what happens depends on the Options setting:
   - **Accept automatically** (default): the sentence is accepted.
   - **Trainer decides:** the card stays open on both devices with "Waiting for the trainer". The host device shows **Trainer: Accept** and **Trainer: Reject** buttons; the trainer taps one.
   - **Rejected:** the shot is lost and the turn passes to the other team.
   - **Accepted:** the shot is fired.
5. **Resolve the shot.**
   - **Miss:** a miss marker on that cell.
   - **Hit:** reveals that letter of the ship's word to the attacker.
   - **Sunk:** all of a ship's cells are hit. The word shows in full and the ship sinks in 3D.
6. **Bonus.** The bonus answer is checked automatically against Answer plus Also accept:
   - The check ignores case, spaces at either end, a leading "a/an/the" and a final full stop.
   - A correct answer scores +1, whether or not the shot hit.
7. **Guess a ship (optional).** After a hit, the attacker may guess the whole word of any ship that has at least one letter revealed.
   - Right: the ship sinks and scores +3.
   - Wrong: no penalty, and the turn ends.
8. **Hint unlock.** After the number of hits set in Options (default 2) on the same ship, the attacker sees that ship's hint.
9. **Next turn.** The turn always passes to the other team (keeps both teams busy).

### Scoring (confirmed by the trainer)
| Event | Points |
|---|---|
| Hit | +1 |
| Bonus answer correct | +1 |
| Ship sunk by guessing its word | +3 |
| Ship sunk by hitting all its cells | +2 |

**End of the game:** a team sinks the whole enemy fleet, or the host taps End game. The team with the most points wins. The end screen shows both fleets in full and the shot log, so the class can review the sentences.

### Shot log
Every shot is listed with:
- The cell.
- The sentence.
- Accepted, rejected or waiting.
- The result (miss, or hit plus the letter).

Rejected sentences stay in the log. They're useful for correction at the end.

---

## 2. Word lists (Google Sheet)

Tabs and columns. The header row is required, and the code reads columns by header name, not position.

| Tab | Columns | Notes |
|---|---|---|
| `Grid words` | Pack, Axis (`Row`/`Column`), Position (`1`–`10` or `A`–`J`), Word, French | Exactly 10 rows + 10 columns per pack. |
| `Ship words` | Pack, Word, Letters (formula), Hint (EN), Hint (FR) | Words of 3–6 letters, at least 3 per length so a random fleet can always be drawn. |
| `Challenges` | Pack, Type (`Definition`/`Translation`/`Gap fill`), Prompt, Answer, Also accept (`;`-separated), Hint (FR) | At least 10 per pack is recommended. |
| `How to use` | EN/FR instructions | Not read by the game. |

### Loading
- Only the **host** loads the Sheet. The words are then sent to the other device with the game state, so learners never need access to the Sheet.
- Standalone builds (HTML/APK/EXE) read each tab as CSV through the Sheet's public CSV export:
  `https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv&sheet=<Tab%20name>`
- This needs the Sheet shared as **Anyone with the link can view**. Show a clear error that says so when the request fails.
- CORS:
  - **HTML:** if the browser blocks the request, fall back to "paste the CSV" in the import dialog.
  - **APK:** use `@capacitor/core` `CapacitorHttp` (native, no CORS).
  - **EXE:** fetch from the Electron main process through IPC.
- Packs:
  - Keep the last loaded pack in `localStorage`.
  - Ship the sample **Aerospace** pack inside the bundle (`src/data/aerospace.json`) so the game works offline on first launch.
- The host can also paste a different Sheet link in Options ("Reload words from Sheet").

---

## 3. Two-device sync

The canvas assumes two devices on any network. Use a small transport interface so the rest of the game doesn't care how messages travel:

```ts
interface Transport {
  host(code: string): Promise<void>;        // create the game
  join(code: string): Promise<void>;        // join with a code
  send(msg: Msg): void;
  onMessage(cb: (msg: Msg) => void): void;
  onStatus(cb: (s: 'connecting'|'connected'|'lost') => void): void;
}
```

Adapters:
1. **`peer` (HTML/APK/EXE):** WebRTC through PeerJS.
   - The host registers the peer id `wordbattleships-<CODE>` on the free public PeerJS broker. The guest connects to that id. No server to run.
   - **Risk:** some company networks block WebRTC (possibly at CNES or Thales sites). If the connection doesn't open within 10 s, show "Can't connect on this network" and offer **Practice mode** (one device, two windows) instead.
   - No Firebase fallback (trainer's decision, §10). Keep the `Transport` interface so another adapter can be added later if needed.
2. **`room` (claude.ai artifact only):** the artifact's `room` capability, if the game is also published as an artifact.

### Rules for the shared state
- The **host is the source of truth**.
  - The guest sends *intents*: `pickCell`, `submitCard`, `judge`, `guessWord`, `placeFleet`, `ready`.
  - The host validates each intent, applies it and broadcasts the new **public state**.
- Never send a team its opponent's unrevealed letters or ship positions:
  - The host keeps both fleets privately.
  - Each device gets only its own fleet in full, plus the opponent's revealed cells.
  - The host device itself plays one team, so keep the other team's secrets in a separate module that the UI never reads. This is classroom-level security, not a perfect barrier.
- On reconnect, the guest asks for a full state snapshot. Game state survives a page reload: the host persists it in `localStorage` keyed by game code.

---

## 4. Tech stack and repo layout

- **TypeScript + Vite.** No UI framework is needed (plain DOM modules). Preact is fine if preferred.
- **three.js r159** from npm, not a CDN, so the APK and EXE work offline.
- Fonts bundled with `@fontsource/*` (no Google Fonts requests offline): Space Grotesk 500/600/700, JetBrains Mono 400/500/700, Inter 400–700, Bricolage Grotesque 500/700/800 (card title only).
- `vite-plugin-singlefile` for the HTML target, so the output is one `index.html` that can be embedded in Google Sites.

```
/
├─ src/
│  ├─ main.ts            app bootstrap, routing between screens
│  ├─ state/             game rules, reducer, validation (pure, unit-tested)
│  ├─ net/               Transport + peer/room adapters
│  ├─ sheet/             CSV fetch + parse + pack validation
│  ├─ scene/             three.js board (see §6)
│  ├─ ui/                screens: options, fleet-setup, play, card, judge, end
│  ├─ i18n/              en.json, fr.json
│  ├─ data/aerospace.json
│  └─ styles/            tokens.css (dark + light), components.css
├─ electron/main.ts      window, IPC fetch for the Sheet
├─ android/              generated by Capacitor (committed)
├─ capacitor.config.ts   appId: com.nonnorounet.wordbattleships
├─ design/scene-reference.html
├─ .github/workflows/    web.yml, android.yml, windows.yml
└─ HANDOFF.md
```

---

## 5. Visual spec

### 5.1 Layout (desktop ≥ 1100 px, from "Hybrid · pick a cell")
- **Topbar:**
  - Target icon and "Word Battleships".
  - Game code chip.
  - Falcon score | "Your turn" pill | Kestrel score.
  - EN/FR toggle and the theme button.
- **Body:** three columns, `340px | 1fr | 320px`.
  - **Shot log (left):** see §1.
  - **3D board (centre):** the enemy waters. On its top-right edge sit Zoom in, Zoom out and the **Show your own fleet** button. That button flips to your own waters, shown with the same scene, your full words and the enemy's hits in red.
  - **Enemy fleet (right):** one row per ship, with letter tiles (revealed letters filled, the rest empty), "n letters", the hint or "Hint unlocks after n hits" (n from Options), and Sunk ships in red. Below it, the guess box.
- **Bottom bar:** the selected cell and its words, a helper line and **Draw challenge card**. While a card is open, it shows "Challenge open" and the countdown instead.
- **Challenge card:**
  - Centred over the board, rotated about −1.5°, max width 420 px.
  - The board behind it dims (dark: `rgba(2,8,6,.55)`; light: `rgba(24,40,34,.32)`).
  - A small stack of cards sits in the bottom-right corner of the board.
- **Tablet (700–1099 px):**
  - The shot log becomes a drawer, opened from a topbar button.
  - The enemy fleet panel moves under the board.
- **Phone (< 700 px), from "Hybrid · phone":**
  - Topbar, score line, the board at ~350 px tall, and a row of chips for the enemy words.
  - The card is a bottom sheet.
  - The shot log is a full-screen sheet.

### 5.2 Colour tokens
| Token | Dark | Light |
|---|---|---|
| `--bg` | `#04100C` | `#F3EFE2` |
| `--surface` | `#08201A` | `#FBF8EE` |
| `--ink` | `#C9F7E2` | `#183F33` |
| `--muted` | `#78C2A2` | `#4C6659` |
| `--line` | `#164A39` | `#D9D1B8` |
| `--primary` (buttons, ok) | `#2FE39A` (text on it `#04100C`) | `#1D5C4A` (text on it `#FBF8EE`) |
| `--hit` (revealed letters) | `#FFB020` | `#9A2A1D` |
| `--target` (selected cell) | `#FFD27A` | `#9A2A1D` |
| `--sunk` | `#FF6B5A` | `#5C1A12` |
| `--soft` (empty tiles) | `#0B2B22` | `#ECE5CF` |
| Card background / border | `#0F2D24` / `#2FE39A55` | `#FFFDF6` / `#D9D1B8` |
| Card title "CHALLENGE" | `#FFB020` | `#9A2A1D` |

The theme follows the system setting (`prefers-color-scheme`). The moon button overrides it and the choice is saved. Also honour `:root[data-theme]`.

### 5.3 Type
- **UI and body:** JetBrains Mono.
- **Headings, team names, row × column words:** Space Grotesk.
- **Card title and card words:** Bricolage Grotesque.
- **Card body text:** Inter.
- Scores use tabular numerals.

### 5.4 Grid word labels (readability)
Grid words are drawn in 3D and can be hard to read. Highlight state for a label:
- Background: dark `rgba(4,16,12,.9)` / light `rgba(255,253,246,.95)`.
- Outline: `--target`, 2 px.
- Text: bold, white in dark mode, `#0B2A21` in light mode.
- The coordinate letter or number turns `--target`.

| Device | Trigger |
|---|---|
| Computer (`hover: hover`) | Pointing at a word, a row or a column lights that word. Pointing at a cell lights both its words. |
| Tablet / phone (`hover: none`) | Tapping a cell selects it and lights both its words. Tapping a word lights it until the next tap. |
| All | The selected cell keeps both words lit until the turn ends. |

The words are also listed as hidden-but-readable text in the DOM (an `aria-live` region announces "E4: The client + approve"), and the grid can be used from the keyboard:
- Arrow keys move the selection.
- Enter draws the card.
- Esc closes the card.

### 5.5 Craft
- Touch targets ≥ 44 px, with visible focus rings.
- Text contrast ≥ 4.5:1 (the tokens above pass).
- `prefers-reduced-motion`: no sweep rotation, no card tilt animation, instant camera moves.
- Icons are inline stroke SVGs (Lucide-style). No emoji.

---

## 6. 3D scene (three.js r159)

Copy the values from `design/scene-reference.html` (`dir=D` for play, `dir=E` for fleet setup).

### Board
- Cells are 1 unit, and the board spans x and z from −5 to 5. Cell centre = `(col − 4.5, 0, row − 4.5)`.
- **Water:**
  - `PlaneGeometry(70, 70, 260, 260)`, with gentle displacement: `0.05·sin(1.7x + 0.6y) + 0.035·cos(2.3y − 0.8x)`. In the game, animate it slowly in the vertex shader or every few frames.
  - Colour: dark `#0B2E26`. Light `#F8F2E4` with emissive `#6E6A5E`, so that it renders as the page cream.
- **Radar decal** under the grid (y = 0.09, `depthWrite: false`, `renderOrder: −1`):
  - A disc, radius 7.4 (dark `#04140F` at 55 %, light `#FBF8EE` at 45 %).
  - Rings at 1.8, 3.6, 5.4 and 7.2 (`--primary` at 32 %), and an outer ring at 7.32–7.42 (60 %).
  - 72 ticks (a long one every 6th).
  - A conic-gradient sweep, 14 % arc, with a leading line. It rotates once every 6 s in play and stops under `prefers-reduced-motion`.
- **Grid lines:** `LineSegments` at y = 0.1, `--primary` at 50 %.
- **Labels:** canvas textures on planes lying flat.
  - Row words are right-aligned, centred at x = −6.85. Column words are rotated 90°, starting at z = −6.85. Coordinates sit at −5.25.
  - Highlighted labels per §5.4.
  - Redraw a label texture only when its state changes.

### Pieces
- **Enemy hit:** a buoy (cylinder r 0.4–0.44, h 0.22) with a letter tile on top (rounded square, `--hit` background, letter in JetBrains Mono 800) and a glow ring.
- **Miss:** a small peg plus a ring.
- **Ship** (your own fleet, sunk enemy ships, fleet setup):
  - An extruded hull shape (rounded stern, pointed bow), bevelled, 0.32 deep.
  - One letter tile per cell.
  - A sunk ship drops 0.06 lower and its tiles turn `--sunk`.
- **Ghost ship** (fleet setup drag): lifted 0.75 above the board, hull `--primary` at 55 % opacity, and the landing cells lit `--primary` at 28 %. Lit red instead if the placement isn't valid.
- **Selected cell:** a square outline ring in `--target`.

### Camera and controls
- FOV 30. Desktop position `(−0.6, 18.5, 16)` looking at `(−1.7, 0, −0.5)`. On tall screens, move back ×1.55.
- Orbit within limits:
  - Drag to rotate (azimuth ±35°, polar 25°–60°).
  - Pinch, ctrl+wheel or the +/− buttons to zoom. A plain wheel scrolls the page.
  - Ease the camera towards its target.
- **Picking:**
  - Raycast against the board plane at y = 0, then floor to a cell.
  - A tap is a pointer that moved ≤ 4 px. Anything more is a drag.
  - Labels are picked the same way, using their plane bounds.
- **Lights:** hemisphere 1.4×k and directional 1.6×k with soft shadows. k = 0.75 dark, 1.05 light.
- **Renderer:** `antialias`, `outputColorSpace = SRGB`, `PCFSoftShadowMap`, pixel ratio capped at 2 (1.5 on Android).

---

## 7. Languages (FR/EN)

- The game opens in **English** by default, whatever the browser or system language.
- The EN/FR toggle switches **everything**: interface, rules, card instructions, feedback, the how-to and the end screen. The choice is saved, and `<html lang>` is updated.
- **Content from the Sheet:**
  - Grid words and ship words stay in English. That's what is being practised.
  - French mode adds a French gloss:
    - Grid words: under each word, in the hover/tap label and on the card, from the `French` column.
    - Hints: shown in French, from `Hint (FR)`.
    - Challenges: the `Hint (FR)` line is shown under the prompt.
- Strings live in `i18n/en.json` and `i18n/fr.json`, keyed by id. No text in the code.
- French typography: a non-breaking space before `: ; ! ?` and inside « ».

---

## 8. Builds (GitHub Actions)

All three workflows run on every tag `v*` and attach their output to the GitHub Release. `web.yml` also runs on every push to `main`.

### 8.1 HTML: `.github/workflows/web.yml`
- `npm ci` → `npm run build:web` (Vite with `vite-plugin-singlefile`, `base: './'`) → `dist/index.html`.
- Deploy `dist/` to **GitHub Pages** (`actions/upload-pages-artifact` + `actions/deploy-pages`).
- Upload `dist/index.html` as an artifact, for embedding in Google Sites ("Embed → Embed code").

### 8.2 APK: `.github/workflows/android.yml`
- `ubuntu-latest`, with `actions/setup-node@v4` (Node 20) and `actions/setup-java@v4` (Temurin 21, which Capacitor 7 and later need).
- `npm ci && npm run build:web && npx cap sync android`.
- `cd android && ./gradlew assembleRelease`.
- **Signing:** store the keystore as the base64 secret `ANDROID_KEYSTORE_B64`, plus `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. Decode it in the job and pass the values to Gradle through `signingConfigs`. Without these secrets, build `assembleDebug` instead.
- Output `app-release.apk`, renamed to `WordBattleships-<version>.apk`.
- **Settings:**
  - `minSdk 24`, `targetSdk 35`.
  - Orientation unlocked (landscape preferred on tablets).
  - `android:usesCleartextTraffic="false"`.
  - Permission: `INTERNET` only.

### 8.3 EXE: `.github/workflows/windows.yml`
- `windows-latest`, Node 20.
- `npm ci && npm run build:web && npx electron-builder --win portable`.
- **Electron:**
  - `contextIsolation: true`, `nodeIntegration: false`.
  - One preload script that exposes `fetchSheetCsv(url)` through IPC.
  - Window 1440×900, minimum 1024×700.
  - Menu bar hidden.
- Output `WordBattleships-<version>-portable.exe`.
- **Note:** the exe isn't code-signed, so Windows SmartScreen will show "Windows protected your PC" on first launch (More info → Run anyway). Say so in the README. Signing needs a paid certificate.

### Versioning
- Semantic versions taken from `package.json`, which also feeds the Android `versionName` and `versionCode`.
- Tag `v1.0.0` to release.

---

## 9. Acceptance checklist

- [ ] Two devices on different networks pair with a code and play a full game. A refresh on either device resumes the game.
- [ ] The guest's device never contains the host's unrevealed words (check the network messages).
- [ ] Each combination of Options works:
  - [ ] Random words + random placement skips fleet setup.
  - [ ] Teams choose their words and place their ships.
  - [ ] Teams' own words get validated and hinted.
- [ ] Turn flow:
  - [ ] The card appears.
  - [ ] The other team can accept or reject.
  - [ ] The timer runs out correctly, in both modes (accept automatically, trainer decides).
  - [ ] A rejected sentence loses the shot.
  - [ ] Hits and misses resolve correctly, and sinks are detected both by hits and by a guess.
  - [ ] The hint unlocks after the number of hits set in Options (1, 2 or 3).
- [ ] When pairing fails within 10 s, the message offers Practice mode.
  - [ ] The score matches the table in §1.
- [ ] Bonus answers are checked with the rules in §1 (case, articles, "Also accept").
- [ ] The Sheet loads from its link. It fails clearly when the Sheet isn't public. The built-in Aerospace pack works offline.
- [ ] EN/FR switches every string, and the French glosses appear.
- [ ] Dark and light themes match the canvas, following the system setting with a manual override.
- [ ] Label highlight by hover (mouse) and tap (touch), as in §5.4. The keyboard alone can play a turn.
- [ ] 60 fps on a mid-range tablet (Xiaomi Pad 8 class). No layout breaks at 390 px wide.
- [ ] The HTML build is one file that works when embedded in Google Sites. The APK installs on Android 7+. The portable EXE runs on Windows 10/11 without installing.

---

## 10. Trainer decisions (2026-11-23)

1. **Scoring:** keep the values in §1.
2. **Timer running out:** a host option, "Accept automatically" (default) or "Trainer decides" (§1).
3. **Trainer view:** yes, but in **v1.1**, not v1. A third device joins the game as the trainer, sees both fleets in full and can override any Accept/Reject. Not part of the v1 acceptance checklist.
4. **Hint unlock:** a host option, 1, 2 or 3 hits, default 2 (§1).
5. **Firebase fallback:** no. When PeerJS is blocked, use Practice mode (§3).
