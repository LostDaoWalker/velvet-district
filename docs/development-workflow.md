# Velvet District Development Workflow

## Content Loop

Make gameplay changes in `data/game-data.js`.

1. Add relics first.
2. Group relics into sets.
3. Add districts that require the new power range.
4. Add errands that reward players for touching the new loop.
5. Run `npm run check`.
6. Start the server and test `/api/player`, `/pull`, `/work`, and `/daily`.

Keep ids short, lowercase, and stable. Existing player saves refer to ids.

## Asset Loop

Game art lives in `assets/`. Asset metadata lives in `data/assets.js`.

For repeatable image generation, keep every prompt in the manifest:

- Use painterly fashion RPG art.
- Use coral, teal, gold, violet, and warm black.
- Avoid text, logos, UI labels, and sexualized posing.
- Make the asset useful in-game, not just decorative.

When replacing an asset, save the new file with a versioned name first, update `data/assets.js`, test, then remove old references later.

## Deploy Loop

1. Commit changes.
2. Push to `origin/master`.
3. Render auto-deploys after the Blueprint is connected.
4. Watch Render logs for startup or database errors.

The app works locally without Postgres by writing `dev-saves.json`. Render uses `DATABASE_URL` from the managed database.
