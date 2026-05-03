import express from "express";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pg from "pg";
import { z } from "zod";
import { GAME_DATA } from "./data/game-data.js";
import { ASSET_MANIFEST } from "./data/assets.js";

const { Pool } = pg;
const PORT = process.env.PORT || 3000;
const SAVE_FILE = "dev-saves.json";
const COOKIE_NAME = "velvet_session";
const SAVE_KEY_VERSION = 3;
const isProduction = process.env.NODE_ENV === "production";

const authSchema = z.object({
  email: z.string().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  crewName: z.string().trim().min(2).max(32).optional()
});

const profileSchema = z.object({
  crewName: z.string().trim().min(2).max(32)
});

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isProduction ? { rejectUnauthorized: false } : false
    })
  : null;

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());
app.use(express.static(".", { extensions: ["html"] }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const actionLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });

await initStore();

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, version: SAVE_KEY_VERSION });
});

app.get("/api/config", (_req, res) => {
  res.json({ data: GAME_DATA, assets: ASSET_MANIFEST, version: SAVE_KEY_VERSION });
});

app.get("/api/session", async (req, res) => {
  const session = await sessionUser(req);
  res.json(session ? viewModel(session.user.id, session.user.state, "", session.user.profile) : { user: null });
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Use a valid email and an 8+ character password.");

  const { email, password, crewName } = parsed.data;
  const existing = await findUserByEmail(email);
  if (existing) return badRequest(res, "That email already has a crew.");

  const user = {
    id: randomUUID(),
    email,
    passwordHash: await bcrypt.hash(password, 12),
    profile: {
      crewName: crewName || GAME_DATA.starterProfile.crewName,
      handle: email.split("@")[0].slice(0, 24)
    },
    state: newState()
  };
  await saveUser(user);
  await issueSession(res, user.id);
  res.json(viewModel(user.id, user.state, "Crew created.", user.profile));
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const parsed = authSchema.omit({ crewName: true }).safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Use a valid email and password.");

  const user = await findUserByEmail(parsed.data.email);
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return badRequest(res, "Email or password did not match.");
  }

  await issueSession(res, user.id);
  res.json(viewModel(user.id, migrateState(user.state), "Welcome back.", user.profile));
});

app.post("/api/auth/logout", async (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (token) await deleteSession(token);
  clearSession(res);
  res.json({ ok: true });
});

app.patch("/api/profile", actionLimiter, requireUser, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Crew name must be 2-32 characters.");

  req.user.profile.crewName = parsed.data.crewName;
  await saveUser(req.user);
  res.json(viewModel(req.user.id, req.user.state, "Crew profile updated.", req.user.profile));
});

app.post("/api/player/daily", actionLimiter, requireUser, async (req, res) => {
  await mutate(req, res, (state) => {
    const today = dayKey();
    if (state.lastDaily === today) throw playerError("Daily reward already claimed.");
    state.lastDaily = today;
    state.energy = GAME_DATA.economy.maxEnergy;
    state.coins += GAME_DATA.economy.dailyCoins;
    state.gems += GAME_DATA.economy.dailyGems;
    pushHistory(state, `Daily claimed: +${GAME_DATA.economy.dailyCoins} coins, +${GAME_DATA.economy.dailyGems} gems, energy refilled.`);
  });
});

