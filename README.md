# Velvet District

A painterly baddie gacha PBBG for the browser.

## Play Loop

- Work districts to earn coins and influence.
- Spend coins on relic pulls.
- Collect relics to raise power.
- Use power to unlock richer districts.
- Progress is saved in the browser.

## Repeatable Content

Game balance lives in `app.js` inside the `DATA` object:

- `districts` controls jobs, requirements, and rewards.
- `relics` controls gacha items, rarity, color, and power.
- `crew` controls the visible crew roster.
- `ranks` controls influence titles.

Painterly assets live in `assets/` and are referenced directly from `index.html`.
