const SAVE_KEY = "velvet-district-save-v1";

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
  pulls: {}
};

let state = load();

function load() {
  try {
    return { ...baseState, ...JSON.parse(localStorage.getItem(SAVE_KEY)) };
  } catch {
    return { ...baseState };
  }
}

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function totalPower() {
  return DATA.relics.reduce((sum, relic) => sum + (state.pulls[relic.id] || 0) * relic.power, 0);
}

function currentRank() {
  return DATA.ranks.reduce((best, rank) => state.influence >= rank[1] ? rank[0] : best, DATA.ranks[0][0]);
}

function weightedRelic() {
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

function workDistrict(id) {
  const district = DATA.districts.find((item) => item.id === id);
  if (!district || state.coins < district.cost || totalPower() < district.power) return;
  state.coins -= district.cost;
  state.coins += Math.round(district.coins * 1.1);
  state.influence += district.influence;
  state.pity += 1;
  log(`${district.name} cleared. Coins and influence are up.`);
  save();
  render();
}

function pull() {
  if (state.coins < 100) return;
  state.coins -= 100;
  const relic = weightedRelic();
  state.pulls[relic.id] = (state.pulls[relic.id] || 0) + 1;
  state.pity = relic.rarity === "Legendary" ? 0 : state.pity + 1;
  if (state.pity >= 10 && relic.rarity !== "Legendary") {
    const legendary = DATA.relics.find((item) => item.rarity === "Legendary");
    state.pulls[legendary.id] = (state.pulls[legendary.id] || 0) + 1;
    state.pity = 0;
    log(`Pity sparkled into ${legendary.name}.`);
  } else {
    log(`Pulled ${relic.name} (${relic.rarity}).`);
  }
  save();
  render();
}

function log(message) {
  document.querySelector("#log").textContent = message;
  document.querySelector("#lastPull").textContent = message;
}

function render() {
  const power = totalPower();
  document.querySelector("#coins").textContent = state.coins;
  document.querySelector("#gems").textContent = state.gems;
  document.querySelector("#influence").textContent = state.influence;
  document.querySelector("#power").textContent = power;
  document.querySelector("#pity").textContent = `Pity ${state.pity}/10`;
  document.querySelector("#rank").textContent = currentRank();
  document.querySelector("#pullBtn").disabled = state.coins < 100;
  document.querySelector("#collectionCount").textContent = `${Object.keys(state.pulls).length}/${DATA.relics.length}`;

  document.querySelector("#districts").innerHTML = DATA.districts.map((district) => {
    const locked = state.coins < district.cost || power < district.power;
    const need = district.power > power ? `Need ${district.power} power` : district.cost > state.coins ? `Need ${district.cost} coins` : "Ready";
    return `
      <div class="district">
        <div>
          <h3>${district.name}</h3>
          <p>${district.text}</p>
          <p>${need} · +${district.coins} coins · +${district.influence} influence</p>
        </div>
        <button data-district="${district.id}" ${locked ? "disabled" : ""}>Work</button>
      </div>
    `;
  }).join("");

  document.querySelector("#closet").innerHTML = DATA.relics.map((relic) => {
    const count = state.pulls[relic.id] || 0;
    return `
      <div class="card" style="--rarity:${relic.color}">
        <small>${relic.rarity}</small>
        <h3>${relic.name}</h3>
        <p><strong>x${count}</strong> · ${relic.power} power each</p>
      </div>
    `;
  }).join("");

  document.querySelector("#crew").innerHTML = DATA.crew.map((member) => `
    <div class="member">
      <div>
        <h3>${member.name}</h3>
        <p>${member.role}</p>
      </div>
      <p>${member.bonus}</p>
    </div>
  `).join("");
}

document.querySelector("#pullBtn").addEventListener("click", pull);
document.querySelector("#resetBtn").addEventListener("click", () => {
  state = { ...baseState };
  save();
  log("Fresh run started.");
  render();
});
document.querySelector("#districts").addEventListener("click", (event) => {
  const id = event.target.dataset.district;
  if (id) workDistrict(id);
});

render();
