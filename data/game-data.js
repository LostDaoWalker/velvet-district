export const GAME_DATA = {
  economy: {
    startingCoins: 760,
    startingGems: 18,
    maxEnergy: 12,
    dailyCoins: 180,
    dailyGems: 3,
    pullCost: 100,
    tenPullCost: 900,
    pityLimit: 10
  },
  ranks: [
    ["Rookie", 0],
    ["Local Icon", 60],
    ["Velvet Muse", 160],
    ["District Queen", 340],
    ["Runway Myth", 700],
    ["City Legend", 1300]
  ],
  districts: [
    { id: "boutique", name: "Boutique Shift", cost: 0, energy: 1, power: 0, coins: 38, influence: 6, set: "gloss", text: "Style clients and stack coins." },
    { id: "photo-booth", name: "Flash Booth", cost: 25, energy: 1, power: 10, coins: 58, influence: 11, set: "chrome", text: "Pose through a fast campaign shoot." },
    { id: "afterparty", name: "Afterparty Host", cost: 90, energy: 2, power: 28, coins: 92, influence: 20, set: "gold", text: "Turn charm into buzz." },
    { id: "runway", name: "Pop-Up Runway", cost: 220, energy: 3, power: 70, coins: 168, influence: 42, set: "runway", text: "Serve a look the whole block remembers." },
    { id: "penthouse", name: "Penthouse Collab", cost: 520, energy: 4, power: 140, coins: 320, influence: 88, set: "myth", text: "Close a luxe brand moment." }
  ],
  errands: [
    { id: "moodboard", name: "Moodboard Sprint", target: "work", need: 3, reward: { coins: 120, influence: 18 }, text: "Finish three district jobs." },
    { id: "unbox", name: "Unboxing Clip", target: "pull", need: 5, reward: { gems: 4, influence: 25 }, text: "Open five relic pulls." },
    { id: "collector", name: "Closet Audit", target: "collection", need: 6, reward: { coins: 300, gems: 5 }, text: "Own six different relics." }
  ],
  sets: [
    { id: "gloss", name: "Gloss Starter", relics: ["lip", "liner"], bonus: 10 },
    { id: "chrome", name: "Chrome Night", relics: ["shades", "bag"], bonus: 18 },
    { id: "gold", name: "Gold Hour", relics: ["chain", "heels"], bonus: 26 },
    { id: "runway", name: "Runway Heat", relics: ["jacket", "boots"], bonus: 42 },
    { id: "myth", name: "Velvet Myth", relics: ["crown", "coat"], bonus: 80 }
  ],
  relics: [
    { id: "lip", name: "Crimson Gloss", rarity: "Common", set: "gloss", power: 4, color: "#ff6d67" },
    { id: "liner", name: "Winged Liner", rarity: "Common", set: "gloss", power: 5, color: "#ff6d67" },
    { id: "shades", name: "Mirror Shades", rarity: "Common", set: "chrome", power: 6, color: "#41d7c7" },
    { id: "bag", name: "Chrome Heart Bag", rarity: "Rare", set: "chrome", power: 16, color: "#41d7c7" },
    { id: "heels", name: "Lacquer Heels", rarity: "Rare", set: "gold", power: 18, color: "#f3bd54" },
    { id: "chain", name: "Gold Chain Choker", rarity: "Rare", set: "gold", power: 20, color: "#f3bd54" },
    { id: "boots", name: "Starlit Boots", rarity: "Epic", set: "runway", power: 34, color: "#8b6cff" },
    { id: "jacket", name: "Star Bomber", rarity: "Epic", set: "runway", power: 38, color: "#8b6cff" },
    { id: "coat", name: "Midnight Fur Coat", rarity: "Legendary", set: "myth", power: 62, color: "#ff93d5" },
    { id: "crown", name: "Velvet Crown", rarity: "Legendary", set: "myth", power: 70, color: "#ff93d5" }
  ],
  crew: [
    { name: "Mika", role: "Closer", bonus: "+10% district coins" },
    { name: "Vee", role: "Muse", bonus: "+1 pity after every job" },
    { name: "Sable", role: "Scout", bonus: "Unlock checks use total power" },
    { name: "Noor", role: "Archivist", bonus: "Tracks errands and set bonuses" }
  ],
  rarityWeights: {
    Common: 48,
    Rare: 28,
    Epic: 10,
    Legendary: 2
  }
};
