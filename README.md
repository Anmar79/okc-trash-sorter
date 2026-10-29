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

## "Play & Learn" game

The app has two tabs: **📷 Sort a Photo** (the AI classifier) and
**🎮 Play & Learn**, a game that teaches the same OKC rules. Players drag an
item (or tap a bin, or press keys 1–5) into one of the five categories and
get an explanation of the rule after every answer.

- **Learn & Play** — 12 items (always at least one per bin), with a tip after each.
- **Beat the Clock** — sort as many as you can in 60 seconds; streaks earn bonus points.
- **Bin Guide** — browse every item in the game, grouped by bin, with the rule behind it.

The game runs entirely in the browser (no API key or network needed) and
works offline once the app is installed. Link straight to it with `/#game`.
The game code is `public/game.js` and its item list is `public/game-data.js`
— if you update `rules.js`, update that list too.

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
