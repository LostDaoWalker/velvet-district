import express from "express";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { GAME_DATA } from "./data/game-data.js";
import { ASSET_MANIFEST } from "./data/assets.js";

const { Pool } = pg;
const PORT = process.env.PORT || 3000;
const SAVE_FILE = "dev-saves.json";
const SAVE_KEY_VERSION = 2;

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
  res.json({ data: GAME_DATA, assets: ASSET_MANIFEST, version: SAVE_KEY_VERSION });
});

app.post("/api/player", async (_req, res) => {
  const playerId = randomUUID();
  const state = newState();
  await savePlayer(playerId, state);
  res.json(viewModel(playerId, state, "New crew started."));
});

app.get("/api/player/:playerId", async (req, res) => {
  const state = await getPlayer(req.params.playerId);
  if (!state) return notFound(res);
  res.json(viewModel(req.params.playerId, migrateState(state)));
});

app.post("/api/player/:playerId/daily", async (req, res) => {
  await mutate(req, res, (state) => {
    const today = dayKey();
    if (state.lastDaily === today) throw playerError("Daily reward already claimed.");
    state.lastDaily = today;
    state.energy = GAME_DATA.economy.maxEnergy;
    state.coins += GAME_DATA.economy.dailyCoins;
    state.gems += GAME_DATA.economy.dailyGems;
    pushHistory(state, `Daily glam claimed: +${GAME_DATA.economy.dailyCoins} coins, +${GAME_DATA.economy.dailyGems} gems, energy refilled.`);
  });
});

app.post("/api/player/:playerId/work", async (req, res) => {
  await mutate(req, res, (state) => {
    const district = GAME_DATA.districts.find((item) => item.id === req.body?.districtId);
    if (!district) throw playerError("Unknown district.");
    const derived = derive(state);
    if (state.energy < district.energy) throw playerError("Not enough energy.");
    if (state.coins < district.cost || derived.power < district.power) throw playerError("That district is still locked.");

    state.energy -= district.energy;
    state.coins = state.coins - district.cost + Math.round(district.coins * 1.1);
    state.influence += district.influence;
    state.pity += 1;
    state.stats.work += 1;
    state.stats.districts[district.id] = (state.stats.districts[district.id] || 0) + 1;
    pushHistory(state, `${district.name} cleared. +${district.coins} coins, +${district.influence} influence.`);
    completeErrands(state);
  });
});

app.post("/api/player/:playerId/pull", async (req, res) => {
  await mutate(req, res, (state) => {
    const count = req.body?.count === 10 ? 10 : 1;
    const cost = count === 10 ? GAME_DATA.economy.tenPullCost : GAME_DATA.economy.pullCost;
    if (state.coins < cost) throw playerError("Not enough coins.");

    state.coins -= cost;
    const names = [];
    for (let i = 0; i < count; i += 1) {
      const relic = rollRelic(state);
      state.pulls[relic.id] = (state.pulls[relic.id] || 0) + 1;
      state.stats.pull += 1;
      names.push(`${relic.name} (${relic.rarity})`);
    }
    pushHistory(state, `Pulled ${names.join(", ")}.`);
    completeErrands(state);
  });
});

app.post("/api/player/:playerId/reset", async (req, res) => {
  const state = newState(["Fresh run started."]);
  await savePlayer(req.params.playerId, state);
  res.json(viewModel(req.params.playerId, state));
});

app.listen(PORT, () => {
  console.log(`Velvet District is running on port ${PORT}`);
});

async function mutate(req, res, change) {
  const state = await getPlayer(req.params.playerId);
  if (!state) return notFound(res);
  try {
    const migrated = migrateState(state);
    change(migrated);
    await savePlayer(req.params.playerId, migrated);
    res.json(viewModel(req.params.playerId, migrated));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Server error." });
  }
}

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
  return readSaves()[playerId] || null;
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

function newState(history = ["Welcome to Velvet District."]) {
  return {
    coins: GAME_DATA.economy.startingCoins,
    gems: GAME_DATA.economy.startingGems,
    energy: GAME_DATA.economy.maxEnergy,
    influence: 0,
    pity: 0,
    lastDaily: "",
    pulls: {},
    errands: {},
    stats: { work: 0, pull: 0, districts: {} },
    history
  };
}

function migrateState(state) {
  return {
    ...newState(state.history || ["Welcome back."]),
    ...state,
    energy: Number.isFinite(state.energy) ? state.energy : GAME_DATA.economy.maxEnergy,
    errands: state.errands || {},
    stats: {
      work: state.stats?.work || 0,
      pull: state.stats?.pull || 0,
      districts: state.stats?.districts || {}
    }
  };
}

function derive(state) {
  const setProgress = GAME_DATA.sets.map((set) => {
    const owned = set.relics.filter((id) => state.pulls[id] > 0);
    return { ...set, owned: owned.length, complete: owned.length === set.relics.length };
  });
  const relicPower = GAME_DATA.relics.reduce((sum, relic) => sum + (state.pulls[relic.id] || 0) * relic.power, 0);
  const setPower = setProgress.filter((set) => set.complete).reduce((sum, set) => sum + set.bonus, 0);
  const power = relicPower + setPower;
  const rank = GAME_DATA.ranks.reduce((best, item) => state.influence >= item[1] ? item[0] : best, GAME_DATA.ranks[0][0]);
  const collectionCount = Object.keys(state.pulls).filter((id) => state.pulls[id] > 0).length;
  const errands = GAME_DATA.errands.map((errand) => {
    const progress = errandProgress(state, errand);
    return { ...errand, progress, complete: progress >= errand.need, claimed: Boolean(state.errands[errand.id]) };
  });
  return { power, rank, collectionCount, relicCount: GAME_DATA.relics.length, setProgress, errands };
}

function errandProgress(state, errand) {
  if (errand.target === "work") return state.stats.work;
  if (errand.target === "pull") return state.stats.pull;
  if (errand.target === "collection") return Object.keys(state.pulls).filter((id) => state.pulls[id] > 0).length;
  return 0;
}

function completeErrands(state) {
  for (const errand of GAME_DATA.errands) {
    if (state.errands[errand.id]) continue;
    if (errandProgress(state, errand) < errand.need) continue;
    state.errands[errand.id] = true;
    state.coins += errand.reward.coins || 0;
    state.gems += errand.reward.gems || 0;
    state.influence += errand.reward.influence || 0;
    pushHistory(state, `${errand.name} complete. Rewards added.`);
  }
}

function rollRelic(state) {
  const forcedLegendary = state.pity >= GAME_DATA.economy.pityLimit - 1;
  const table = GAME_DATA.relics.flatMap((relic) => {
    const weight = forcedLegendary && relic.rarity === "Legendary" ? 100 : GAME_DATA.rarityWeights[relic.rarity];
    return Array(weight).fill(relic);
  });
  const relic = table[Math.floor(Math.random() * table.length)];
  state.pity = relic.rarity === "Legendary" ? 0 : state.pity + 1;
  return relic;
}

function pushHistory(state, message) {
  state.history = [message, ...(state.history || [])].slice(0, 8);
}

function viewModel(playerId, state, message) {
  return {
    playerId,
    state,
    data: GAME_DATA,
    assets: ASSET_MANIFEST,
    derived: derive(state),
    message: message || state.history?.[0] || ""
  };
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function playerError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function notFound(res) {
  res.status(404).json({ error: "Player not found." });
}
