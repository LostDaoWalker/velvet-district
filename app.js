const PLAYER_KEY = "velvet-district-player-id-v1";

let model = null;
let busy = false;
let currentView = "play";

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Something went sideways.");
  return body;
}

async function boot() {
  const savedId = localStorage.getItem(PLAYER_KEY);
  try {
    model = savedId ? await api(`/api/player/${savedId}`) : await api("/api/player", { method: "POST" });
  } catch {
    model = await api("/api/player", { method: "POST" });
  }
  localStorage.setItem(PLAYER_KEY, model.playerId);
  render();
}

async function act(action) {
  if (busy || !model) return;
  busy = true;
  render();
  try {
    model = await action();
  } catch (error) {
    model.message = error.message;
  } finally {
    busy = false;
    render();
  }
}

function workDistrict(districtId) {
  return act(() => api(`/api/player/${model.playerId}/work`, {
    method: "POST",
    body: JSON.stringify({ districtId })
  }));
}

function pull() {
  return pullCount(1);
}

function pullCount(count) {
  return act(() => api(`/api/player/${model.playerId}/pull`, {
    method: "POST",
    body: JSON.stringify({ count })
  }));
}

function daily() {
  return act(() => api(`/api/player/${model.playerId}/daily`, { method: "POST" }));
}

function reset() {
  return act(() => api(`/api/player/${model.playerId}/reset`, { method: "POST" }));
}

function render() {
  if (!model) return;

  const { data, state, derived } = model;
  document.querySelector("#coins").textContent = state.coins;
  document.querySelector("#energy").textContent = `${state.energy}/${data.economy.maxEnergy}`;
  document.querySelector("#power").textContent = derived.power;
  document.querySelector("#pity").textContent = `Pity ${state.pity}/${data.economy.pityLimit}`;
  document.querySelector("#gems").textContent = `${state.gems} gems`;
  document.querySelector("#rank").textContent = `${derived.rank} · ${state.influence} influence`;
  document.querySelector("#pullBtn").disabled = busy || state.coins < data.economy.pullCost;
  document.querySelector("#tenPullBtn").disabled = busy || state.coins < data.economy.tenPullCost;
  document.querySelector("#dailyBtn").disabled = busy || state.lastDaily === new Date().toISOString().slice(0, 10);
  document.querySelector("#pullBtn").textContent = `Pull - ${data.economy.pullCost}`;
  document.querySelector("#tenPullBtn").textContent = `Ten pull - ${data.economy.tenPullCost}`;
  document.querySelector("#collectionCount").textContent = `${derived.collectionCount}/${derived.relicCount} relics`;
  document.querySelector("#errandCount").textContent = `${derived.errands.filter((item) => item.claimed).length}/${derived.errands.length} complete`;
  document.querySelector("#setCount").textContent = `${derived.setProgress.filter((item) => item.complete).length}/${derived.setProgress.length} active`;
  document.querySelector("#lastPull").textContent = model.message || state.history?.[0] || "Your first pull is waiting.";

  document.querySelector("#districts").innerHTML = data.districts.map((district) => {
    const locked = busy || state.energy < district.energy || state.coins < district.cost || derived.power < district.power;
    const need = district.power > derived.power ? `Need ${district.power} power` : state.energy < district.energy ? `Need ${district.energy} energy` : district.cost > state.coins ? `Need ${district.cost} coins` : "Ready";
    return `
      <div class="district">
        <div>
          <h3>${district.name}</h3>
          <p>${district.text}</p>
          <p>${need} · ${district.energy} energy · +${district.coins} coins · +${district.influence} influence</p>
        </div>
        <button data-district="${district.id}" ${locked ? "disabled" : ""}>Work</button>
      </div>
    `;
  }).join("");

  document.querySelector("#closet").innerHTML = data.relics.map((relic) => {
    const count = state.pulls[relic.id] || 0;
    return `
      <div class="card" style="--rarity:${relic.color}">
        <small>${relic.rarity}</small>
        <h3>${relic.name}</h3>
        <p><strong>x${count}</strong> · ${relic.power} power each</p>
      </div>
    `;
  }).join("");

  document.querySelector("#crew").innerHTML = data.crew.map((member) => `
    <div class="member">
      <div>
        <h3>${member.name}</h3>
        <p>${member.role}</p>
      </div>
      <p>${member.bonus}</p>
    </div>
  `).join("");

  document.querySelector("#errands").innerHTML = derived.errands.map((errand) => `
    <div class="district">
      <div>
        <h3>${errand.name}</h3>
        <p>${errand.text}</p>
        <p>${errand.claimed ? "Claimed" : `${Math.min(errand.progress, errand.need)}/${errand.need}`} · ${rewardText(errand.reward)}</p>
      </div>
      <button disabled>${errand.claimed ? "Done" : errand.complete ? "Auto" : "Open"}</button>
    </div>
  `).join("");

  document.querySelector("#sets").innerHTML = derived.setProgress.map((set) => `
    <div class="district">
      <div>
        <h3>${set.name}</h3>
        <p>${set.owned}/${set.relics.length} pieces owned</p>
        <p>${set.complete ? "Active" : "Collect all pieces"} · +${set.bonus} power</p>
      </div>
      <button disabled>${set.complete ? "On" : "Locked"}</button>
    </div>
  `).join("");

  applyView();
}

function rewardText(reward) {
  return Object.entries(reward).map(([key, value]) => `+${value} ${key}`).join(" · ");
}

document.querySelector("#pullBtn").addEventListener("click", pull);
document.querySelector("#tenPullBtn").addEventListener("click", () => pullCount(10));
document.querySelector("#dailyBtn").addEventListener("click", daily);
document.querySelector("#resetBtn").addEventListener("click", reset);
document.querySelector(".tabs").addEventListener("click", (event) => {
  const view = event.target.dataset.view;
  if (!view) return;
  currentView = view;
  applyView();
});
document.querySelector("#districts").addEventListener("click", (event) => {
  const districtId = event.target.dataset.district;
  if (districtId) workDistrict(districtId);
});

function applyView() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === currentView);
  });
  document.querySelectorAll(".view").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === currentView);
  });
}

boot();
