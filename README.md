# Velvet District

A painterly baddie gacha PBBG for the browser, ready for Render hosting.

## Play Loop

- Work districts to earn coins and influence.
- Spend coins on relic pulls.
- Collect relics to raise power.
- Use power to unlock richer districts.
- Progress is saved on the server.

## Repeatable Content

Game balance lives in `server.js` inside the `DATA` object:

- `districts` controls jobs, requirements, and rewards.
- `relics` controls gacha items, rarity, color, and power.
- `crew` controls the visible crew roster.
- `ranks` controls influence titles.

Painterly assets live in `assets/` and are referenced directly from `index.html`.

## Local Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Without `DATABASE_URL`, the server writes local dev saves to `dev-saves.json`.

## Render Deploy

This repo includes `render.yaml`:

- One Node web service.
- One managed Postgres database.
- `DATABASE_URL` wired from the database into the app.

On Render, create a new Blueprint from the Git repo. Render will install dependencies, start the server, and provision Postgres.

The included Blueprint uses Render's free web and Postgres plans so it can be created without paid resources. For a durable production game, upgrade the database to a paid current plan such as `basic-256mb` because free Render Postgres databases expire.
