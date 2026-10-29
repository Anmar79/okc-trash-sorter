# OKC Trash Sorter

Take a photo of an item and the app tells you which bin it goes in, based on
the City of Oklahoma City's ["What Goes Where"](https://www.okc.gov/Services/Water-Trash-Recycling/Trash-Services/What-Goes-Where)
rules:

- **Big Blue Cart** — regular trash
- **Big Green Cart** — recycling
- **Bulky Waste Pickup** — needs a scheduled pickup (large furniture, appliances, etc.)
- **Household Hazardous Waste** — drop-off only at 1621 S. Portland
- **Not accepted** — needs alternative disposal (tires, e-waste, medications, etc.)

It's built as an installable web app (PWA) so users can "Add to Home Screen"
on iPhone or Android and it behaves like a native app — no app store needed.

## How it works

1. The browser takes/selects a photo and shrinks it to a reasonable size.
2. The photo is sent to a Netlify serverless function (`netlify/functions/classify.js`).
3. The function sends the photo to Claude (Anthropic's AI model) along with the
   OKC sorting rules (see `rules.js`) and asks it to identify the item and
   pick the right category.
4. The app shows the result as a color-coded card with instructions.

## OKC Sort Games (`/games.html`)

A standalone games page that teaches the City of OKC's sorting rules. It
doesn't change the photo sorter, so link to it from any app (add `?embed=1` to
hide its header when it's shown inside another app):

- **🏭 Conveyor Rush** — items ride a conveyor belt; drag each into the right
  bin before it falls off. 3 lives, faster every level, combo multipliers.
- **📅 Daily Challenge** — the same 10 items for everyone each day, with a day streak.
- **👆 Swipe It** — "Recycle or not?" Swipe cards right or left in 45 seconds.
- **🧺 Bin Catcher** — items fall from the sky; drag, use arrow keys, or tilt
  the phone to catch only the ones for the current bin.
- **📸 Photo Hunt** — an AI scavenger hunt: find a real item for the mission's
  bin, snap it, and the AI (`/api/classify`, needs `ANTHROPIC_API_KEY`) checks it.
- **🎓 Learn Mode** — 12 items, no timer, with a spoken explanation after each answer.
- **📖 Trash-o-pedia** and **🏅 14 badges** to unlock.

Scores, badges and discovered items are saved in the browser. Code:
`public/games.html`, `public/game.js`, `public/minigames.js`,
`public/game.css`; the item list is `public/game-data.js` — if you update
`rules.js`, update that list too.

## Setup

1. Install [Node.js](https://nodejs.org) 18 or newer.
2. Install the [Netlify CLI](https://docs.netlify.com/cli/get-started/) globally:

   ```bash
   npm install -g netlify-cli
   ```

3. In this folder, install dependencies:

   ```bash
   npm install
   ```

4. Get an API key from [console.anthropic.com](https://console.anthropic.com/settings/keys).
5. Copy `.env.example` to `.env` and paste your key in:

   ```bash
   cp .env.example .env
   # then edit .env and set ANTHROPIC_API_KEY=sk-ant-...
   ```

6. Start the local dev server (this runs the site *and* the function together,
   the same way Netlify runs them in production):

   ```bash
   netlify dev
   ```

7. Open the URL it prints (usually `http://localhost:8888`) on your computer,
   or `http://<your-computer's-LAN-IP>:8888` on your phone (same Wi-Fi
   network) to test the camera flow on a real device.

## Installing it like an app on a phone

Once it's deployed (see below):

- **iPhone (Safari):** open the site → Share icon → "Add to Home Screen."
- **Android (Chrome):** open the site → menu (⋮) → "Add to Home Screen" / "Install app."

It will then open full-screen with its own icon, no browser chrome.

## Deploying to Netlify

1. Log in once: `netlify login`
2. From this folder, link or create a site and deploy it:

   ```bash
   netlify init
   netlify deploy --prod
   ```

   `netlify init` will ask whether to connect to an existing site or create a
   new one — either works. `netlify deploy --prod` uploads `public/` and
   `netlify/functions/` and gives you a live `https://<something>.netlify.app`
   URL immediately, no GitHub repo required.

3. Set your API key on Netlify itself (it only needs to be entered once):

   ```bash
   netlify env:set ANTHROPIC_API_KEY sk-ant-...
   ```

   or via the Netlify dashboard: Site settings → Environment variables.

4. Re-run `netlify deploy --prod` any time you change the code. Send friends
   the `https://<something>.netlify.app` link — that's what they open (and
   can "Add to Home Screen") on their phones.

The API key stays server-side the whole time — the phone app never sees it,
it only talks to your `/api/classify` endpoint, which Netlify routes to the
function.

## Updating the rules

All the sorting logic lives in plain English in `rules.js`. If the city
updates its guidance, edit that file — no code changes needed elsewhere.

## Notes on accuracy

This uses a general-purpose AI vision model grounded with OKC's rules text —
it's very good at identifying common household items, but it can be wrong
about ambiguous or unusual items (the app shows a "confidence" level and
sometimes a caveat note). For genuinely uncertain cases, users should
double check with the city's page or call (405) 297-2833.
