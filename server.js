import express from "express";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const PORT = process.env.PORT || 3000;
const SAVE_FILE = "dev-saves.json";
const SAVE_KEY_VERSION = 1;

const DATA = {
  ranks: [
    ["Rookie", 0],
    ["Local Icon", 60],
    ["Velvet Muse", 160],
    ["District Queen", 340],
    ["Runway Myth", 700]
  ],
  districts: [
    { id: "boutique", name: "Boutique Shift", cost: 0, power: 0, coins: 38, influence: 6, text: "Style clients and stack coins." },
    { id: "afterparty", name: "Afterparty Host", cost: 90, power: 18, coins: 76, influence: 14, text: "Turn charm into buzz." },
    { id: "runway", name: "Pop-Up Runway", cost: 220, power: 45, coins: 138, influence: 31, text: "Serve a look the whole block remembers." },
    { id: "penthouse", name: "Penthouse Collab", cost: 520, power: 95, coins: 260, influence: 70, text: "Close a luxe brand moment." }
  ],
  relics: [
    { id: "lip", name: "Crimson Gloss", rarity: "Common", power: 4, color: "#ff6d67" },
    { id: "shades", name: "Mirror Shades", rarity: "Common", power: 5, color: "#41d7c7" },
    { id: "heels", name: "Lacquer Heels", rarity: "Rare", power: 12, color: "#f3bd54" },
    { id: "chain", name: "Gold Chain Choker", rarity: "Rare", power: 14, color: "#f3bd54" },
    { id: "bag", name: "Chrome Heart Bag", rarity: "Epic", power: 28, color: "#8b6cff" },
    { id: "jacket", name: "Star Bomber", rarity: "Legendary", power: 52, color: "#ff93d5" }
  ],
  crew: [
    { name: "Mika", role: "Closer", bonus: "+10% district coins" },
    { name: "Vee", role: "Muse", bonus: "+1 pity after every job" },
    { name: "Sable", role: "Scout", bonus: "Unlock checks use total power" }
  ]
};

const baseState = {
  coins: 180,
  gems: 12,
  influence: 0,
  pity: 0,
  pulls: {},
  history: ["Welcome to Velvet District."]
};

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
    })
  : null;

const app = express();
app.use(express.json({ limit: "16kb" }));
app.use(express.static(".", { extensions: ["html"] }));

await initStore();

app.get("/api/config", (_req, res) => {
  res.json({ data: DATA, version: SAVE_KEY_VERSION });
});

app.post("/api/player", async (_req, res) => {
  const playerId = randomUUID();
  const state = { ...baseState };
  await savePlayer(playerId, state);
  res.json(viewModel(playerId, state, "New crew started."));
});

app.get("/api/player/:playerId", async (req, res) => {
  const state = await getPlayer(req.params.playerId);
  if (!state) {
    res.status(404).json({ error: "Player not found." });
    return;
  }
  res.json(viewModel(req.params.playerId, state));
});

app.post("/api/player/:playerId/work", async (req, res) => {
  const state = await getPlayer(req.params.playerId);
  if (!state) {
    res.status(404).json({ error: "Player not found." });
    return;
  }

  const district = DATA.districts.find((item) => item.id === req.body?.districtId);
  if (!district) {
    res.status(400).json({ error: "Unknown district." });
    return;
  }

  const power = totalPower(state);
  if (state.coins < district.cost || power < district.power) {
    res.status(400).json({ error: "That district is still locked." });
    return;
  }

  state.coins = state.coins - district.cost + Math.round(district.coins * 1.1);
  state.influence += district.influence;
  state.pity += 1;
  pushHistory(state, `${district.name} cleared. Coins and influence are up.`);
  await savePlayer(req.params.playerId, state);
  res.json(viewModel(req.params.playerId, state));
});

app.post("/api/player/:playerId/pull", async (req, res) => {
  const state = await getPlayer(req.params.playerId);
  if (!state) {
    res.status(404).json({ error: "Player not found." });
    return;
  }
  if (state.coins < 100) {
    res.status(400).json({ error: "Not enough coins." });
    return;
  }

  state.coins -= 100;
  const relic = weightedRelic(state);
  state.pulls[relic.id] = (state.pulls[relic.id] || 0) + 1;
  state.pity = relic.rarity === "Legendary" ? 0 : state.pity + 1;

  if (state.pity >= 10 && relic.rarity !== "Legendary") {
    const legendary = DATA.relics.find((item) => item.rarity === "Legendary");
    state.pulls[legendary.id] = (state.pulls[legendary.id] || 0) + 1;
    state.pity = 0;
    pushHistory(state, `Pity sparkled into ${legendary.name}.`);
  } else {
    pushHistory(state, `Pulled ${relic.name} (${relic.rarity}).`);
  }

  await savePlayer(req.params.playerId, state);
  res.json(viewModel(req.params.playerId, state));
});

app.post("/api/player/:playerId/reset", async (req, res) => {
  const state = { ...baseState, history: ["Fresh run started."] };
  await savePlayer(req.params.playerId, state);
  res.json(viewModel(req.params.playerId, state));
});

app.listen(PORT, () => {
  console.log(`Velvet District is running on port ${PORT}`);
});

async function initStore() {
  if (!pool) return;
  await pool.query(`
    create table if not exists players (
      id uuid primary key,
      state jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

async function getPlayer(playerId) {
  if (pool) {
    const result = await pool.query("select state from players where id = $1", [playerId]);
    return result.rows[0]?.state || null;
  }

  const saves = readSaves();
  return saves[playerId] || null;
}

async function savePlayer(playerId, state) {
  if (pool) {
    await pool.query(
      `insert into players (id, state, updated_at)
       values ($1, $2, now())
       on conflict (id) do update set state = excluded.state, updated_at = now()`,
      [playerId, state]
    );
    return;
  }

  const saves = readSaves();
  saves[playerId] = state;
  writeFileSync(SAVE_FILE, JSON.stringify(saves, null, 2));
}

function readSaves() {
  if (!existsSync(SAVE_FILE)) return {};
  return JSON.parse(readFileSync(SAVE_FILE, "utf8"));
}

function totalPower(state) {
  return DATA.relics.reduce((sum, relic) => sum + (state.pulls[relic.id] || 0) * relic.power, 0);
}

function currentRank(state) {
  return DATA.ranks.reduce((best, rank) => state.influence >= rank[1] ? rank[0] : best, DATA.ranks[0][0]);
}

function weightedRelic(state) {
  const legendaryBoost = state.pity >= 9;
  const table = DATA.relics.flatMap((relic) => {
    const weight = legendaryBoost && relic.rarity === "Legendary" ? 80 :
      relic.rarity === "Common" ? 45 :
      relic.rarity === "Rare" ? 24 :
      relic.rarity === "Epic" ? 9 : 2;
    return Array(weight).fill(relic);
  });
  return table[Math.floor(Math.random() * table.length)];
}

function pushHistory(state, message) {
  state.history = [message, ...(state.history || [])].slice(0, 6);
}

function viewModel(playerId, state, message) {
  return {
    playerId,
    state,
    data: DATA,
    derived: {
      power: totalPower(state),
      rank: currentRank(state),
      collectionCount: Object.keys(state.pulls).length,
      relicCount: DATA.relics.length
    },
    message: message || state.history?.[0] || ""
  };
}
