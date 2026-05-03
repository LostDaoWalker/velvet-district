let model = null;
let busy = false;
let currentView = "work";
let authMode = "login";
let selectedDistrict = "";
let selectedSet = "";

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Something went sideways.");
  return body;
}

async function boot() {
  const session = await api("/api/session");
  if (session.user) {
    model = session;
    showGame();
    render();
  } else {
    showAuth();
  }
}

async function authSubmit(event) {
  event.preventDefault();
  const payload = {
    email: document.querySelector("#email").value,
    password: document.querySelector("#password").value
  };
  if (authMode === "register") payload.crewName = document.querySelector("#crewName").value;

  try {
    model = await api(`/api/auth/${authMode}`, { method: "POST", body: JSON.stringify(payload) });
    showGame();
    render();
  } catch (error) {
    document.querySelector("#authMessage").textContent = error.message;
  }
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  model = null;
  showAuth();
}

async function act(action) {
  if (busy || !model) return;
  busy = true;
  render();
  try {
    const previousPull = model.state.lastPull?.length || 0;
    model = await action();
    if ((model.state.lastPull?.length || 0) && action.name === "pullAction" && model.state.lastPull.length !== previousPull) {
      showPullResults();
    }
  } catch (error) {
    model.message = error.message;
  } finally {
    busy = false;
    render();
  }
}

function workDistrict() {
  return act(function workAction() {
    return api("/api/player/work", {
      method: "POST",
      body: JSON.stringify({ districtId: selectedDistrict })
    });
  });
}

function pullCount(count) {
  return act(function pullAction() {
    return api("/api/player/pull", {
      method: "POST",
      body: JSON.stringify({ count })
    });
  });
}

function daily() {
  return act(function dailyAction() {
    return api("/api/player/daily", { method: "POST" });
  });
}

function reset() {
  return act(function resetAction() {
    return api("/api/player/reset", { method: "POST" });
  });
}

async function saveProfile(event) {
  event.preventDefault();
  await act(function profileAction() {
    return api("/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ crewName: document.querySelector("#profileCrewName").value })
    });
  });
}

function render() {
  if (!model?.user) return;

  const { data, state, derived, user } = model;
  if (!selectedDistrict || !data.districts.some((district) => district.id === selectedDistrict)) {
    selectedDistrict = data.districts[0].id;
  }
  if (!selectedSet || !data.sets.some((set) => set.id === selectedSet)) {
    selectedSet = data.sets[0].id;
  }

  document.querySelector("#crewName").textContent = user.profile.crewName;
  document.querySelector("#profileCrewName").value = user.profile.crewName;
  document.querySelector("#coins").textContent = state.coins;
  document.querySelector("#energy").textContent = `${state.energy}/${data.economy.maxEnergy}`;
  document.querySelector("#power").textContent = derived.power;
  document.querySelector("#pity").textContent = `Pity ${state.pity}/${data.economy.pityLimit}`;
  document.querySelector("#gems").textContent = `${state.gems} gems`;
  document.querySelector("#rank").textContent = `${derived.rank} · ${state.influence} influence`;
  document.querySelector("#pullBtn").disabled = busy || state.coins < data.economy.pullCost;
  document.querySelector("#tenPullBtn").disabled = busy || state.coins < data.economy.tenPullCost;
  document.querySelector("#dailyBtn").disabled = busy || state.lastDaily === today();
  document.querySelector("#pullBtn").textContent = `Pull - ${data.economy.pullCost}`;
  document.querySelector("#tenPullBtn").textContent = `Ten pull - ${data.economy.tenPullCost}`;
  document.querySelector("#collectionCount").textContent = `${derived.collectionCount}/${derived.relicCount} relics`;
  document.querySelector("#errandCount").textContent = `${derived.errands.filter((item) => item.claimed).length}/${derived.errands.length} goals`;
  document.querySelector("#lastPull").textContent = model.message || state.history?.[0] || "Ready.";

  renderDistrict(data, state, derived);
  renderCollection(data, state, derived);
  renderGoals(data, derived);
  applyView();
}

function renderDistrict(data, state, derived) {
  document.querySelector("#districtSelect").innerHTML = data.districts.map((district) => (
    `<option value="${district.id}" ${district.id === selectedDistrict ? "selected" : ""}>${district.name}</option>`
  )).join("");

  const district = data.districts.find((item) => item.id === selectedDistrict);
  const locked = busy || state.energy < district.energy || state.coins < district.cost || derived.power < district.power;
  const need = district.power > derived.power ? `Need ${district.power} power` : state.energy < district.energy ? `Need ${district.energy} energy` : district.cost > state.coins ? `Need ${district.cost} coins` : "Ready";
  document.querySelector("#districtMeta").textContent = `${need} · ${district.energy} energy`;
  document.querySelector("#districtFocus").innerHTML = `
    <h3>${district.name}</h3>
    <p>${district.text}</p>
    <div class="meta-row">
      <span>${district.cost} cost</span>
      <span>${district.coins} coins</span>
      <span>${district.influence} influence</span>
    </div>
    <button id="workBtn" class="primary" ${locked ? "disabled" : ""}>Work District</button>
  `;
  document.querySelector("#workBtn").addEventListener("click", workDistrict);
}