app.post("/api/player/work", actionLimiter, requireUser, async (req, res) => {
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

app.post("/api/player/pull", actionLimiter, requireUser, async (req, res) => {
  await mutate(req, res, (state) => {
    const count = req.body?.count === 10 ? 10 : 1;
    const cost = count === 10 ? GAME_DATA.economy.tenPullCost : GAME_DATA.economy.pullCost;
    if (state.coins < cost) throw playerError("Not enough coins.");

    state.coins -= cost;
    const results = [];
    for (let i = 0; i < count; i += 1) {
      const relic = rollRelic(state);
      state.pulls[relic.id] = (state.pulls[relic.id] || 0) + 1;
      state.stats.pull += 1;
      results.push(relic);
    }
    state.lastPull = results;
    pushHistory(state, `Pulled ${results.map((relic) => relic.name).join(", ")}.`);
    completeErrands(state);
  });
});

app.post("/api/player/reset", actionLimiter, requireUser, async (req, res) => {
  req.user.state = newState(["Fresh run started."]);
  await saveUser(req.user);
  res.json(viewModel(req.user.id, req.user.state, "", req.user.profile));
});

app.listen(PORT, () => {
  console.log(`Velvet District is running on port ${PORT}`);
});

async function requireUser(req, res, next) {
  const session = await sessionUser(req);
  if (!session) {
    res.status(401).json({ error: "Please sign in." });
    return;
  }
  req.user = session.user;
  next();
}

async function mutate(req, res, change) {
  try {
    req.user.state = migrateState(req.user.state);
    change(req.user.state);
    await saveUser(req.user);
    res.json(viewModel(req.user.id, req.user.state, "", req.user.profile));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Server error." });
  }
}

async function initStore() {
  if (!pool) return;
  await pool.query(`
    create table if not exists users (
      id uuid primary key,
      email text unique not null,
      password_hash text not null,
      profile jsonb not null,
      state jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists sessions (
      token_hash text primary key,
      user_id uuid not null references users(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `);
}

async function sessionUser(req) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const user = await findUserBySessionHash(tokenHash);
  return user ? { user } : null;
}

async function issueSession(res, userId) {
  const token = randomBytes(32).toString("base64url");
  await saveSession(await hashToken(token), userId);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProduction, sameSite: "lax" });
}

async function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function findUserBySessionHash(tokenHash) {
  if (pool) {
    const result = await pool.query(
      `select users.* from sessions
       join users on users.id = sessions.user_id
       where token_hash = $1 and expires_at > now()`,
      [tokenHash]
    );
    return rowToUser(result.rows[0]);
  }

  const saves = readSaves();
  const session = saves.sessions[tokenHash];
  if (!session || Date.now() > session.expiresAt) return null;
  return saves.users[session.userId] || null;
}

async function saveSession(tokenHash, userId) {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30;
  if (pool) {
    await pool.query(
      `insert into sessions (token_hash, user_id, expires_at)
       values ($1, $2, now() + interval '30 days')`,
      [tokenHash, userId]
    );
    return;
  }

  const saves = readSaves();
  saves.sessions[tokenHash] = { userId, expiresAt };
  writeSaves(saves);
}

async function deleteSession(token) {
  const tokenHash = await hashToken(token);
  if (pool) {
    await pool.query("delete from sessions where token_hash = $1", [tokenHash]);
    return;
  }
  const saves = readSaves();
  delete saves.sessions[tokenHash];
  writeSaves(saves);
}

async function findUserByEmail(email) {
  if (pool) {
    const result = await pool.query("select * from users where email = $1", [email]);
    return rowToUser(result.rows[0]);
  }
  return Object.values(readSaves().users).find((user) => user.email === email) || null;
}

async function saveUser(user) {
  if (pool) {
    await pool.query(
      `insert into users (id, email, password_hash, profile, state, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (id) do update set
         email = excluded.email,
         password_hash = excluded.password_hash,
         profile = excluded.profile,
         state = excluded.state,
         updated_at = now()`,
      [user.id, user.email, user.passwordHash, user.profile, user.state]
    );
    return;
  }
  const saves = readSaves();
  saves.users[user.id] = user;
  writeSaves(saves);
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    profile: row.profile,
    state: row.state
  };
}

function readSaves() {
  if (!existsSync(SAVE_FILE)) return { users: {}, sessions: {} };
  const saves = JSON.parse(readFileSync(SAVE_FILE, "utf8"));
  return { users: saves.users || {}, sessions: saves.sessions || {} };
}

function writeSaves(saves) {
  writeFileSync(SAVE_FILE, JSON.stringify(saves, null, 2));
}

function newState(history = ["Welcome to Velvet District."]) {
  return {
    coins: GAME_DATA.economy.startingCoins,
    gems: GAME_DATA.economy.startingGems,
    energy: GAME_DATA.economy.maxEnergy,
    influence: 0,
    pity: 0,
    lastDaily: "",
    lastPull: [],
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
    lastPull: state.lastPull || [],
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

function viewModel(userId, state, message, profile) {
  return {
    user: { id: userId, profile },
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

function badRequest(res, message) {
  res.status(400).json({ error: message });
}
