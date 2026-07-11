const EXPORT_ROOT = "./btc-character-export/";
const state = {
  units: [],
  combatPower: {},
  language: localStorage.getItem("xiii-language") === "zh" ? "zh" : "en",
  rarity: "all",
  faction: "all",
  sort: "default",
  query: "",
  battle: {
    left: { slots: ["", "", "", "", ""], assistants: ["", "", "", "", ""] },
    right: { slots: ["", "", "", "", ""], assistants: ["", "", "", "", ""] }
  },
  builder: Array.from({ length: 3 }, (_, index) => ({ name: `Team ${index + 1}`, slots: ["", "", "", ""], backup: "" }))
};

const translations = {
  en: {
    subtitle: "Tokyo Ghoul Awakening", archive: "Unit Archive", battle: "CP Battle", builder: "Team Building",
    localDatabase: "Local character database", rarity: "Rarity", faction: "Faction", sort: "Sort by", searchName: "Search by name",
    all: "All", ccg: "CCG (High & Low Rank)", anteiku: "Anteiku", noOrg: "No Org", defaultSort: "Default",
    cpHigh: "CP: highest to lowest", cpLow: "CP: lowest to highest", newest: "Release: newest first", oldest: "Release: oldest first",
    searchPlaceholder: "Enter a character name", shown: "shown", total: "total", teamComparison: "Team comparison",
    battleDesc: "Build two teams of five with one Assistant per unit. Assistants use the confirmed max 6★ transfer ratio and an estimated CP contribution.",
    unitsPerSide: "units per side", totalMax: "Total max CP · estimated with Assistants", firstTurn: "FIRST TURN!",
    threeTeam: "Three-team line-up", builderDesc: "Create three teams with four main units and one back-up. Drag units between any team slots.",
    teams: "teams", mainLineup: "Main Line-up", backup: "Back-up", teamCp: "Team CP", presented: "Presented by ICX (5081)",
    searchUnits: "Search by unit name or title", allFactions: "All factions", clearSlot: "Clear this slot", unitPool: "Unit pool",
    selectUnit: "Select a unit", emptySlot: "Empty slot", addAssistant: "Add Assistant", unit: "Unit", mainUnits: "main units", dragHint: "drag to rearrange", noMatches: "No units match this search."
  },
  zh: {
    subtitle: "东京喰种：觉醒", archive: "角色档案", battle: "战力对决", builder: "队伍编成",
    localDatabase: "本地角色数据库", rarity: "稀有度", faction: "阵营", sort: "排序", searchName: "按名称搜索",
    all: "全部", ccg: "CCG（高阶与低阶）", anteiku: "安定区", noOrg: "无所属", defaultSort: "默认",
    cpHigh: "战力：从高到低", cpLow: "战力：从低到高", newest: "发布日期：最新优先", oldest: "发布日期：最早优先",
    searchPlaceholder: "输入角色名称", shown: "显示", total: "总计", teamComparison: "队伍对比",
    battleDesc: "组建两支五人队伍，每名角色可配置一名助战。助战采用已确认的满6星转移比例与估算战力。",
    unitsPerSide: "每方角色", totalMax: "最高总战力 · 包含估算助战", firstTurn: "先手！",
    threeTeam: "三队编成", builderDesc: "创建三支队伍，每队四名主力与一名后备。可在队伍间拖放角色。",
    teams: "支队伍", mainLineup: "主力阵容", backup: "后备", teamCp: "队伍战力", presented: "由 ICX (5081) 呈现",
    searchUnits: "按角色名称或称号搜索", allFactions: "全部阵营", clearSlot: "清除此位置", unitPool: "角色选择",
    selectUnit: "选择角色", emptySlot: "空位置", addAssistant: "添加助战", unit: "角色", mainUnits: "名主力", dragHint: "拖动以调整", noMatches: "没有符合条件的角色。"
  }
};

const t = key => translations[state.language][key] || translations.en[key] || key;

const grid = document.querySelector("#unit-grid");
const loading = document.querySelector("#loading");
const emptyState = document.querySelector("#empty-state");
const shownCount = document.querySelector("#shown-count");
const totalCount = document.querySelector("#total-count");
const modal = document.querySelector("#unit-modal");
const modalContent = document.querySelector("#modal-content");
const battlePickerModal = document.querySelector("#battle-picker-modal");
const battlePickerResults = document.querySelector("#battle-picker-results");
let activeBattlePicker = null;
let builderDrag = null;

const rarityName = value => ({ 55: "SP", 4: "SSR", 3: "SR", 2: "R" }[value] || `R${value ?? "?"}`);
const factionName = values => {
  const set = new Set((Array.isArray(values) ? values : [values]).map(Number));
  if (set.has(1) || set.has(2)) return "CCG";
  if (set.has(3)) return "Anteiku";
  if (set.has(0)) return "No Org";
  return "Other";
};
const cleanText = value => String(value ?? "")
  .replace(/#Entry_\d+#/g, "effect")
  .replace(/#Factor_\d+#/g, "the listed amount")
  .replace(/\s+/g, " ")
  .trim();
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));

