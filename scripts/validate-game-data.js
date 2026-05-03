import { z } from "zod";
import { GAME_DATA } from "../data/game-data.js";
import { ASSET_MANIFEST } from "../data/assets.js";

const relicSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  rarity: z.enum(["Common", "Rare", "Epic", "Legendary"]),
  set: z.string(),
  power: z.number().int().positive(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i)
});

const gameSchema = z.object({
  economy: z.object({
    startingCoins: z.number().int().nonnegative(),
    startingGems: z.number().int().nonnegative(),
    maxEnergy: z.number().int().positive(),
    dailyCoins: z.number().int().nonnegative(),
    dailyGems: z.number().int().nonnegative(),
    pullCost: z.number().int().positive(),
    tenPullCost: z.number().int().positive(),
    pityLimit: z.number().int().positive()
  }),
  starterProfile: z.object({
    crewName: z.string().min(1),
    handle: z.string().min(1)
  }),
  ranks: z.array(z.tuple([z.string(), z.number().int().nonnegative()])),
  districts: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(),
    cost: z.number().int().nonnegative(),
    energy: z.number().int().positive(),
    power: z.number().int().nonnegative(),
    coins: z.number().int().nonnegative(),
    influence: z.number().int().nonnegative(),
    set: z.string(),
    text: z.string()
  })),
  errands: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(),
    target: z.enum(["work", "pull", "collection"]),
    need: z.number().int().positive(),
    reward: z.object({
      coins: z.number().int().nonnegative().optional(),
      gems: z.number().int().nonnegative().optional(),
      influence: z.number().int().nonnegative().optional()
    }),
    text: z.string()
  })),
  sets: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(),
    relics: z.array(z.string()).min(1),
    bonus: z.number().int().nonnegative()
  })),
  relics: z.array(relicSchema),
  crew: z.array(z.object({ name: z.string(), role: z.string(), bonus: z.string() })),
  rarityWeights: z.record(z.enum(["Common", "Rare", "Epic", "Legendary"]), z.number().int().positive())
});

gameSchema.parse(GAME_DATA);

const relicIds = new Set(GAME_DATA.relics.map((item) => item.id));
const setIds = new Set(GAME_DATA.sets.map((item) => item.id));
const duplicateIds = (items) => items.map((item) => item.id).filter((id, index, ids) => ids.indexOf(id) !== index);

const problems = [
  ...duplicateIds(GAME_DATA.relics).map((id) => `Duplicate relic id: ${id}`),
  ...duplicateIds(GAME_DATA.sets).map((id) => `Duplicate set id: ${id}`),
  ...duplicateIds(GAME_DATA.districts).map((id) => `Duplicate district id: ${id}`)
];

for (const set of GAME_DATA.sets) {
  for (const relicId of set.relics) {
    if (!relicIds.has(relicId)) problems.push(`Set ${set.id} references missing relic ${relicId}`);
  }
}

for (const relic of GAME_DATA.relics) {
  if (!setIds.has(relic.set)) problems.push(`Relic ${relic.id} references missing set ${relic.set}`);
}

for (const district of GAME_DATA.districts) {
  if (!setIds.has(district.set)) problems.push(`District ${district.id} references missing set ${district.set}`);
}

for (const [key, asset] of Object.entries(ASSET_MANIFEST)) {
  if (typeof asset === "object" && "src" in asset && !asset.src.startsWith("assets/")) {
    problems.push(`Asset ${key} must live under assets/`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

console.log("Game data validation passed.");