function renderCollection(data, state, derived) {
  document.querySelector("#setSelect").innerHTML = data.sets.map((set) => (
    `<option value="${set.id}" ${set.id === selectedSet ? "selected" : ""}>${set.name}</option>`
  )).join("");

  const set = derived.setProgress.find((item) => item.id === selectedSet);
  const relics = data.relics.filter((relic) => relic.set === selectedSet);
  document.querySelector("#setFocus").innerHTML = `
    <h3>${set.name}</h3>
    <p>${set.complete ? "Set bonus active" : "Collect every piece to activate the bonus."}</p>
    <div class="meta-row">
      <span>${set.owned}/${set.relics.length} owned</span>
      <span>+${set.bonus} power</span>
    </div>
    <div class="mini-list">
      ${relics.map((relic) => {
    const count = state.pulls[relic.id] || 0;
    return `
      <div class="mini-item" style="--rarity:${relic.color}">
        <span>${relic.name}</span>
        <strong>x${count}</strong>
      </div>
    `;
  }).join("")}
    </div>
  `;
}

function renderGoals(data, derived) {
  const active = derived.errands.find((errand) => !errand.claimed) || derived.errands[0];
  document.querySelector("#activeGoal").innerHTML = `
    <h3>${active.name}</h3>
    <p>${active.text}</p>
    <div class="meta-row">
      <span>${active.claimed ? "Done" : `${Math.min(active.progress, active.need)}/${active.need}`}</span>
      <span>${rewardText(active.reward)}</span>
    </div>
  `;

  document.querySelector("#crew").innerHTML = data.crew.map((member) => `
    <div class="member">
      <div>
        <h3>${member.name}</h3>
        <p>${member.role}</p>
      </div>
      <p>${member.bonus}</p>
    </div>
  `).join("");
}

function showPullResults() {
  const dialog = document.querySelector("#pullDialog");
  const data = model.data;
  document.querySelector("#pullSummary").textContent = `${model.state.lastPull.length} relic${model.state.lastPull.length === 1 ? "" : "s"} revealed.`;
  document.querySelector("#pullResults").innerHTML = model.state.lastPull.map((relic) => `
    <div class="result-card" style="--rarity:${relic.color}">
      <span>${relic.rarity}</span>
      <strong>${relic.name}</strong>
      <small>${data.sets.find((set) => set.id === relic.set)?.name || relic.set} · ${relic.power} power</small>
    </div>
  `).join("");
  dialog.showModal();
}

function rewardText(reward) {
  return Object.entries(reward).map(([key, value]) => `+${value} ${key}`).join(" · ");
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelector("#authSubmit").textContent = mode === "login" ? "Login" : "Create crew";
  document.querySelector("#crewNameField").classList.toggle("hidden", mode !== "register");
  document.querySelectorAll("[data-auth-mode]").forEach((button) => button.classList.toggle("active", button.dataset.authMode === mode));
}

function showAuth() {
  document.querySelector("#authView").classList.remove("hidden");
  document.querySelector("#gameView").classList.add("hidden");
}

function showGame() {
  document.querySelector("#authView").classList.add("hidden");
  document.querySelector("#gameView").classList.remove("hidden");
}

function applyView() {
  document.querySelectorAll("[data-view]").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === currentView);
  });
  document.querySelectorAll(".screen").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === currentView);
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

document.querySelector("#authForm").addEventListener("submit", authSubmit);
document.querySelector(".auth-toggle").addEventListener("click", (event) => {
  if (event.target.dataset.authMode) setAuthMode(event.target.dataset.authMode);
});
document.querySelector("#logoutBtn").addEventListener("click", logout);
document.querySelector("#pullBtn").addEventListener("click", () => pullCount(1));
document.querySelector("#tenPullBtn").addEventListener("click", () => pullCount(10));
document.querySelector("#dailyBtn").addEventListener("click", daily);
document.querySelector("#resetBtn").addEventListener("click", reset);
document.querySelector("#profileForm").addEventListener("submit", saveProfile);
document.querySelector("#districtSelect").addEventListener("change", (event) => {
  selectedDistrict = event.target.value;
  render();
});
document.querySelector("#setSelect").addEventListener("change", (event) => {
  selectedSet = event.target.value;
  render();
});
document.querySelector(".bottom-nav").addEventListener("click", (event) => {
  const view = event.target.dataset.view;
  if (!view) return;
  currentView = view;
  applyView();
});
document.querySelector("#closePullDialog").addEventListener("click", () => document.querySelector("#pullDialog").close());

boot();