function releaseTimestamp(hero = {}) {
  try {
    const rawDate = JSON.parse(hero.display_time || "{}").DisplayTime;
    const timestamp = rawDate ? Date.parse(String(rawDate).replace(" ", "T")) : NaN;
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

async function loadCatalog() {
  try {
    const [index, combatPowerData] = await Promise.all([
      fetch(`${EXPORT_ROOT}index.json`).then(checkResponse).then(r => r.json()),
      fetch("./btc-combat-power-s00.json").then(checkResponse).then(r => r.json()).catch(() => ({ units: {} }))
    ]);
    state.combatPower = combatPowerData.units || {};
    state.units = await Promise.all(index.map(async unit => {
      const details = await fetch(`${EXPORT_ROOT}${unit.folder}/details.json`).then(checkResponse).then(r => r.json());
      const model = details.roleModels?.[0] || {};
      return {
        ...unit,
        details,
        rarity: rarityName(details.hero?.rarity),
        factions: model.faction || [],
        faction: factionName(model.faction || []),
        title: model.title_translated || "",
        releaseTimestamp: releaseTimestamp(details.hero),
        image: `${EXPORT_ROOT}${unit.folder}/${details.downloadedImages?.find(i => i.file)?.file || ""}`
      };
    }));
    state.units.sort((a, b) => {
      const order = { SP: 0, SSR: 1, SR: 2, R: 3 };
      return (order[a.rarity] ?? 9) - (order[b.rarity] ?? 9) || Number(a.id) - Number(b.id);
    });
    loading.hidden = true;
    totalCount.textContent = state.units.length;
    render();
    renderBattle();
    renderTeamBuilder();
    applyLanguage();
  } catch (error) {
    loading.innerHTML = `<span class="error">Could not open the local character data.</span><br>${escapeHtml(error.message)}<br><small>Start the page with <code>node server.mjs</code>.</small>`;
  }
}

function checkResponse(response) {
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response;
}

function applyLanguage() {
  document.documentElement.lang = state.language === "zh" ? "zh-CN" : "en";
  document.title = `XIII Files · ${t("subtitle")}`;
  document.querySelector(".site-header .eyebrow").textContent = t("subtitle");
  document.querySelector(".header-note").textContent = t("localDatabase");
  document.querySelector('[data-view="archive"]').textContent = t("archive");
  document.querySelector('[data-view="battle"]').textContent = t("battle");
  document.querySelector('[data-view="builder"]').textContent = t("builder");
  document.querySelector("#rarity-filter").closest("label").querySelector("span").textContent = t("rarity");
  document.querySelector("#faction-filter").closest("label").querySelector("span").textContent = t("faction");
  document.querySelector("#sort-filter").closest("label").querySelector("span").textContent = t("sort");
  document.querySelector("#search-input").closest("label").querySelector("span").textContent = t("searchName");
  document.querySelector("#search-input").placeholder = t("searchPlaceholder");
  const setOption = (selector, value, key) => { const option = document.querySelector(`${selector} option[value="${value}"]`); if (option) option.textContent = t(key); };
  setOption("#rarity-filter", "all", "all"); setOption("#faction-filter", "all", "all"); setOption("#faction-filter", "ccg", "ccg");
  setOption("#faction-filter", "anteiku", "anteiku"); setOption("#faction-filter", "none", "noOrg"); setOption("#sort-filter", "default", "defaultSort");
  setOption("#sort-filter", "cp-desc", "cpHigh"); setOption("#sort-filter", "cp-asc", "cpLow"); setOption("#sort-filter", "release-desc", "newest"); setOption("#sort-filter", "release-asc", "oldest");
  document.querySelector("#shown-label").textContent = t("shown");
  document.querySelector("#total-label").textContent = t("total");
  document.querySelector("#cp-battle-view .battle-header .eyebrow").textContent = t("teamComparison");
  document.querySelector("#cp-battle-view .battle-header h2").textContent = t("battle");
  document.querySelector("#cp-battle-view .battle-header p:last-child").textContent = t("battleDesc");
  document.querySelector("#cp-battle-view .battle-rule span").textContent = t("unitsPerSide");
  document.querySelectorAll(".team-heading small").forEach(item => item.textContent = t("totalMax"));
  document.querySelectorAll(".first-turn").forEach(item => item.textContent = t("firstTurn"));
  document.querySelector("#team-builder-view .builder-header .eyebrow").textContent = t("threeTeam");
  document.querySelector("#team-builder-view .builder-header h2").textContent = t("builder");
  document.querySelector("#team-builder-view .builder-header p:last-child").textContent = t("builderDesc");
  document.querySelector("#team-builder-view .builder-count span").textContent = t("teams");
  const headings = document.querySelectorAll(".builder-column-headings span");
  if (headings.length === 3) { headings[0].textContent = t("mainLineup"); headings[1].textContent = t("backup"); headings[2].textContent = t("teamCp"); }
  document.querySelector(".site-footer").textContent = t("presented");
  document.querySelector("#battle-picker-search").placeholder = t("searchUnits");
  setOption("#battle-picker-faction", "all", "allFactions"); setOption("#battle-picker-faction", "ccg", "ccg");
  setOption("#battle-picker-faction", "anteiku", "anteiku"); setOption("#battle-picker-faction", "none", "noOrg");
  document.querySelector("#battle-picker-clear").textContent = t("clearSlot");
  document.querySelectorAll(".language-option").forEach(button => {
    const active = button.dataset.language === state.language;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderBattle();
  renderTeamBuilder();
}

function unitMatchesFaction(unit, faction) {
  if (faction === "all") return true;
  const ids = new Set(unit.factions.map(Number));
  if (faction === "ccg") return ids.has(1) || ids.has(2);
  if (faction === "anteiku") return ids.has(3);
  if (faction === "none") return ids.has(0);
  return true;
}

function matchesFaction(unit) {
  return unitMatchesFaction(unit, state.faction);
}

function render() {
  const query = state.query.toLowerCase();
  const visible = state.units.filter(unit =>
    (state.rarity === "all" || unit.rarity === state.rarity) &&
    matchesFaction(unit) &&
    (!query || `${unit.name} ${unit.title} ${unit.id}`.toLowerCase().includes(query))
  );
  const numericSort = (getValue, direction) => (a, b) => {
    const left = getValue(a);
    const right = getValue(b);
    if (left == null && right == null) return Number(a.id) - Number(b.id);
    if (left == null) return 1;
    if (right == null) return -1;
    return direction * (left - right) || Number(a.id) - Number(b.id);
  };
  const sorters = {
    "cp-desc": numericSort(unit => state.combatPower[String(unit.id)]?.upgraded?.combatPower, -1),
    "cp-asc": numericSort(unit => state.combatPower[String(unit.id)]?.upgraded?.combatPower, 1),
    "release-desc": numericSort(unit => unit.releaseTimestamp, -1),
    "release-asc": numericSort(unit => unit.releaseTimestamp, 1)
  };
  if (sorters[state.sort]) visible.sort(sorters[state.sort]);
  shownCount.textContent = visible.length;
  emptyState.hidden = visible.length !== 0;
  grid.innerHTML = visible.map(unit => `
    <button class="unit-card" type="button" data-id="${escapeHtml(unit.id)}" aria-label="Open ${escapeHtml(unit.name)} details">
      <span class="portrait-wrap">
        <img src="${escapeHtml(unit.image)}" alt="" loading="lazy">
        <span class="rarity-dot ${unit.rarity.toLowerCase()}">${escapeHtml(unit.rarity)}</span>
      </span>
      ${unit.title ? `<span class="unit-title">${escapeHtml(unit.title)}</span>` : ""}
      <span class="unit-name">${escapeHtml(unit.name)}</span>
      <span class="unit-rarity">${escapeHtml(unit.rarity)}</span>
    </button>
  `).join("");
}

function maxCombatPower(unitId) {
  return Number(state.combatPower[String(unitId)]?.upgraded?.combatPower) || 0;
}

function battlePool(faction = "all", search = "") {
  const query = search.trim().toLowerCase();
  return state.units
    .filter(unit => unitMatchesFaction(unit, faction))
    .filter(unit => !query || `${unit.name} ${unit.title} ${unit.id}`.toLowerCase().includes(query))
    .sort((a, b) => maxCombatPower(b.id) - maxCombatPower(a.id) || Number(a.id) - Number(b.id));
}

function battleUnitLabel(unit) {
  const cp = maxCombatPower(unit.id);
  const title = unit.title ? ` · ${unit.title}` : "";
  return `[${unit.rarity}] ${unit.name}${title} · ${cp ? `${formatNumber(cp)} CP` : "CP N/A"}`;
}

function assistantCombatPower(unitId) {
  return Math.round(maxCombatPower(unitId) * 0.1);
}

function pickerResultsMarkup(side, slotIndex, role = "main", faction = "all", search = "") {
  const team = state.battle[side];
  const target = role === "assistant" ? team.assistants : team.slots;
  const used = new Set([...team.slots, ...team.assistants].filter(Boolean));
  const selectedId = String(target[slotIndex] || "");
  const units = battlePool(faction, search).filter(unit => !used.has(String(unit.id)) || String(unit.id) === selectedId);
  if (!units.length) return `<p class="picker-empty">${t("noMatches")}</p>`;
  return units.map(unit => {
    const id = String(unit.id);
    const cp = maxCombatPower(id);
    return `<button class="picker-unit${id === selectedId ? " selected" : ""}" type="button" data-unit-id="${escapeHtml(id)}">
      <img src="${escapeHtml(unit.image)}" alt="" loading="lazy">
      <span><strong>${escapeHtml(unit.name)}</strong><small>${escapeHtml(unit.title || unit.faction)} · ${escapeHtml(unit.rarity)}</small></span>
      <b>${cp ? (role === "assistant" ? `~${formatNumber(assistantCombatPower(id))} Assist CP` : `${formatNumber(cp)} CP`) : "CP N/A"}</b>
    </button>`;
  }).join("");
}

function renderTeam(side) {
  const team = state.battle[side];
  const teamName = side === "left" ? "Team A" : "Team B";
  const slots = document.querySelector(`#${side}-slots`);
  if (!slots) return;

  slots.innerHTML = team.slots.map((selectedId, index) => {
    const selected = state.units.find(unit => String(unit.id) === String(selectedId));
    const assistant = state.units.find(unit => String(unit.id) === String(team.assistants[index]));
    const cp = selected ? maxCombatPower(selected.id) : 0;
    const assistCp = assistant ? assistantCombatPower(assistant.id) : 0;
    return `
      <div class="team-slot${selected ? " filled" : ""}" data-slot="${index}">
        <span class="slot-number">${index + 1}</span>
        <div class="slot-portrait">
          ${selected ? `<img src="${escapeHtml(selected.image)}" alt="">` : `<span>+</span>`}
        </div>
        <div class="slot-picker">
          <button class="picker-trigger" type="button" data-side="${side}" data-slot="${index}" data-role="main" aria-label="Choose ${teamName} slot ${index + 1}">
            <span>${selected ? escapeHtml(selected.name) : t("selectUnit")}</span><b>⌄</b>
          </button>
          <div class="slot-summary">
            <span>${selected ? escapeHtml(`${selected.name}${selected.title ? ` · ${selected.title}` : ""}`) : t("emptySlot")}</span>
            <strong>${selected ? (cp ? `${formatNumber(cp)} CP` : "CP unavailable") : "—"}</strong>
          </div>
          <div class="assistant-row${assistant ? " filled" : ""}">
            <div class="assistant-portrait">${assistant ? `<img src="${escapeHtml(assistant.image)}" alt="">` : `<span>A</span>`}</div>
            <button class="picker-trigger assistant-trigger" type="button" data-side="${side}" data-slot="${index}" data-role="assistant" aria-label="Choose ${teamName} slot ${index + 1} Assistant">
              <span>${assistant ? escapeHtml(`${assistant.name} · ${assistant.title || "Assistant"}`) : t("addAssistant")}</span>
              <strong>${assistant ? `~${formatNumber(assistCp)} CP` : "+"}</strong>
            </button>
          </div>
        </div>
      </div>`;
  }).join("");
}

function builderPickerResultsMarkup(stageIndex, role = "main", slotIndex = 0, faction = "all", search = "") {
  const team = state.builder[stageIndex];
  const selectedId = String(role === "backup" ? team.backup : team.slots[slotIndex] || "");
  const used = new Set(state.builder.flatMap(item => [...item.slots, item.backup]).filter(Boolean));
  const units = battlePool(faction, search).filter(unit => !used.has(String(unit.id)) || String(unit.id) === selectedId);
  if (!units.length) return `<p class="picker-empty">${t("noMatches")}</p>`;
  return units.map(unit => {
    const id = String(unit.id);
    const cp = maxCombatPower(id);
    return `<button class="picker-unit${id === selectedId ? " selected" : ""}" type="button" data-unit-id="${escapeHtml(id)}">
      <img src="${escapeHtml(unit.image)}" alt="" loading="lazy">
      <span><strong>${escapeHtml(unit.name)}</strong><small>${escapeHtml(unit.title || unit.faction)} · ${escapeHtml(unit.rarity)}</small></span>
      <b>${cp ? `${formatNumber(cp)} CP` : "CP N/A"}</b>
    </button>`;
  }).join("");
}

function renderTeamBuilder() {
  const container = document.querySelector("#team-builder-stages");
  if (!container) return;
  container.innerHTML = state.builder.map((team, stageIndex) => {
    const mainSlots = team.slots.map((unitId, slotIndex) => {
      const unit = state.units.find(item => String(item.id) === String(unitId));
      return `<button class="builder-unit-slot${unit ? " filled" : ""}" type="button" data-stage="${stageIndex}" data-role="main" data-slot="${slotIndex}" draggable="${unit ? "true" : "false"}" aria-label="Choose ${escapeHtml(team.name)} main slot ${slotIndex + 1}">
        ${unit ? `<img src="${escapeHtml(unit.image)}" alt=""><span>${escapeHtml(unit.name)}</span>` : `<b>+</b><span>${t("unit")} ${slotIndex + 1}</span>`}
      </button>`;
    }).join("");
    const backup = state.units.find(item => String(item.id) === String(team.backup));
    const mainCp = team.slots.reduce((total, id) => total + maxCombatPower(id), 0);
    const backupCp = maxCombatPower(team.backup);
    return `<article class="builder-stage" data-stage="${stageIndex}">
      <header><input class="builder-team-name" type="text" value="${escapeHtml(team.name)}" maxlength="24" data-stage="${stageIndex}" aria-label="Edit Team ${stageIndex + 1} name"><small>${team.slots.filter(Boolean).length}/4 ${t("mainUnits")} · ${t("dragHint")}</small></header>
      <div class="builder-stage-content">
        <div class="builder-main-slots">${mainSlots}</div>
        <div class="builder-divider" aria-hidden="true"></div>
        <button class="builder-unit-slot builder-backup${backup ? " filled" : ""}" type="button" data-stage="${stageIndex}" data-role="backup" data-slot="0" draggable="${backup ? "true" : "false"}" aria-label="Choose ${escapeHtml(team.name)} back-up">
          ${backup ? `<img src="${escapeHtml(backup.image)}" alt=""><span>${escapeHtml(backup.name)}</span>` : `<b>+</b><span>${t("backup")}</span>`}
        </button>
        <div class="builder-cp"><span>${t("teamCp")}</span><strong>${formatNumber(mainCp + backupCp)}</strong><small>${t("mainLineup")} ${formatNumber(mainCp)}${backupCp ? ` + ${t("backup")} ${formatNumber(backupCp)}` : ""}</small></div>
      </div>
    </article>`;
  }).join("");
}

function refreshBattlePicker() {
  if (!activeBattlePicker) return;
  const faction = document.querySelector("#battle-picker-faction").value;
  const search = document.querySelector("#battle-picker-search").value;
  battlePickerResults.innerHTML = activeBattlePicker.context === "builder"
    ? builderPickerResultsMarkup(activeBattlePicker.stage, activeBattlePicker.role, activeBattlePicker.slot, faction, search)
    : pickerResultsMarkup(activeBattlePicker.side, activeBattlePicker.slot, activeBattlePicker.role, faction, search);
}

function openBattlePicker(side, slot, role = "main") {
  activeBattlePicker = { context: "battle", side, slot, role };
  const teamName = side === "left" ? "Team A" : "Team B";
  document.querySelector("#battle-picker-title").textContent = `${teamName} · Slot ${slot + 1} ${role === "assistant" ? "Assistant" : "Unit"}`;
  document.querySelector(".battle-picker-heading .eyebrow").textContent = role === "assistant" ? "Assistant pool · max 6★ estimate" : "Unit pool";
  document.querySelector("#battle-picker-search").value = "";
  document.querySelector("#battle-picker-faction").value = "all";
  const target = role === "assistant" ? state.battle[side].assistants : state.battle[side].slots;
  document.querySelector("#battle-picker-clear").hidden = !target[slot];
  refreshBattlePicker();
  battlePickerModal.showModal();
  document.querySelector("#battle-picker-search").focus();
}

function openBuilderPicker(stage, role, slot = 0) {
  activeBattlePicker = { context: "builder", stage, role, slot };
  document.querySelector("#battle-picker-title").textContent = `Stage ${stage + 1} · ${role === "backup" ? "Back-up" : `Main Slot ${slot + 1}`}`;
  document.querySelector(".battle-picker-heading .eyebrow").textContent = role === "backup" ? "Back-up unit pool" : "Main line-up unit pool";
  document.querySelector("#battle-picker-search").value = "";
  document.querySelector("#battle-picker-faction").value = "all";
  const selected = role === "backup" ? state.builder[stage].backup : state.builder[stage].slots[slot];
  document.querySelector("#battle-picker-clear").hidden = !selected;
  refreshBattlePicker();
  battlePickerModal.showModal();
  document.querySelector("#battle-picker-search").focus();
}

function builderSlotValue(position) {
  const team = state.builder[position.stage];
  return position.role === "backup" ? team.backup : team.slots[position.slot];
}

function setBuilderSlot(position, value) {
  const team = state.builder[position.stage];
  if (position.role === "backup") team.backup = value;
  else team.slots[position.slot] = value;
}

function teamTotals(side) {
  const main = state.battle[side].slots.reduce((total, unitId) => total + maxCombatPower(unitId), 0);
  const assistants = state.battle[side].assistants.reduce((total, unitId) => total + assistantCombatPower(unitId), 0);
  return { main, assistants, combined: main + assistants };
}

function updateBattleTotals() {
  const leftParts = teamTotals("left");
  const rightParts = teamTotals("right");
  const left = leftParts.combined;
  const right = rightParts.combined;
  document.querySelector("#left-total-cp").textContent = formatNumber(left);
  document.querySelector("#right-total-cp").textContent = formatNumber(right);
  document.querySelectorAll("#left-total-cp, #right-total-cp").forEach(total => {
    total.classList.remove("cp-updated");
    void total.offsetWidth;
    total.classList.add("cp-updated");
  });
  document.querySelector("#left-assist-cp").textContent = `Main ${formatNumber(leftParts.main)} + Assist ~${formatNumber(leftParts.assistants)}`;
  document.querySelector("#right-assist-cp").textContent = `Main ${formatNumber(rightParts.main)} + Assist ~${formatNumber(rightParts.assistants)}`;
  document.querySelector("#left-first-turn").hidden = !(left > right);
  document.querySelector("#right-first-turn").hidden = !(right > left);
  const status = document.querySelector("#battle-status");
  if (!left && !right) status.textContent = "Select units to compare both teams.";
  else if (left === right) status.textContent = `CP tie at ${formatNumber(left)} — neither team has the first-turn advantage.`;
  else {
    const winner = left > right ? "Team A" : "Team B";
    status.textContent = `${winner} leads by ${formatNumber(Math.abs(left - right))} CP and takes the first turn.`;
  }
}

function renderBattle() {
  renderTeam("left");
  renderTeam("right");
  updateBattleTotals();
}

function switchView(view) {
  document.querySelector("#archive-view").hidden = view !== "archive";
  document.querySelector("#cp-battle-view").hidden = view !== "battle";
  document.querySelector("#team-builder-view").hidden = view !== "builder";
  document.querySelectorAll(".app-tab").forEach(tab => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

function statCards(stats = {}) {
  const wanted = [
    ["HP", stats.hp], ["ATK", stats.atk], ["DEF", stats.def],
    ["Crit Rate", stats.crit], ["Crit DEF", stats.uncrit], ["Crit DMG", stats.crit_deepen],
    ["Crit DMG DEF", stats.uncrit_deepen], ["Block", stats.block], ["PEN Rate", stats.unblock],
    ["Lifesteal", stats.suck], ["Regeneration", stats.regeneration], ["Healing received", stats.get_cured],
    ["Energy when hit", stats.energy_be_hurt]
  ];
  return wanted.filter(([, value]) => value !== undefined).map(([label, value]) => {
    const display = typeof value === "number" && value > 0 && value < 1 ? `${Math.round(value * 100)}%` : value;
    return `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(display)}</strong></div>`;
  }).join("");
}

const formatNumber = value => Number(value).toLocaleString("en-US");

function renderCombatPower(heroId) {
  const snapshot = state.combatPower[String(heroId)];
  if (!snapshot?.base || !snapshot?.upgraded) return "";
  const base = snapshot.base;
  const upgraded = snapshot.upgraded;
  const increase = Number(snapshot.combatPowerIncrease ?? upgraded.combatPower - base.combatPower);
  const card = (label, values, upgradedCard = false) => `
    <article class="cp-card${upgradedCard ? " upgraded" : ""}">
      <div class="cp-card-heading">
        <span>${escapeHtml(label)}</span>
        ${upgradedCard && increase > 0 ? `<em>+${formatNumber(increase)} CP</em>` : ""}
      </div>
      <strong class="cp-value">${formatNumber(values.combatPower)}</strong>
      <span class="cp-caption">Combat Power</span>
      <div class="cp-stat-row">
        <span><small>ATK</small><b>${formatNumber(values.atk)}</b></span>
        <span><small>DEF</small><b>${formatNumber(values.def)}</b></span>
        <span><small>HP</small><b>${formatNumber(values.hp)}</b></span>
      </div>
    </article>`;
  return `
    <section class="detail-section cp-section">
      <div class="section-heading">
        <h3>Combat Power · ${escapeHtml(snapshot.preset || "S00")}</h3>
        <span>Direct SEA game snapshot</span>
      </div>
      <div class="cp-grid">
        ${card("Base snapshot", base)}
        ${card("Upgraded snapshot", upgraded, true)}
      </div>
      <p class="cp-note">Stored progression values from HeroStrengthList. These are separate from the level 1 source stats below.</p>
    </section>`;
}

function uniqueSkills(skills = []) {
  return [...new Map(skills.filter(Boolean).map(skill => [String(skill.id), skill])).values()];
}

function replaceTokens(text, skill) {
  let result = String(text || "");
  (skill.factor_lv1 || []).forEach((value, index) => {
    result = result.replaceAll(`#Factor_${index + 1}#`, value);
  });
  const entryNames = Array.isArray(skill.entry) ? skill.entry.map(value => String(value).replace(/^tid#Skill_EntryName_/, "Effect ")) : [];
  entryNames.forEach((value, index) => {
    result = result.replaceAll(`#Entry_${index + 1}#`, value);
  });
  return cleanText(result);
}

function skillCard(skill, label, className = "") {
  const base = replaceTokens(skill.desc_short_translated || skill.max_desc_short_translated, skill);
  const entry = cleanText(skill.entry_desc_translated || "");
  const rank = cleanText(skill.r_max_entry_desc_translated || "");
  return `
    <article class="skill ${className}">
      <div class="skill-heading">
        <span class="skill-icon">${escapeHtml(skill.level || label?.charAt(0) || "P")}</span>
        <div>
          <span class="skill-kind">${escapeHtml(label)} · ${escapeHtml(skill.id)}</span>
          <h4>${escapeHtml(skill.name_translated || "Talent Effect")}</h4>
        </div>
      </div>
      <p>${escapeHtml(base || "No translated description.")}</p>
      ${entry ? `<p class="entry-text">${escapeHtml(entry)}</p>` : ""}
      ${rank && rank !== entry ? `<p class="rank-text"><strong>R-Max:</strong> ${escapeHtml(rank)}</p>` : ""}
    </article>`;
}

function renderSkills(details) {
  const skills = uniqueSkills(details.skills);
  const active = skills.filter(skill => Number(skill.type) === 1).sort((a, b) => Number(a.level) - Number(b.level));
  const normalIds = new Set(details.hero.passive_skill || []);
  const giftIds = new Set(details.hero.passive_skill_gift_n || []);
  const rankId = String(details.hero.rank_p_skill || "");
  const passive = skills.filter(skill => normalIds.has(skill.id));
  const gifts = skills.filter(skill => giftIds.has(skill.id) && !normalIds.has(skill.id));
  const rank = skills.filter(skill => String(skill.id) === rankId);
  return [
    ...active.map(skill => skillCard(skill, `Active #1 · Level ${skill.level}`, `level-${skill.level}`)),
    ...passive.map(skill => skillCard(skill, "Passive")),
    ...gifts.map(skill => skillCard(skill, "Gift Upgrade", "gift-skill")),
    ...rank.map(skill => skillCard(skill, "Rank Passive", "rank-skill"))
  ].join("") || `<p class="state-message">No translated skills found.</p>`;
}

function renderSkillTiers(details) {
  let tiers = {};
  try { tiers = JSON.parse(details.hero.skill_up_effect || "{}"); } catch { /* No tiers. */ }
  const skills = new Map(uniqueSkills(details.skills).map(skill => [String(skill.id), skill]));
  return Object.entries(tiers).map(([tier, ids]) => `
    <section class="talent-tier tier-${tier}">
      <h4>Tier ${escapeHtml(tier)}</h4>
      <div class="skill-list">
        ${ids.map(id => skills.has(String(id)) ? skillCard(skills.get(String(id)), `Effect ${ids.indexOf(id) + 1}`, "talent") : "").join("")}
      </div>
    </section>
  `).join("") || `<p class="state-message">No skill-up tiers found.</p>`;
}

function relationCards(relations = []) {
  const ids = new Set();
  relations.flatMap(relation => relation.hero_soul_id || []).forEach(id => ids.add(String(id)));
  return [...ids].map(id => {
    const related = state.units.find(unit => String(unit.id) === id);
    return `<span class="relation">#${escapeHtml(id)} · ${escapeHtml(related?.name || "Linked unit")}</span>`;
  }).join("") || `<span class="relation">No linked units</span>`;
}

function openUnit(id) {
  const unit = state.units.find(item => String(item.id) === String(id));
  if (!unit) return;
  const d = unit.details;
  const model = d.roleModels?.[0] || {};
  const stats = d.stats?.[0] || {};
  let releaseDate = "";
  try {
    const rawDate = JSON.parse(d.hero.display_time || "{}").DisplayTime;
    if (rawDate) releaseDate = new Date(rawDate.replace(" ", "T")).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { /* No release date. */ }
  const tacticNames = { 1: "Power", 2: "Wit", 3: "Speed" };
  const orbDescription = d.hero.max_rank_skill_tips_translated || d.hero.max_rank_skill_desc_translated || "Character ability information.";
  modalContent.innerHTML = `
    <header class="hero-banner">
      <img class="hero-portrait" src="${escapeHtml(unit.image)}" alt="${escapeHtml(unit.name)}">
      <div>
        <p class="eyebrow">Unit #${escapeHtml(unit.id)}</p>
        <h2>${escapeHtml(unit.name)}</h2>
        <p class="hero-title">${escapeHtml(unit.title || "Character record")}</p>
        <div class="hero-meta">
          <span class="pill accent">${escapeHtml(unit.rarity)}</span>
          <span class="pill">${escapeHtml(unit.faction)}</span>
          ${model.tactic_type ? `<span class="pill">${escapeHtml(tacticNames[model.tactic_type] || `Tactic ${model.tactic_type}`)}</span>` : ""}
          ${model.rc_type ? `<span class="pill">${escapeHtml(model.rc_type)}</span>` : ""}
          ${releaseDate ? `<span class="pill">Released ${escapeHtml(releaseDate)}</span>` : ""}
        </div>
      </div>
    </header>
    <div class="details-body">
      <section class="ability-card">
        <div class="orb-icon">◉</div>
        <div>
          <span class="skill-kind">Orb Details · Exclusive Skill</span>
          <h3>${escapeHtml(unit.title)} Ability Sphere</h3>
          <p>${escapeHtml(orbDescription)}</p>
        </div>
      </section>
      ${renderCombatPower(unit.id)}
      <section class="detail-section">
        <div class="section-heading"><h3>Complete base stats</h3><span>Level 1 source values</span></div>
        <div class="stat-grid">${statCards(stats)}</div>
      </section>
      <section class="detail-section">
        <div class="section-heading"><h3>Skills</h3><span>Active levels, passives, gift upgrade and rank passive</span></div>
        <div class="skill-list">${renderSkills(d)}</div>
      </section>
      <section class="detail-section">
        <div class="section-heading"><h3>Skill Up Effects</h3><span>Ability Breakthrough tiers</span></div>
        <div class="tier-list">${renderSkillTiers(d)}</div>
      </section>
      <section class="detail-section">
        <h3>Relations</h3>
        <div class="relation-list">${relationCards(d.relations)}</div>
      </section>
      <section class="detail-section">
        <h3>Progression summary</h3>
        <div class="stat-grid">
          <div class="stat"><span>Max quality level</span><strong>${Math.max(0, ...(d.qualities || []).map(q => Number(q.level_limit) || 0))}</strong></div>
          <div class="stat"><span>Skill records</span><strong>${uniqueSkills(d.skills).length}</strong></div>
          <div class="stat"><span>Effects</span><strong>${d.effects?.length || 0}</strong></div>
          <div class="stat"><span>Relations</span><strong>${d.relations?.length || 0}</strong></div>
          <div class="stat"><span>Rank</span><strong>${escapeHtml(d.hero.rank || "—")}</strong></div>
          <div class="stat"><span>Quality stages</span><strong>${d.qualities?.length || 0}</strong></div>
        </div>
      </section>
      <details class="raw-data">
        <summary>View complete source details</summary>
        <pre>${escapeHtml(JSON.stringify(d, null, 2))}</pre>
      </details>
    </div>`;
  modal.showModal();
  modal.scrollTop = 0;
}

document.querySelector("#rarity-filter").addEventListener("change", event => { state.rarity = event.target.value; render(); });
document.querySelector("#faction-filter").addEventListener("change", event => { state.faction = event.target.value; render(); });
document.querySelector("#sort-filter").addEventListener("change", event => { state.sort = event.target.value; render(); });
document.querySelector("#search-input").addEventListener("input", event => { state.query = event.target.value.trim(); render(); });
document.querySelectorAll(".app-tab").forEach(tab => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});
document.querySelectorAll(".language-option").forEach(button => {
  button.addEventListener("click", () => {
    state.language = button.dataset.language;
    localStorage.setItem("xiii-language", state.language);
    applyLanguage();
  });
});
["left", "right"].forEach(side => {
  const slots = document.querySelector(`#${side}-slots`);
  slots.addEventListener("click", event => {
    const trigger = event.target.closest(".picker-trigger");
    if (trigger) openBattlePicker(side, Number(trigger.dataset.slot), trigger.dataset.role || "main");
  });
});
document.querySelector("#team-builder-stages").addEventListener("click", event => {
  if (event.target.closest(".builder-team-name")) return;
  const slot = event.target.closest(".builder-unit-slot");
  if (slot) openBuilderPicker(Number(slot.dataset.stage), slot.dataset.role, Number(slot.dataset.slot));
});
document.querySelector("#team-builder-stages").addEventListener("input", event => {
  const input = event.target.closest(".builder-team-name");
  if (input) state.builder[Number(input.dataset.stage)].name = input.value;
});
document.querySelector("#team-builder-stages").addEventListener("change", event => {
  const input = event.target.closest(".builder-team-name");
  if (!input) return;
  const stage = Number(input.dataset.stage);
  const fallback = `Team ${stage + 1}`;
  state.builder[stage].name = input.value.trim() || fallback;
  input.value = state.builder[stage].name;
});
document.querySelector("#team-builder-stages").addEventListener("dragstart", event => {
  const slot = event.target.closest(".builder-unit-slot.filled");
  if (!slot) return;
  builderDrag = { stage: Number(slot.dataset.stage), role: slot.dataset.role, slot: Number(slot.dataset.slot) };
  slot.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", JSON.stringify(builderDrag));
});
document.querySelector("#team-builder-stages").addEventListener("dragover", event => {
  const slot = event.target.closest(".builder-unit-slot");
  if (!slot || !builderDrag) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".builder-unit-slot.drag-over").forEach(item => item.classList.remove("drag-over"));
  slot.classList.add("drag-over");
});
document.querySelector("#team-builder-stages").addEventListener("dragleave", event => {
  const slot = event.target.closest(".builder-unit-slot");
  if (slot && !slot.contains(event.relatedTarget)) slot.classList.remove("drag-over");
});
document.querySelector("#team-builder-stages").addEventListener("drop", event => {
  const slot = event.target.closest(".builder-unit-slot");
  if (!slot || !builderDrag) return;
  event.preventDefault();
  const destination = { stage: Number(slot.dataset.stage), role: slot.dataset.role, slot: Number(slot.dataset.slot) };
  const sourceValue = builderSlotValue(builderDrag);
  const destinationValue = builderSlotValue(destination);
  setBuilderSlot(destination, sourceValue);
  setBuilderSlot(builderDrag, destinationValue);
  builderDrag = null;
  renderTeamBuilder();
});
document.querySelector("#team-builder-stages").addEventListener("dragend", () => {
  builderDrag = null;
  document.querySelectorAll(".builder-unit-slot.dragging, .builder-unit-slot.drag-over").forEach(item => item.classList.remove("dragging", "drag-over"));
});
document.querySelector("#battle-picker-search").addEventListener("input", refreshBattlePicker);
document.querySelector("#battle-picker-faction").addEventListener("change", refreshBattlePicker);
battlePickerResults.addEventListener("click", event => {
  const button = event.target.closest(".picker-unit");
  if (!button || !activeBattlePicker) return;
  if (activeBattlePicker.context === "builder") {
    const team = state.builder[activeBattlePicker.stage];
    if (activeBattlePicker.role === "backup") team.backup = button.dataset.unitId;
    else team.slots[activeBattlePicker.slot] = button.dataset.unitId;
    renderTeamBuilder();
  } else {
    const target = activeBattlePicker.role === "assistant" ? state.battle[activeBattlePicker.side].assistants : state.battle[activeBattlePicker.side].slots;
    target[activeBattlePicker.slot] = button.dataset.unitId;
    renderTeam(activeBattlePicker.side);
    updateBattleTotals();
  }
  battlePickerModal.close();
});
document.querySelector("#battle-picker-clear").addEventListener("click", () => {
  if (!activeBattlePicker) return;
  if (activeBattlePicker.context === "builder") {
    const team = state.builder[activeBattlePicker.stage];
    if (activeBattlePicker.role === "backup") team.backup = "";
    else team.slots[activeBattlePicker.slot] = "";
    renderTeamBuilder();
  } else {
    const target = activeBattlePicker.role === "assistant" ? state.battle[activeBattlePicker.side].assistants : state.battle[activeBattlePicker.side].slots;
    target[activeBattlePicker.slot] = "";
    renderTeam(activeBattlePicker.side);
    updateBattleTotals();
  }
  battlePickerModal.close();
});
document.querySelector("#battle-picker-close").addEventListener("click", () => battlePickerModal.close());
battlePickerModal.addEventListener("click", event => { if (event.target === battlePickerModal) battlePickerModal.close(); });
grid.addEventListener("click", event => {
  const card = event.target.closest(".unit-card");
  if (card) openUnit(card.dataset.id);
});
document.querySelector("#modal-close").addEventListener("click", () => modal.close());
modal.addEventListener("click", event => {
  if (event.target === modal) modal.close();
});

applyLanguage();
loadCatalog();
