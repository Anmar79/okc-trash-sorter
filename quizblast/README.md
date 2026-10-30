# QuizBlast — live quiz games you host yourself

Build quizzes in a slide editor, show the game on a projector, and let players
join from their phones by scanning a QR code or typing a 6-digit PIN. Everything
runs on your own server: no accounts for players, no subscriptions, no premium
features locked away.

| Screen | Address | Who uses it |
| --- | --- | --- |
| **Admin** | `https://<server>/quizblast/admin` | You: create/edit quizzes, host games, see reports |
| **Host / projector** | opens when you click **▶ Host live** | The big screen: PIN, QR code, questions, timer, charts, scoreboard, podium |
| **Player** | `https://<server>/quizblast/` (or scan the QR code) | Everyone's phone: enter a nickname and tap answers |

## Features

- **Slide editor**: add, duplicate, delete and drag to reorder slides; autosaves as you type.
  Each slide can have an image (upload, drag and drop, paste, or a link).
- **7 slide types**, all free:
  - **Quiz**: 2–6 answers, single or multi-select
  - **True or false**
  - **Type answer**: several accepted spellings; capital letters, accents and punctuation are ignored
  - **Slider**: pick a number, with an optional ± margin
  - **Puzzle**: put items in the right order
  - **Poll**: opinions, no points
  - **Content slide**: title, text and image between questions
- **Per-slide settings**: time limit (5s–4 min, with "apply to all"), standard/double/no points.
- **Quiz settings**: title, description, cover image, 5 color themes, shuffle answers.
- **Live game**: lobby with PIN and QR code, lock the lobby, remove a player
  (click their name), 4-second "get ready" before each question, countdown, live
  answer count. The question ends early once everyone has answered. Then the
  results chart, a top-5 scoreboard, and a final podium with confetti.
- **Scoring**: up to 1,000 points for a correct answer; faster answers score
  more, and answer streaks add a bonus of up to +500.
- **Phones**: big tap targets, instant correct/incorrect feedback, points, and
  "you're 120 points behind Sam". A player who refreshes or loses Wi-Fi
  rejoins the game automatically.
- **Reports**: saved after every game, with each player's answers, % correct per question,
  and a **CSV download** that opens in Excel.
- **Import/export**: back up or share a quiz as a `.json` file, or import questions from a
  spreadsheet saved as **CSV**, with columns:
  `Question, Answer 1, Answer 2, Answer 3, Answer 4, Time limit, Correct answer(s)`
  (for example `2`, or `1,3` for multi-select).
- Keyboard on the host screen: **Space / Enter / →** = next, **F** = full screen.

## Run it on your computer (to try it out)

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
cd quizblast
npm install
npm start
```

Open <http://localhost:3000/admin> (password `admin` until you set one). Phones
on the same Wi-Fi can join at `http://<your-computer's-IP>:3000/`.

## Settings

Copy `.env.example` to `.env` and edit it:

| Setting | What it does |
| --- | --- |
| `ADMIN_PASSWORD` | Password for the admin pages. **Set this.** |
| `PORT` | Port the app listens on (default 3000). |
| `BASE_PATH` | Serve under a sub-path, e.g. `/quizblast`. |
| `PUBLIC_URL` | Address shown on the projector and in the QR code, e.g. `https://svpueshostv01.ci.okc/quizblast`. |
| `DATA_DIR` | Folder for quizzes, images and reports (default `./data`). Back this folder up. |

## Put it on your server (e.g. `https://svpueshostv01.ci.okc/quizblast/`)

A live game needs an always-on connection between the server and every phone.
A PHP page can't keep that connection open, so QuizBlast runs as a small Node.js
program, and your existing web server (IIS or Apache) forwards `/quizblast/` to
it. Your `tools_hub` site is not affected.

### 1. Install the app

1. Install Node.js 18+ (LTS) on the server.
2. Copy this `quizblast` folder to the server, e.g. `C:\apps\quizblast` or `/opt/quizblast`.
3. In that folder run `npm install --omit=dev`.
4. Copy `.env.example` to `.env`, then set `ADMIN_PASSWORD`, keep
   `BASE_PATH=/quizblast`, and set `PUBLIC_URL` to the address players will use.
5. Test it: `npm start`, then open `http://localhost:3000/quizblast/admin` on the server.

### 2. Keep it running

- **Windows:** run it as a service so it starts with the server, for example with
  [NSSM](https://nssm.cc): `nssm install QuizBlast "C:\Program Files\nodejs\node.exe" server.js`,
  set the startup directory to the app folder, then `nssm start QuizBlast`.
- **Linux:** use `deploy/quizblast.service` (instructions are inside the file).

### 3. Forward `/quizblast/` from your web server

- **IIS:** follow the steps at the top of `deploy/iis-web.config`. In short:
  install *URL Rewrite* + *ARR*, enable the ARR proxy, then put the file in a
  `quizblast` folder in the site root as `web.config`. Also turn on the IIS
  *WebSocket Protocol* feature for the fastest updates; without it the game
  still works, with slightly slower polling.
- **Apache:** add the lines from `deploy/apache.conf` to your HTTPS virtual host.

Then open `https://svpueshostv01.ci.okc/quizblast/admin`. You can add it as a
tile in your tools hub.

### Important: players' phones must be able to reach the server

`svpueshostv01.ci.okc` looks like an internal (intranet) address. Phones only
reach it on the organization's Wi-Fi or VPN, not on mobile data. Before a live
event, scan the QR code with a phone on the same network your players will use.
If guests are on a separate guest Wi-Fi or on mobile data, the server needs a
public address.

## How it works

- `server.js`: web server, admin login (signed cookie), quiz/report/upload API, QR codes, Socket.IO.
- `lib/game.js`: the live game (PINs, timers, scoring, streaks, rankings, reconnects, reports).
- `lib/store.js`: saves quizzes, reports and uploaded images as files in `DATA_DIR`.
- `public/shared.js`: the quiz format and validation, used by both server and browser.
- `public/admin.js`, `public/host.js`, `public/player.js`: the three screens.

Games in progress live in memory, so restarting the app ends any running game.
Quizzes and reports are saved to disk. Up to 500 players per game.
