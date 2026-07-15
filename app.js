const EXPORT_ROOT = "./btc-character-export/";
const state = {
  units: [],
  combatPower: {},
  skillEntries: {},
  battleEffectAudit: new Map(),
  language: localStorage.getItem("xiii-language") === "zh" ? "zh" : "en",
  rarity: "all",
  faction: "all",
  sort: "default",
  query: "",
  builder: Array.from({ length: 3 }, (_, index) => ({ name: `Team ${index + 1}`, description: "", slots: ["", "", "", ""], backup: "" }))
};

const battleSimulatorState = {
  teams: {
    left: { slots: ["", "", "", "", ""], maxTalents: [false, false, false, false, false] },
    right: { slots: ["", "", "", "", ""], maxTalents: [false, false, false, false, false] }
  },
  runs: 500,
  maxRounds: 12,
  seed: 5081,
  includeKits: true,
  maxInvestment: false,
  result: null,
  runTimer: null,
  playbackToken: 0
};

const BATTLE_SIMULATOR_TEST_PRESET = {
  left: ["1102", "1150", "1116", "1169", "1170"],
  right: ["1168", "1160", "1162", "1144", "1166"]
};

const BATTLE_SIMULATOR_PLAYBACK_TIMING = Object.freeze({
  startDelay: 450,
  actionDelay: 700,
  resultDelay: 800
});

// Formation slots define a deterministic initial ATK hierarchy. These are
// minimum targets based on the strongest pre-battle ATK on the team, so no
// unit is weakened and every On Field slot has a strict priority.
const SIMULATOR_SLOT_ATTACK_PREMIUMS = Object.freeze([0.06, 0.04, 0.02, 0]);

/* The APK splits account progression across many tables and does not provide one
   authoritative "everything maxed" snapshot. This equalized proxy is calibrated
   to the roughly 3x S00-to-built-team gap visible in supplied Quick Battle captures.
   It scales only CP-bearing core stats; unique loadout/set effects stay under the
   audited skill/passive model instead of being invented here. */
const SIMULATOR_MAX_INVESTMENT_PROFILE = Object.freeze({
  multiplier: 3,
  label: "Max investment proxy",
  detail: "3.00x CP, ATK, DEF and HP · RC Cells, Force Talents, Scenes, Potentials, Tactics and equipment · estimated"
});

const translations = {
  en: {
    subtitle: "Tokyo Ghoul Awakening", archive: "Unit Archive", battle: "CP Battle", simulator: "Battle Simulator", builder: "Team Building", carnival: "Carnival Banner Simulator", potentialWheel: "Potential Wheel Simulator",
    localDatabase: "Local character database", rarity: "Rarity", faction: "Faction", sort: "Sort by", searchName: "Search by name",
    all: "All", ccg: "CCG (High & Low Rank)", anteiku: "Anteiku", noOrg: "No Org", defaultSort: "Default",
    cpHigh: "CP: highest to lowest", cpLow: "CP: lowest to highest", newest: "Release: newest first", oldest: "Release: oldest first",
    searchPlaceholder: "Enter a character name", shown: "shown", total: "total", teamComparison: "Team comparison",
    battleDesc: "Build two teams of five with one Assistant per unit. Assistants use the confirmed max 6★ transfer ratio and an estimated CP contribution.",
    unitsPerSide: "units per side", totalMax: "Total max CP · estimated with Assistants", firstTurn: "FIRST TURN!",
    threeTeam: "Three-team line-up", builderDesc: "Create three teams with four main units and one back-up. Drag units between any team slots.",
    teams: "teams", mainLineup: "Main Line-up", backup: "Back-up", teamCp: "Team CP", presented: "Presented by ICX (5081)",
    searchUnits: "Search by unit name or title", allFactions: "All factions", clearSlot: "Clear this slot", unitPool: "Unit pool",
    selectUnit: "Select a unit", emptySlot: "Empty slot", addAssistant: "Add Assistant", unit: "Unit", mainUnits: "main units", dragHint: "drag to rearrange", noMatches: "No units match this search.",
    teamStrategy: "Team strategy & goal", teamStrategyPlaceholder: "Explain why this team works, its playstyle, and its goal...", shareTeam: "Share Team"
  },
  zh: {
    subtitle: "东京喰种：觉醒", archive: "角色档案", battle: "战力对决", builder: "队伍编成", potentialWheel: "潜能转盘模拟器",
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
const teamShareModal = document.querySelector("#team-share-modal");
const teamShareCanvas = document.querySelector("#team-share-canvas");
const teamShareImage = document.querySelector("#team-share-image");
let activeBattlePicker = null;
let builderDrag = null;
let simulatorDrag = null;
let simulatorPointerDrag = null;
let simulatorIgnoreClickUntil = 0;
let activeTeamShareStage = 0;

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
    const [index, combatPowerData, skillEntryData, battleEffectData] = await Promise.all([
      fetch(`${EXPORT_ROOT}index.json`).then(checkResponse).then(r => r.json()),
      fetch("./btc-combat-power-s00.json").then(checkResponse).then(r => r.json()).catch(() => ({ units: {} })),
      fetch(`${EXPORT_ROOT}skill-entry-translations.json`).then(checkResponse).then(r => r.json()).catch(() => ({})),
      fetch("./battle-simulator-effect-audit.json").then(checkResponse).then(r => r.json()).catch(() => ({ units: [] }))
    ]);
    state.combatPower = combatPowerData.units || {};
    state.skillEntries = skillEntryData;
    state.battleEffectAudit = new Map((battleEffectData.units || []).map(unit => [String(unit.id), unit]));
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
    renderTeamBuilder();
    initializeBattleSimulator();
    initializeCarnival();
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
  document.querySelector('[data-view="simulator"]').textContent = t("simulator");
  document.querySelector('[data-view="builder"]').textContent = t("builder");
  document.querySelector('[data-view="carnival"]').textContent = t("carnival");
  document.querySelector('[data-view="potential-wheel"]').textContent = t("potentialWheel");
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
        ${unit.upcoming ? `<span class="upcoming-unit-badge">UPCOMING</span>` : ""}
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
      <div class="builder-team-notes">
        <label><span>${t("teamStrategy")}</span><textarea class="builder-team-description" data-stage="${stageIndex}" maxlength="420" placeholder="${escapeHtml(t("teamStrategyPlaceholder"))}" aria-label="${escapeHtml(t("teamStrategy"))} for ${escapeHtml(team.name)}">${escapeHtml(team.description || "")}</textarea></label>
        <button class="builder-share-button" type="button" data-stage="${stageIndex}"><span aria-hidden="true">&#8599;</span>${t("shareTeam")}</button>
      </div>
    </article>`;
  }).join("");
}

function canvasImage(source) {
  return new Promise(resolve => {
    if (!source) return resolve(null);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function drawCover(context, image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function canvasLines(context, text, maxWidth, maxLines = 3) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = "";
  let wordIndex = 0;
  for (; wordIndex < words.length; wordIndex += 1) {
    const candidate = current ? `${current} ${words[wordIndex]}` : words[wordIndex];
    if (context.measureText(candidate).width <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = words[wordIndex];
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (wordIndex < words.length && lines.length) {
    const last = lines.length - 1;
    while (lines[last] && context.measureText(`${lines[last]}...`).width > maxWidth) lines[last] = lines[last].replace(/\s+\S+$/, "");
    lines[last] = `${lines[last]}...`;
  }
  return lines;
}

function drawShareUnit(context, unit, image, x, y, width, label, accent) {
  const imageHeight = 205;
  context.fillStyle = "#111316";
  context.fillRect(x, y, width, 320);
  context.fillStyle = accent;
  context.fillRect(x, y, width, 5);
  if (image) drawCover(context, image, x, y + 5, width, imageHeight);
  else {
    context.fillStyle = "#1b1e22";
    context.fillRect(x, y + 5, width, imageHeight);
    context.fillStyle = "#59616b";
    context.font = "700 18px Inter, Arial, sans-serif";
    context.textAlign = "center";
    context.fillText("EMPTY SLOT", x + width / 2, y + 112);
  }
  context.textAlign = "left";
  context.fillStyle = accent;
  context.font = "800 14px Inter, Arial, sans-serif";
  context.fillText(label.toUpperCase(), x + 14, y + 238);
  context.fillStyle = "#f5f7fa";
  context.font = "800 18px Inter, Arial, sans-serif";
  const nameLines = canvasLines(context, unit?.name || "Unassigned", width - 28, 2);
  nameLines.forEach((line, index) => context.fillText(line, x + 14, y + 268 + index * 21));
  if (unit?.title && nameLines.length === 1) {
    context.fillStyle = "#8d969f";
    context.font = "500 12px Inter, Arial, sans-serif";
    const title = canvasLines(context, unit.title, width - 28, 1)[0];
    if (title) context.fillText(title, x + 14, y + 298);
  }
}

async function generateTeamShare(stageIndex) {
  const team = state.builder[stageIndex];
  if (!team || !teamShareCanvas) return;
  const copyButton = document.querySelector("#team-share-copy");
  const status = document.querySelector("#team-share-status");
  copyButton.disabled = true;
  status.textContent = "Creating your share image...";
  const units = [...team.slots, team.backup].map(id => state.units.find(unit => String(unit.id) === String(id)) || null);
  const images = await Promise.all(units.map(unit => canvasImage(unit?.image)));
  const context = teamShareCanvas.getContext("2d");
  context.fillStyle = "#08090b";
  context.fillRect(0, 0, teamShareCanvas.width, teamShareCanvas.height);
  context.fillStyle = "#31d6a4";
  context.fillRect(0, 0, teamShareCanvas.width, 8);
  context.fillStyle = "#76818c";
  context.font = "800 15px Inter, Arial, sans-serif";
  context.fillText("XIII FILES  /  TEAM BUILDING", 54, 50);
  context.fillStyle = "#f6f7f9";
  context.font = "800 40px Inter, Arial, sans-serif";
  const title = canvasLines(context, team.name.trim() || `Team ${stageIndex + 1}`, 1090, 1)[0];
  context.fillText(title, 54, 98);
  context.fillStyle = "#a6afb8";
  context.font = "500 18px Inter, Arial, sans-serif";
  const description = team.description.trim() || "No team strategy has been added yet.";
  canvasLines(context, description, 1085, 3).forEach((line, index) => context.fillText(line, 54, 136 + index * 25));
  context.fillStyle = "#262a2f";
  context.fillRect(54, 205, 1092, 1);
  context.fillStyle = "#727c86";
  context.font = "800 13px Inter, Arial, sans-serif";
  context.fillText("MAIN LINE-UP", 54, 234);
  context.fillStyle = "#a98ad4";
  context.fillText("BACK-UP", 958, 234);
  for (let index = 0; index < 4; index += 1) drawShareUnit(context, units[index], images[index], 54 + index * 218, 249, 198, `On field ${index + 1}`, "#31d6a4");
  drawShareUnit(context, units[4], images[4], 958, 249, 188, "Backup", "#a98ad4");
  context.fillStyle = "#25292e";
  context.fillRect(54, 600, 1092, 1);
  context.fillStyle = "#707984";
  context.font = "600 14px Inter, Arial, sans-serif";
  context.fillText("TOKYO GHOUL AWAKENING", 54, 634);
  context.textAlign = "right";
  context.fillStyle = "#31d6a4";
  context.fillText("Presented by ICX (5081)", 1146, 634);
  context.textAlign = "left";
  teamShareImage.src = teamShareCanvas.toDataURL("image/png");
  teamShareImage.hidden = false;
  teamShareImage.classList.remove("long-press-ready");
  document.querySelector("#team-share-title").textContent = team.name.trim() || `Team ${stageIndex + 1}`;
  const weChat = /MicroMessenger/i.test(navigator.userAgent);
  copyButton.textContent = weChat ? "Press & Hold Image" : "Copy Image";
  status.textContent = weChat
    ? "WeChat blocks direct image copying. Press and hold the image, then choose Save Image or Send to Chat."
    : "Image ready. Copy it, then paste it into Discord, Messenger, or any image editor.";
  copyButton.disabled = false;
}

async function openTeamShare(stageIndex) {
  activeTeamShareStage = stageIndex;
  teamShareModal.showModal();
  await generateTeamShare(stageIndex);
}

function showTeamShareImageFallback() {
  const button = document.querySelector("#team-share-copy");
  const status = document.querySelector("#team-share-status");
  teamShareImage.classList.remove("long-press-ready");
  void teamShareImage.offsetWidth;
  teamShareImage.classList.add("long-press-ready");
  button.textContent = "Press & Hold Image";
  button.disabled = false;
  status.textContent = "Press and hold the image above, then choose Save Image or Send to Chat. WeChat does not allow websites to copy PNG files directly.";
}

function copyTeamShareImage() {
  const button = document.querySelector("#team-share-copy");
  const status = document.querySelector("#team-share-status");
  if (/MicroMessenger/i.test(navigator.userAgent) || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    showTeamShareImageFallback();
    return;
  }
  button.disabled = true;
  teamShareCanvas.toBlob(async blob => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      button.classList.add("copied");
      button.textContent = "Copied!";
      status.textContent = "Copied to clipboard - your team image is ready to paste.";
      setTimeout(() => {
        button.classList.remove("copied");
        button.textContent = "Copy Image";
        button.disabled = false;
      }, 1600);
    } catch (error) {
      showTeamShareImageFallback();
    }
  }, "image/png");
}

function refreshBattlePicker() {
  if (!activeBattlePicker) return;
  const faction = document.querySelector("#battle-picker-faction").value;
  const search = document.querySelector("#battle-picker-search").value;
  if (activeBattlePicker.context === "builder") {
    battlePickerResults.innerHTML = builderPickerResultsMarkup(activeBattlePicker.stage, activeBattlePicker.role, activeBattlePicker.slot, faction, search);
  } else if (activeBattlePicker.context === "simulator") {
    battlePickerResults.innerHTML = simulatorPickerResultsMarkup(activeBattlePicker.side, activeBattlePicker.slot, faction, search);
  } else {
    battlePickerResults.innerHTML = pickerResultsMarkup(activeBattlePicker.side, activeBattlePicker.slot, activeBattlePicker.role, faction, search);
  }
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
  document.querySelector("#battle-simulator-view").hidden = view !== "simulator";
  document.querySelector("#team-builder-view").hidden = view !== "builder";
  document.querySelector("#carnival-view").hidden = view !== "carnival";
  document.querySelector("#potential-wheel-view").hidden = view !== "potential-wheel";
  document.querySelectorAll(".app-tab").forEach(tab => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  if (view === "simulator") renderBattleSimulatorSetup();
}

function simulatorSources() {
  return [
    { key: "cp-left", label: "CP Battle - Team A" },
    { key: "cp-right", label: "CP Battle - Team B" },
    ...state.builder.map((team, index) => ({ key: `builder-${index}`, label: `Team Building - ${team.name.trim() || `Team ${index + 1}`}` }))
  ];
}

function simulatorSourceTeam(key) {
  if (key === "cp-left" || key === "cp-right") {
    const side = key === "cp-left" ? "left" : "right";
    return {
      name: side === "left" ? "CP Battle - Team A" : "CP Battle - Team B",
      ids: [...state.battle[side].slots],
      assistants: [...state.battle[side].assistants]
    };
  }
  const index = Math.max(0, Math.min(2, Number(String(key).split("-")[1]) || 0));
  const team = state.builder[index];
  return {
    name: team.name.trim() || `Team ${index + 1}`,
    ids: [...team.slots, team.backup],
    assistants: ["", "", "", "", ""]
  };
}

function simulatorUnit(id) {
  return state.units.find(unit => String(unit.id) === String(id));
}

function simulatorUnitDisplayName(unit) {
  if (!unit) return "Unknown unit";
  const name = cleanText(unit.name || "Unknown unit");
  const title = cleanText(unit.title || "");
  if (!title || name.toLowerCase().includes(title.toLowerCase())) return name;
  return `${title} ${name}`;
}

function simulatorAssistantStats(id) {
  const stats = state.combatPower[String(id)]?.upgraded || {};
  return {
    atk: Math.round((Number(stats.atk) || 0) * 0.1),
    def: Math.round((Number(stats.def) || 0) * 0.1),
    hp: Math.round((Number(stats.hp) || 0) * 0.1)
  };
}

function simulatorStatsCp(stats) {
  return Math.round((Number(stats.atk) || 0) * 1.1 + (Number(stats.def) || 0) * 1.3 + (Number(stats.hp) || 0) * 0.07);
}

function simulatorTeamCp(source) {
  const main = source.ids.reduce((sum, id) => sum + maxCombatPower(id), 0);
  const assistant = battleSimulatorState.includeAssistants
    ? source.assistants.reduce((sum, id) => sum + simulatorStatsCp(simulatorAssistantStats(id)), 0)
    : 0;
  return { main, assistant, total: main + assistant };
}

function simulatorRosterMarkup(source) {
  return source.ids.map((id, index) => {
    const unit = simulatorUnit(id);
    const assistant = simulatorUnit(source.assistants[index]);
    if (!unit) return `<div class="simulator-unit empty"><span>${index === 4 ? "BACK-UP" : `SLOT ${index + 1}`}</span><strong>Empty</strong></div>`;
    return `<div class="simulator-unit">
      <span>${index === 4 ? "BACK-UP" : "ON FIELD"}</span>
      <img src="${escapeHtml(unit.image)}" alt="">
      <strong>${escapeHtml(unit.name)}</strong>
      <small>${escapeHtml(unit.title || unit.rarity)}</small>
      ${assistant && battleSimulatorState.includeAssistants ? `<em title="Assistant: ${escapeHtml(assistant.name)}"><img src="${escapeHtml(assistant.image)}" alt="">A</em>` : ""}
    </div>`;
  }).join("");
}

function populateBattleSimulatorSources() {
  const options = simulatorSources();
  const fill = (selector, value) => {
    const select = document.querySelector(selector);
    if (!select) return;
    select.innerHTML = options.map(option => `<option value="${option.key}">${escapeHtml(option.label)}</option>`).join("");
    select.value = options.some(option => option.key === value) ? value : options[0].key;
  };
  fill("#simulator-left-source", battleSimulatorState.leftSource);
  fill("#simulator-right-source", battleSimulatorState.rightSource);
}

function renderBattleSimulatorSetup() {
  if (!document.querySelector("#battle-simulator-view")) return;
  populateBattleSimulatorSources();
  const left = simulatorSourceTeam(battleSimulatorState.leftSource);
  const right = simulatorSourceTeam(battleSimulatorState.rightSource);
  const leftCp = simulatorTeamCp(left);
  const rightCp = simulatorTeamCp(right);
  document.querySelector("#simulator-left-preview").innerHTML = simulatorRosterMarkup(left);
  document.querySelector("#simulator-right-preview").innerHTML = simulatorRosterMarkup(right);
  document.querySelector("#simulator-left-cp").textContent = `${formatNumber(leftCp.total)} CP`;
  document.querySelector("#simulator-right-cp").textContent = `${formatNumber(rightCp.total)} CP`;
  document.querySelector(".simulator-team-panel.team-a").classList.toggle("first", leftCp.total > rightCp.total);
  document.querySelector(".simulator-team-panel.team-b").classList.toggle("first", rightCp.total > leftCp.total);
}

function simulatorPercentValues(values = []) {
  return values.flatMap(value => [...String(value).matchAll(/([0-9]+(?:\.[0-9]+)?)%/g)].map(match => Number(match[1]) / 100));
}

const SIMULATOR_AUTO_AI_RULES = [
  { key: "skill_1127_first", tag: "skill_1127", label: "Dedicated Hide override", order: "FIRST", target: "lowest-ratio", reason: "Hide's unit-specific rule is first in the player Auto priority table." },
  { key: "1025_s3_first", tag: "1025_s3", label: "Uta Lv.3 setup", order: "FIRST", target: "lowest-hp", reason: "Uta's Level 3 card has a dedicated early setup rule." },
  { key: "sup_s3_first", tag: "sup_s3", label: "Level 3 support", order: "FIRST", target: "lowest-ratio", reason: "Level 3 support cards are placed before generic attacks." },
  { key: "1076_s3_first", tag: "1076_s3", label: "Toka Lv.3 sequence", order: "FIRST", target: "lowest-ratio", reason: "This Toka card has unit-specific first/last sequencing." },
  { key: "pose_lv3_less50", tag: "pose_lv3", when: "under50", label: "Lv.3 finisher", order: "FIRST", target: "under50", reason: "An enemy is below 50% HP, activating the high-priority finisher rule." },
  { key: "pose_lv3_hpmin", tag: "pose_lv3", label: "Lv.3 focused attack", order: "FIRST", target: "lowest-hp", reason: "The Lv.3 pose rule focuses the enemy with the lowest current HP." },
  { key: "sup_s2_first", tag: "sup_s2", label: "Level 2 support", order: "FIRST", target: "lowest-ratio", reason: "Level 2 support is prioritized ahead of generic damage cards." },
  { key: "sup_s1_first", tag: "sup_s1", label: "Level 1 support", order: "FIRST", target: "lowest-ratio", reason: "This support card carries a dedicated first-position rule." },
  { key: "skill_attack_t0_s3_free", tag: "attack_t0_s3", label: "Priority attack Lv.3", order: "FLEX", target: "lowest-hp", reason: "The attack_t0_s3 tag appears before the generic Level 3 rules." },
  { key: "skill_lv3_less50", tag: "skill_lv3", when: "under50", label: "Level 3 execute", order: "FLEX", target: "under50", reason: "A Level 3 skill is available while an enemy is below 50% HP." },
  { key: "skill_lv3_hpmin", tag: "skill_lv3", label: "Level 3 pressure", order: "FLEX", target: "lowest-hp", reason: "Generic Level 3 cards focus the lowest-current-HP enemy." },
  { key: "1025_s3_free", tag: "1025_s3", label: "Uta Lv.3 follow-up", order: "FLEX", target: "lowest-hp", reason: "Uta's Level 3 card remains preferred even when first position is unavailable." },
  { key: "1025_s2_first", tag: "1025_s2", label: "Uta Lv.2 setup", order: "FIRST", target: "lowest-hp", reason: "Uta's Level 2 card has dedicated first-position priority." },
  { key: "skill_attack_t0_s2_free", tag: "attack_t0_s2", label: "Priority attack Lv.2", order: "FLEX", target: "lowest-hp", reason: "The attack_t0_s2 tag outranks generic free cards." },
  { key: "1076_s2_first", tag: "1076_s2", label: "Toka Lv.2 sequence", order: "FIRST", target: "lowest-ratio", reason: "This Toka card follows a unit-specific position rule." },
  { key: "pose_lv2_less50", tag: "pose_lv2", when: "under50", label: "Lv.2 finisher", order: "FIRST", target: "under50", reason: "The Lv.2 pose card is promoted against an enemy below 50% HP." },
  { key: "pose_lv2_hpmin", tag: "pose_lv2", label: "Lv.2 focused attack", order: "FIRST", target: "lowest-hp", reason: "The pose rule targets the enemy with the lowest current HP." },
  { key: "1025_s1_first", tag: "1025_s1", label: "Uta Lv.1 setup", order: "FIRST", target: "lowest-hp", reason: "Even Uta's Level 1 card has a dedicated setup rule." },
  { key: "buffskill_first", tag: "buffskill", label: "Buff setup", order: "FIRST", target: "battle-max", reason: "Buff skills are deliberately used before generic attacks." },
  { key: "1076_s1_first", tag: "1076_s1", label: "Toka Lv.1 sequence", order: "FIRST", target: "lowest-ratio", reason: "This card has a unit-specific sequencing rule." },
  { key: "attack_increase_first", tag: "attack_increase", when: "buffed", label: "Buff-enabled attack", order: "FIRST", target: "under50", reason: "The attacker has a positive effect, enabling the attack-increase rule." },
  { key: "Weak_advantage", tag: "attack_weak", label: "Weak-point attack", order: "LAST", target: "battle-max", reason: "Weak attacks are held for the last command and aimed at a priority enemy." },
  { key: "free_less50", tag: "free", when: "under50", label: "Free-card finisher", order: "FLEX", target: "under50", reason: "A generic card is promoted because an enemy is below 50% HP." },
  { key: "free", tag: "free", label: "Generic free card", order: "FLEX", target: "lowest-hp", reason: "No higher dedicated rule matched, so Auto uses the generic lowest-HP rule." },
  { key: "sup_free", tag: "sup_free", label: "Generic support card", order: "FLEX", target: "lowest-ratio", reason: "The support card falls back to its unrestricted Auto rule." }
];

function simulatorActiveCards(unit) {
  return uniqueSkills(unit?.details?.skills || [])
    .filter(skill => Number(skill.type) === 1 && Number(skill.level) >= 1 && Number(skill.level) <= 3)
    .map(skill => ({
      level: Number(skill.level),
      name: cleanText(skill.name_translated || `Active Skill - Level ${skill.level}`),
      tags: Array.isArray(skill.ai_type) ? skill.ai_type.map(String) : []
    }))
    .sort((a, b) => a.level - b.level);
}

function simulatorAutoContext(attacker, enemies) {
  const living = enemies ? simulatorLiving(enemies) : [];
  return {
    under50: living.some(target => target.hp / Math.max(1, target.maxHp) < 0.5),
    buffed: Boolean(attacker && attacker.shield > 0)
  };
}

function simulatorAutoRule(card, context = {}) {
  const tags = new Set(card?.tags || []);
  const rule = SIMULATOR_AUTO_AI_RULES.find(item => {
    if (!tags.has(item.tag)) return false;
    if (item.when === "under50" && !context.under50) return false;
    if (item.when === "buffed" && !context.buffed) return false;
    return true;
  });
  return rule || {
    key: "skill_choose_default",
    label: "Default hand-order choice",
    order: "FLEX",
    target: "lowest-ratio",
    reason: "No player-Auto tag matched, so the encrypted runtime default/tie-break path is used."
  };
}

function simulatorOpeningPrediction(unit) {
  const cards = simulatorActiveCards(unit);
  if (!cards.length) return null;
  const ranked = cards.map(card => ({ card, rule: simulatorAutoRule(card, { under50: false, buffed: false }) }))
    .map(item => ({ ...item, priority: SIMULATOR_AUTO_AI_RULES.findIndex(rule => rule.key === item.rule.key) }))
    .map(item => ({ ...item, priority: item.priority < 0 ? 999 : item.priority }))
    .sort((a, b) => a.priority - b.priority || b.card.level - a.card.level);
  const bestPriority = ranked[0].priority;
  const tied = ranked.filter(item => item.priority === bestPriority);
  return {
    ...ranked[0],
    levelLabel: tied.length > 1 ? tied.map(item => `Lv.${item.card.level}`).join(" / ") : `Lv.${ranked[0].card.level}`,
    confidence: tied.length > 1 || bestPriority === 999 ? "TIE-BREAK" : "HIGH"
  };
}

function simulatorAiPredictionRows(side) {
  const entries = battleSimulatorState.teams[side].slots
    .map((id, index) => ({ id, index }))
    .filter(entry => entry.id);
  if (!entries.length) return `<p class="simulator-ai-empty">Select units to reveal their opening Auto priorities.</p>`;
  return entries.map(({ id, index }) => {
    const unit = simulatorUnit(id);
    const prediction = simulatorOpeningPrediction(unit);
    if (!unit || !prediction) return "";
    return `<article class="simulator-ai-row">
      <img src="${escapeHtml(unit.image)}" alt="">
      <div class="simulator-ai-unit"><strong>${escapeHtml(simulatorUnitDisplayName(unit))}</strong><span>${index === 4 ? "Backup · inherits open ATK priority" : `ATK Priority #${index + 1} · ${escapeHtml(prediction.levelLabel)} predicted`}</span></div>
      <div class="simulator-ai-rule"><b>${escapeHtml(prediction.rule.label)}</b><span>${escapeHtml(prediction.rule.key)} · ${escapeHtml(prediction.rule.order)}</span></div>
      <em class="${prediction.confidence === "HIGH" ? "high" : "tie"}">${prediction.confidence}</em>
    </article>`;
  }).join("");
}

function renderSimulatorAiPredictor() {
  const container = document.querySelector("#simulator-ai-prediction");
  if (!container) return;
  container.innerHTML = `
    <section class="ally"><header><strong>MY TEAM</strong><span>Opening card priority</span></header>${simulatorAiPredictionRows("left")}</section>
    <section class="enemy"><header><strong>ENEMY TEAM</strong><span>Opening card priority</span></header>${simulatorAiPredictionRows("right")}</section>`;
}

function simulatorAutoDecision(attacker, enemies, random) {
  const cards = simulatorActiveCards(attacker.unit);
  if (!cards.length) return { level: simulatorCardLevel(random), rule: simulatorAutoRule(null), card: null, tied: false };
  const available = [cards[Math.floor(random() * cards.length)]];
  if (cards.length > 1 && random() < 0.72) available.push(cards[Math.floor(random() * cards.length)]);
  const context = simulatorAutoContext(attacker, enemies);
  const ranked = available.map((card, handIndex) => {
    const rule = simulatorAutoRule(card, context);
    const index = SIMULATOR_AUTO_AI_RULES.findIndex(item => item.key === rule.key);
    return { card, rule, handIndex, priority: index < 0 ? 999 : index };
  }).sort((a, b) => a.priority - b.priority || a.handIndex - b.handIndex);
  return { level: ranked[0].card.level, card: ranked[0].card, rule: ranked[0].rule, tied: ranked.length > 1 && ranked[0].priority === ranked[1].priority };
}

function simulatorAiTarget(team, decision, random) {
  const living = simulatorLiving(team);
  if (!living.length) return null;
  const ratio = target => target.hp / Math.max(1, target.maxHp);
  if (decision.rule.target === "under50") {
    const vulnerable = living.filter(target => ratio(target) < 0.5);
    if (vulnerable.length) return [...vulnerable].sort((a, b) => ratio(a) - ratio(b))[0];
  }
  if (decision.rule.target === "lowest-hp") return [...living].sort((a, b) => a.hp - b.hp)[0];
  if (decision.rule.target === "battle-max") return [...living].sort((a, b) => maxCombatPower(b.id) - maxCombatPower(a.id))[0];
  if (decision.rule.target === "lowest-ratio") return [...living].sort((a, b) => ratio(a) - ratio(b))[0];
  return simulatorTarget(team, random);
}

function simulatorSkillProfile(unit, includeTalents = false) {
  const details = unit.details || {};
  const skills = uniqueSkills(details.skills || []);
  const active = skills.filter(skill => Number(skill.type) === 1);
  const levels = [1, 2, 3].map((level, index) => {
    const skill = active.find(item => Number(item.level) === level);
    const factors = simulatorPercentValues([...(skill?.factor_lv1 || []), ...(skill?.factor_lv2 || [])]);
    return Math.max(0.7, ...factors, [1.2, 1.7, 2.5][index]);
  });
  const activeText = active.map(skill => [skill.desc_short_translated, skill.max_desc_short_translated, skill.entry_desc_translated].filter(Boolean).join(" ")).join(" ").toLowerCase();
  const naturalPassives = details.hero?.passive_skill_gift_n?.length ? details.hero.passive_skill_gift_n : details.hero?.passive_skill || [];
  const passiveIds = new Set([...naturalPassives, String(details.hero?.rank_p_skill || "")].filter(Boolean));
  const passiveSkills = skills.filter(skill => passiveIds.has(String(skill.id)));
  const passiveText = passiveSkills.map(skill => [skill.desc_short_translated, skill.max_desc_short_translated, skill.entry_desc_translated].filter(Boolean).join(" ")).join(" ").toLowerCase();
  const backupPassiveEntries = skills.map(skill => ({
    skill,
    text: [skill.desc_short_translated, skill.max_desc_short_translated, skill.entry_desc_translated].filter(Boolean).join(" ").toLowerCase()
  })).filter(entry => /effective also in back-?up state|also effective (?:while )?in back-?up/.test(entry.text))
    .filter(entry => !/\bin (?:pve|conquest battle|force challenge|region breakthrough|blockade breakthrough)\b/.test(entry.text));
  const backupText = backupPassiveEntries.map(entry => entry.text).join(" ");
  const maxBackupPercent = patterns => patterns.reduce((maximum, pattern) => {
    const matches = [...backupText.matchAll(pattern)].map(match => Number(match[1]) / 100).filter(Number.isFinite);
    return Math.max(maximum, ...matches, 0);
  }, 0);
  const backupBasic = maxBackupPercent([/(?:basic stats|all stats)[^.]{0,55}?(?:by|increase by) ([0-9.]+)%/g, /(?:basic stats|all stats) increase by ([0-9.]+)%/g]);
  const backupBoosts = {
    atk: Math.max(backupBasic, maxBackupPercent([/atk(?:-related stats)?[^.]{0,55}?(?:by|increase by) ([0-9.]+)%/g, /atk(?:-related stats)? increase by ([0-9.]+)%/g])),
    def: Math.max(backupBasic, maxBackupPercent([/def(?:-related stats)?[^.]{0,55}?(?:by|increase by) ([0-9.]+)%/g, /def(?:-related stats)? increase by ([0-9.]+)%/g])),
    hp: Math.max(backupBasic, maxBackupPercent([/(?:max hp|hp-related stats|\bhp\b)[^.]{0,55}?(?:by|increase by) ([0-9.]+)%/g, /(?:max hp|hp-related stats|\bhp\b) increase by ([0-9.]+)%/g])),
    damage: maxBackupPercent([/damage dealt[^.]{0,45}?(?:by|increase by) ([0-9.]+)%/g, /damage dealt increase by ([0-9.]+)%/g]),
    reduction: maxBackupPercent([/(?:reduce|reduces|reducing)[^.]{0,70}?damage taken[^.]{0,30}?by ([0-9.]+)%/g])
  };
  const backupRequirement = backupText.includes("ccg") ? "CCG" : backupText.includes("anteiku") ? "Anteiku" : /no organization|no org/.test(backupText) ? "No Org" : "";
  const backupPassiveLabel = cleanText(backupPassiveEntries[0]?.skill?.name_translated || "Backup-effective passive");
  const passiveLabel = cleanText(passiveSkills[0]?.name_translated || "team passive");
  const allText = `${activeText} ${passiveText}`;
  const firstPercent = (pattern, fallback = 0) => {
    const match = allText.match(pattern);
    return match ? Number(match[1]) / 100 : fallback;
  };
  const teamMatch = passiveText.match(/increases basic stats of all allied ([^.]+?) (?:characters )?by ([0-9.]+)%/);
  const selfPerMatch = passiveText.match(/for each ([^.]+?) character on the field, increases self(?:'s)? stats by ([0-9.]+)%/);
  const pursuitMatch = activeText.match(/pursuit attack[^.]*?dealing ([0-9.]+)% atk/);
  const healMatch = activeText.match(/(?:heal|restore)[^.]*?([0-9.]+)% (?:of )?(?:self's |the target's )?max hp/);
  const shieldMatch = activeText.match(/shield equal to ([0-9.]+)% (?:of )?(?:self's |the target's )?max hp/);
  const reductionMatch = activeText.match(/(?:reduces?|decreases?) (?:the )?damage (?:taken|received)[^.]*?by ([0-9.]+)%/);
  const recognized = [
    /all allied/.test(passiveText), /for each .* character/.test(passiveText), Boolean(pursuitMatch), Boolean(healMatch), Boolean(shieldMatch),
    Boolean(reductionMatch), /ignores? def/.test(allText), /doubles crit rate/.test(allText), /all enemies/.test(activeText),
    /stun|dizzy|immobil|silence|unable to act/.test(allText), /unable to trigger all healing|healing effect/.test(allText)
  ].filter(Boolean).length;
  return {
    levels,
    aoe: /all enemies|all enemy/.test(activeText),
    cards: [1, 2, 3].map(level => simulatorActiveSkillSpec(unit, level)),
    passiveRules: simulatorCompilePassiveRules(unit, includeTalents),
    ignoreDef: /ignores? def/.test(activeText),
    doubleCrit: /doubles crit rate/.test(activeText),
    pursuit: pursuitMatch ? Number(pursuitMatch[1]) / 100 : 0,
    heal: healMatch ? Number(healMatch[1]) / 100 : 0,
    shield: shieldMatch ? Number(shieldMatch[1]) / 100 : 0,
    reduction: reductionMatch ? Math.min(0.4, Number(reductionMatch[1]) / 100) : 0,
    damageAmp: Math.min(0.3, (() => { const match = activeText.match(/takes ([0-9.]+)% more damage/); return match ? Number(match[1]) / 100 : 0; })()),
    outgoingAmp: 0,
    control: /stun|dizzy|immobil|silence|unable to act/.test(allText) ? 1 : 0,
    healBlock: /unable to trigger all healing|cannot be healed|healing effect/.test(allText),
    teamStat: teamMatch ? Number(teamMatch[2]) / 100 : 0,
    teamRequirement: teamMatch ? teamMatch[1] : "",
    selfPerAlly: selfPerMatch ? Number(selfPerMatch[2]) / 100 : 0,
    selfRequirement: selfPerMatch ? selfPerMatch[1] : "",
    recognized: recognized + (backupPassiveEntries.length ? 1 : 0),
    passiveCount: passiveSkills.length,
    effectiveInBackup: backupPassiveEntries.length > 0,
    backupBoosts,
    backupRequirement,
    backupPassiveLabel,
    passiveLabel
  };
}

function simulatorSkillFullText(skill) {
  const parts = [...new Set([
    skill?.desc_short_translated,
    skill?.max_desc_short_translated,
    skill?.entry_desc_translated,
    skill?.r_max_entry_desc_translated
  ].filter(Boolean).map(value => cleanText(value)))];
  return cleanText(parts.join(" "));
}

function simulatorPercentMatch(text, patterns, fallback = 0) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]) / 100;
  }
  return fallback;
}

function simulatorActiveSkillSpec(unit, level) {
  const skill = uniqueSkills(unit?.details?.skills || []).find(item => Number(item.type) === 1 && Number(item.level) === Number(level));
  const text = simulatorSkillFullText(skill).toLowerCase();
  const factors = simulatorPercentValues([...(skill?.factor_lv1 || []), ...(skill?.factor_lv2 || [])]);
  const baseFactor = Math.max([1.2, 1.7, 2.5][level - 1] || 1.2, ...factors, 0);
  const extraAtk = simulatorPercentMatch(text, [
    /additional damage equal to (?:your|its|self(?:'s)?) initial attack power ([0-9.]+)%/,
    /additional damage equal to ([0-9.]+)% of (?:your|its|self(?:'s)?) initial attack power/
  ]);
  return {
    level,
    id: String(skill?.id || `${unit?.id || "unit"}_s${level}`),
    name: cleanText(skill?.name_translated || `Active Skill - Level ${level}`),
    text,
    factor: baseFactor,
    energy: Number(skill?.energy) || 5,
    extraAtk,
    aoe: /all enemies|all enemy characters|each enemy/.test(text),
    ignoreDef: /ignores? (?:the target(?:'s)? )?def|ignore def/.test(text),
    ignoreReduction: /ignores? (?:the )?damage reduction/.test(text),
    doubleCrit: /doubles? crit rate/.test(text),
    heal: simulatorPercentMatch(text, [/(?:heal|restore)[^.]*?([0-9.]+)% (?:of )?(?:self(?:'s)? |the target(?:'s)? )?max hp/]),
    healLost: simulatorPercentMatch(text, [/(?:heal|restore)[^.]*?([0-9.]+)% (?:of )?(?:the )?lost hp/]),
    shield: simulatorPercentMatch(text, [/shield equal to ([0-9.]+)% (?:of )?(?:self(?:'s)? |the target(?:'s)? )?max hp/]),
    control: /stun|dizzy|immobil|silence|unable to act/.test(text),
    weak: /inflicts? weak|appl(?:y|ies) weak|causes? weak/.test(text),
    healBlock: /unable to trigger (?:all )?healing|cannot be healed|restoration-hindering/.test(text)
  };
}

function simulatorSelectedPassiveSkills(unit) {
  const details = unit?.details || {};
  const hero = details.hero || {};
  const ids = [...new Set([
    ...(hero.passive_skill_gift_n?.length ? hero.passive_skill_gift_n : hero.passive_skill || []),
    hero.rank_p_skill
  ].filter(Boolean).map(String))];
  const byId = new Map(uniqueSkills(details.skills || []).map(skill => [String(skill.id), skill]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

function simulatorSelectedOrbSkills(unit) {
  const audited = state.battleEffectAudit.get(String(unit?.id));
  return (audited?.orbs || []).map(orb => ({
    id: String(orb.id),
    name_translated: orb.name,
    desc_short_translated: orb.text,
    max_desc_short_translated: orb.text,
    effects: orb.roots || [],
    factor_lv1: orb.factors || [],
    __sourceType: "orb",
    __audit: orb
  }));
}

function simulatorSelectedTalentSkills(unit) {
  const details = unit?.details || {};
  let tiers = {};
  try { tiers = JSON.parse(details.hero?.skill_up_effect || "{}"); } catch { tiers = {}; }
  const ids = [...new Set(Object.values(tiers).flat().filter(Boolean).map(String))];
  const byId = new Map(uniqueSkills(details.skills || []).map(skill => [String(skill.id), skill]));
  const auditById = new Map((state.battleEffectAudit.get(String(unit?.id))?.talents || []).map(rule => [String(rule.id), rule]));
  return ids.map(id => byId.get(id)).filter(Boolean).map(skill => ({
    ...skill,
    __sourceType: "talent",
    __audit: auditById.get(String(skill.id)) || {}
  }));
}

function simulatorRuleTriggers(events, text) {
  const values = new Set();
  const exact = new Set(events || []);
  if (exact.has("round_start") || /turn starts|start of (?:our|your|the|each)(?: side's)? turn/.test(text)) values.add("turn-start");
  if (exact.has("round_end") || /turn ends|end of (?:our|your|the|each) turn/.test(text)) values.add("turn-end");
  if (["card_release_before", "release_before"].some(value => exact.has(value))) values.add("before-active");
  if (["card_release_after", "release_after"].some(value => exact.has(value)) || /when (?:you|self) use an active skill|after .*active skill/.test(text)) values.add("after-active");
  if (["hurt_before", "atk_before"].some(value => exact.has(value))) values.add("before-damage");
  if (["hurt_after", "atk_after"].some(value => exact.has(value)) || /when (?:you |self )?(?:deal|deals|cause|causes) damage/.test(text)) values.add("after-damage");
  if (["be_hurt_before", "be_hit_before"].some(value => exact.has(value))) values.add("before-hit");
  if (["be_hurt_after", "be_hit_after"].some(value => exact.has(value)) || /when (?:you |self )?(?:take|takes|receive|receives) damage|when attacked/.test(text)) values.add("after-hit");
  if (exact.has("death_before")) values.add("before-death");
  if (exact.has("death_after") || /when .* (?:dies|is defeated)|after defeating|when (?:you |self )?(?:defeat|defeats|kill|kills)/.test(text)) values.add("after-death");
  if (exact.has("lose_hp_after") || /hp (?:drops|falls|is lower|is below)|health .*lower than/.test(text)) values.add("hp-changed");
  if (exact.has("crit_after")) values.add("after-crit");
  if (exact.has("recover_hp_after")) values.add("after-heal");
  if (exact.has("make_weak_after")) values.add("after-weak");
  if (exact.has("beweak_after")) values.add("receive-weak");
  if (exact.has("burst_after") || /gaining power burst|after power burst/.test(text)) values.add("power-burst");
  if (["label_get_after", "label_apply_after"].some(value => exact.has(value))) values.add("status-gained");
  if (exact.has("label_lose_after")) values.add("status-lost");
  if (/when (?:the )?battle (?:begins|starts)|at the (?:start|beginning) of (?:the )?battle|upon entering battle|in the first turn|during the first turn/.test(text)) {
    values.add("battle-start");
    values.delete("turn-start");
  }
  if (/gaining power burst|after power burst/.test(text) && !/active skill/.test(text)) {
    values.delete("before-active");
    values.delete("after-active");
  }
  if (/applying weak|inflicting weak|when causing weak/.test(text) && !/active skill/.test(text)) {
    values.delete("before-active");
    values.delete("after-active");
  }
  if (/when using active skills?/.test(text) && !/release active skills? of the same level/.test(text)) values.delete("after-active");
  if (/after (?:you|self) (?:use|uses|cast|casts|release|releases) an? active skill/.test(text)) values.delete("before-active");
  return [...values];
}

function simulatorFactionRequirement(text) {
  if (/allied ccg|other ccg|each ccg|ccg characters?/.test(text)) return "CCG";
  if (/allied anteiku|anteiku characters?/.test(text)) return "Anteiku";
  if (/aogiri tree|aogiri characters?/.test(text)) return "Aogiri";
  if (/no organization|no org/.test(text)) return "No Org";
  return "";
}

function simulatorCompilePassiveRules(unit, includeTalents = false) {
  const audited = state.battleEffectAudit.get(String(unit?.id));
  const auditById = new Map((audited?.passives || []).map(rule => [String(rule.id), rule]));
  const ruleSkills = [
    ...simulatorSelectedPassiveSkills(unit),
    ...simulatorSelectedOrbSkills(unit),
    ...(includeTalents ? simulatorSelectedTalentSkills(unit) : [])
  ];
  return ruleSkills.map(skill => {
    const passiveId = String(skill.id);
    const sourceType = skill.__sourceType || "passive";
    const audit = skill.__audit || auditById.get(String(skill.id)) || {};
    const originalText = simulatorSkillFullText(skill);
    const text = originalText.toLowerCase();
    const events = audit.events || [];
    const triggers = simulatorRuleTriggers(events, text);
    const basicStats = simulatorPercentMatch(text, [
      /basic stats (?:increase|increases|increased) by ([0-9.]+)%/,
      /increase(?:s)? (?:all allied characters(?:'|â€™) )?basic stats by ([0-9.]+)%/,
      /all ability values? (?:are )?increased by ([0-9.]+)%/
    ]);
    const perAllyMatch = text.match(/for each allied ([^.]+?) character[^.]*?(?:basic |all )?stats by ([0-9.]+)%[^.]*?(?:up to|maximum of) ([0-9.]+)%/);
    const directMatch = text.match(/(?:pursuit|retaliat|immediately (?:deal|deals|cause|causes)|launches?)[^.]*?(?:damage )?(?:equal to |dealing )?([0-9.]+)% (?:of )?atk/);
    const heal = simulatorPercentMatch(text, [/(?:heal|heals|restore|restores|restored)[^.]*?([0-9.]+)% (?:of )?(?:the |their |each allied (?:member(?:'s)? )?)?max hp/]);
    const healLost = simulatorPercentMatch(text, [/(?:heal|heals|restore|restores|restored)[^.]*?([0-9.]+)% (?:of )?(?:the |their |each allied (?:member(?:'s)? )?)?lost hp/]);
    const healAtk = simulatorPercentMatch(text, [/(?:heal|heals|recover|recovers|restore|restores)[^.]*?hp equal to ([0-9.]+)% of (?:your|self(?:'s)?|the caster(?:'s)?) atk/]);
    const healAtkFlashMultiplier = (() => {
      const match = text.match(/if you have flash[^.]*?(?:becomes|is) ([0-9.]+) times stronger/);
      return match ? Number(match[1]) : 1;
    })();
    const ignoreRestorationRate = /not affected by (?:the )?(?:regeneration|restoration) rate/.test(text);
    const shield = simulatorPercentMatch(text, [/(?:shield|shields)[^.]*?(?:equal to |for )?([0-9.]+)% (?:of )?(?:the |their |your |self(?:'s)? )?max hp/]);
    const damageUp = simulatorPercentMatch(text, [
      /(?:damage dealt|dmg dealt|damage caused by this active skill) (?:is |are )?(?:increase|increases|increased) by ([0-9.]+)%/,
      /(?:deal|deals|dealing) ([0-9.]+)% (?:more|increased) damage/,
      /(?:damage|dmg) by ([0-9.]+)%/
    ]);
    const parsedReduction = simulatorPercentMatch(text, [
      /(?:damage taken|damage received|skill damage received)[^.]*?(?:is |are )?(?:reduce|reduces|reduced) by ([0-9.]+)%/,
      /(?:take|takes) ([0-9.]+)% (?:less|reduced) damage/,
      /reduces? damage taken by ([0-9.]+)%/
    ]);
    const atkUp = simulatorPercentMatch(text, [/(?:atk-related stats|atk) (?:are |is )?(?:increase|increases|increased) by ([0-9.]+)%/, /(?:increase|increases) atk by ([0-9.]+)%/, /\+([0-9.]+)% atk(?:-related stats)?/]);
    const defUp = simulatorPercentMatch(text, [/(?:def-related stats|def) (?:are |is )?(?:increase|increases|increased) by ([0-9.]+)%/, /\+([0-9.]+)% def(?:-related stats)?/]);
    const hpUp = simulatorPercentMatch(text, [/(?:max hp|hp-related stats) (?:are |is )?(?:increase|increases|increased) by ([0-9.]+)%/, /increase(?:s)? (?:your )?max hp by ([0-9.]+)%/]);
    const critRate = simulatorPercentMatch(text, [/\+([0-9.]+)% crit rate/, /crit rate (?:is |are )?(?:increase|increases|increased) by ([0-9.]+)%/]);
    const critDamage = simulatorPercentMatch(text, [/\+([0-9.]+)% crit (?:damage|dmg)/, /crit (?:damage|dmg) (?:is |are )?(?:increase|increases|increased) by ([0-9.]+)%/, /increase(?:s)? (?:your )?crit (?:damage|dmg) by ([0-9.]+)%/]);
    const critDef = simulatorPercentMatch(text, [/crit def (?:of [^.]* )?(?:is |are )?(?:increase|increases|increased) by ([0-9.]+)%/]);
    const regeneration = simulatorPercentMatch(text, [/(?:regeneration|restoration) rate (?:is |are )?(?:increase|increases|increased) by ([0-9.]+)%/, /increase(?:s)? (?:your )?(?:regeneration|restoration) rate by ([0-9.]+)%/]);
    const activeReduction = /damage taken from active skills|active skill damage (?:taken|received)/.test(text) ? parsedReduction : 0;
    const reduction = activeReduction ? 0 : parsedReduction;
    const nextActiveDamage = /damage of your next active skill/.test(text) ? damageUp : 0;
    const atkDown = simulatorPercentMatch(text, [/(?:target(?:'s)?|enemies(?:'|â€™)?|enemy(?:'s)?) (?:atk-related stats|atk)[^.]*?(?:decrease|decreases|decreased|reduced) by ([0-9.]+)%/]);
    const defDown = simulatorPercentMatch(text, [/(?:target(?:'s)?|enemies(?:'|â€™)?|enemy(?:'s)?) (?:def-related stats|def)[^.]*?(?:decrease|decreases|decreased|reduced) by ([0-9.]+)%/]);
    const chanceMatch = text.match(/([0-9.]+)% chance/);
    const durationMatch = text.match(/for ([0-9]+) turns?/);
    const stackMatch = text.match(/stack(?:ing|s)? up to ([0-9]+) times?|up to ([0-9]+) stacks?/);
    const requiredStackMatch = text.match(/at ([0-9]+) (?:effect )?stacks?|when [^.]{0,35}reaches? ([0-9]+) stacks?/);
    const specialKind = passiveId === "1102_p1" ? "ccg-pursuit"
      : passiveId === "1169_p3" ? "all-unit-combo"
      : "";
    const forcedSameLevelAlly = specialKind === "ccg-pursuit"
      || /(?:make|causes?|allow)[^.]*?(?:release|use|cast) active skills? (?:of|at) the same level/.test(text);
    const forcedBattleStart = /(?:(?:when|at the start of) (?:the )?battle|at battle start)[\s\S]{0,240}?(?:immediately|then)[\s\S]{0,160}?(?:cast|casts|release|releases)[\s\S]{0,80}?active skill/.test(text);
    const forcedTurnStart = /when (?:your|our|the) turn starts?[^.]*?immediately cast an? active skill/.test(text);
    const forcedCounterActive = /takes? skill damage[^.]*?(?:randomly triggers?[^.]*?)?immediately cast a (?:level|lv\.?)[ ]?1 active skill to counterattack/.test(text);
    const forcedStackActive = /(?:reaches?|at) [0-9]+ stacks?[^.]*?(?:instantly|immediately) cast a (?:level|lv\.?)?[ ]?[0-9]+ active skill/.test(text)
      || /reaches? [0-9]+ stacks?[^.]*?then instantly cast a (?:level|lv\.?)?[ ]?[0-9]+ active skill/.test(text);
    const forcedHpActive = /health drops below [^.]*?immediately release your [^.]*?active skills?/.test(text);
    const forcedActive = forcedSameLevelAlly || forcedBattleStart || forcedTurnStart || forcedCounterActive || forcedStackActive || forcedHpActive;
    const forcedLevelMatch = text.match(/(?:cast|release)(?:s)? (?:your )?(?:a |an )?(?:level|lv\.?)\s*([123]) active skill|cast(?:s)? your lv\.\s*([123]) active skill/);
    const forcedActiveMode = forcedSameLevelAlly ? "ally-highest-atk"
      : forcedCounterActive ? "damaged-ally"
      : forcedStackActive ? "event-ally"
      : forcedHpActive ? "self-hp-threshold"
      : forcedBattleStart || forcedTurnStart ? "self"
      : "";
    const forcedEvents = forcedSameLevelAlly ? ["after-active"]
      : forcedBattleStart ? ["battle-start"]
      : forcedTurnStart ? ["turn-start"]
      : forcedCounterActive ? ["after-hit"]
      : forcedStackActive ? ["after-active", "after-hit"]
      : forcedHpActive ? ["hp-changed"]
      : [];
    const cleanseDebuffs = /remove [0-9]+ debuffs?|remove all (?:debuffs|negative|restoration-hindering)|clear(?:s|ed)? (?:your|all|the)? ?(?:weak|debuff|negative)/.test(text);
    const cleanseBuffs = /removes? (?:all |[0-9]+ )?buffs?/.test(text) && /enemy/.test(text);
    const skillLevel = /increase(?:s|d)? (?:the )?skill level|skill levels? (?:are )?increased/.test(text) ? 1 : /reduces? (?:the target(?:'s)? )?skill levels?/.test(text) ? -1 : 0;
    const weak = /(?:apply|applies|inflict|inflicts|cause|causes) weak/.test(text);
    const control = /stun|dizzy|immobil|silence|unable to act|fear/.test(text);
    const healBlock = /unable to trigger (?:all )?healing|cannot be healed|restoration-hindering/.test(text);
    const capMatch = text.match(/(?:damage (?:you )?take|damage (?:you )?receive|damage received|damage you take from a single skill hit|single damage you receive)[^.]*?(?:cannot|does not|doesn't) exceed ([0-9.]+)% of (?:your|the|self(?:'s)?)? ?max hp/);
    const capConditional = capMatch ? /(?:when|while|if)[^.]{0,180}(?:single skill hit|single skill|single damage|damage (?:you )?(?:take|receive))/.test(text.slice(Math.max(0, capMatch.index - 190), capMatch.index + capMatch[0].length)) : false;
    const singleHitCap = capMatch && !capConditional ? Number(capMatch[1]) / 100 : 0;
    const immunityMatch = /immune to all basic stat reduction effects|basic stats cannot be reduced|none of your stats can be reduced below base values/.test(text);
    const immunityConditional = immunityMatch && /(?:when|while|if)[^.]{0,180}(?:immune to all basic stat reduction|stats can(?:not|'t) be reduced)/.test(text);
    const basicStatReductionImmune = immunityMatch && !immunityConditional;
    const persistentTalent = sourceType === "talent" && (!triggers.length || triggers.every(trigger => trigger === "persistent" || trigger === "always"));
    const explicitAura = /while (?:you|self|this character) (?:are|is) on the field|for each allied|all allied characters? (?:gain|gains)|increases? (?:the )?basic stats of all allied/.test(text);
    const staticAura = (explicitAura || persistentTalent)
      && Boolean(basicStats || perAllyMatch || atkUp || defUp || hpUp || damageUp || reduction || critRate || critDamage || critDef || regeneration || activeReduction);
    const supported = [basicStats, perAllyMatch, directMatch, heal, healLost, healAtk, shield, damageUp, reduction, atkUp, defUp, hpUp, critRate, critDamage, critDef, regeneration, activeReduction, nextActiveDamage, atkDown, defDown, forcedActive, cleanseDebuffs, cleanseBuffs, skillLevel, weak, control, healBlock, singleHitCap, basicStatReductionImmune, specialKind].filter(Boolean).length;
    const eventSupported = triggers.some(trigger => ["battle-start", "turn-start", "turn-end", "before-active", "after-active", "before-damage", "after-damage", "before-hit", "after-hit", "after-death", "hp-changed", "after-crit", "after-heal", "after-weak", "receive-weak", "power-burst", "status-gained", "status-lost"].includes(trigger));
    const complexOperators = new Set(["LocalVar", "GlobalVar", "RandamVar", "CountFlag", "EnergyCardDel", "ChangeCardUseMin", "FilterSkillCardHigh", "SkillLvSpecify", "Pose", "EndPose", "Copy", "SkillSub"]);
    const complexRuntime = (audit.operators || []).some(operator => complexOperators.has(operator))
      || /when (?:this|the) effect (?:ends|expires)|consume all .*cards?|special skill|sure-kill|named status/.test(text);
    return {
      id: passiveId, name: cleanText(skill.name_translated || skill.id), text: originalText, normalizedText: text, specialKind, sourceType,
      triggers, apkEvents: events, operators: audit.operators || [], cardOnly: events.includes("card_release_after") || events.includes("card_release_before"),
      backupEffective: /effective also in back-?up state|also effective (?:while )?in back-?up/.test(text),
      staticAura, faction: simulatorFactionRequirement(text), basicStats,
      perAlly: perAllyMatch ? Number(perAllyMatch[2]) / 100 : 0,
      perAllyCap: perAllyMatch ? Number(perAllyMatch[3]) / 100 : 0,
      directDamage: directMatch ? Number(directMatch[1]) / 100 : 0,
      directAoe: /all enemies|all enemy characters/.test(text), heal, healLost, healAtk, healAtkFlashMultiplier, ignoreRestorationRate, shield, damageUp, reduction, atkUp, defUp, hpUp, critRate, critDamage, critDef, regeneration, activeReduction, nextActiveDamage, atkDown, defDown,
      forcedActive, forcedActiveMode, forcedEvents,
      forcedActiveLevel: Number(forcedLevelMatch?.[1] || forcedLevelMatch?.[2] || 0),
      forcedTargetLowestHp: /enemy with the lowest hp percentage/.test(text),
      forcedRandomOption: forcedCounterActive,
      forcedDamageUp: forcedActive ? simulatorPercentMatch(text, [
        /increase(?:s|d)? (?:the )?damage caused by this active skill (?:by )?([0-9.]+)%/,
        /damage caused by this active skill ([0-9.]+)%/,
        /damage caused by this active skill (?:is )?increased by ([0-9.]+)%/
      ]) : 0,
      modeRestricted: /\bin (?:stronghold clash|stronghold takeover|blockade breakthrough|conquest battle|force challenge|region breakthrough)\b/.test(text),
      cleanseDebuffs, cleanseBuffs, skillLevel, weak, control, healBlock, singleHitCap, basicStatReductionImmune,
      chance: chanceMatch ? Number(chanceMatch[1]) / 100 : 1,
      duration: durationMatch ? Number(durationMatch[1]) : 1,
      permanent: sourceType === "talent" && !durationMatch && triggers.includes("battle-start"),
      maxStacks: stackMatch ? Number(stackMatch[1] || stackMatch[2]) : 1,
      requiredStacks: forcedStackActive && requiredStackMatch ? Number(requiredStackMatch[1] || requiredStackMatch[2]) : forcedActive ? 0 : requiredStackMatch ? Number(requiredStackMatch[1] || requiredStackMatch[2]) : 0,
      oncePerTurn: /once per turn|trigger(?:s|ed)? once (?:per|each) turn/.test(text),
      minLevel: /lv\.?2 or above|level 2 or above/.test(text) ? 2 : /lv\.?3|level 3/.test(text) ? 3 : 1,
      hpBelow: (() => { const match = text.match(/(?:hp|health)[^.]{0,35}(?:below|lower than) ([0-9.]+)%/); return match ? Number(match[1]) / 100 : 0; })(),
      hpAbove: (() => { const match = text.match(/(?:hp|health)[^.]{0,35}(?:above|higher than) ([0-9.]+)%/); return match ? Number(match[1]) / 100 : 0; })(),
      coverage: supported && (eventSupported || staticAura || triggers.includes("battle-start") || singleHitCap || basicStatReductionImmune) && (!complexRuntime || forcedActive || singleHitCap || basicStatReductionImmune) ? "modeled" : supported ? "partial" : "unmodeled",
      supportedFamilies: supported
    };
  });
}

function simulatorRequirementMatches(unit, requirement) {
  const value = String(requirement || "").toLowerCase();
  if (!value) return true;
  if (value.includes("ccg")) return unit.faction === "CCG";
  if (value.includes("anteiku")) return unit.faction === "Anteiku";
  if (value.includes("aogiri")) return (unit.factions || []).map(Number).includes(4);
  if (value.includes("no org") || value.includes("no organization")) return unit.faction === "No Org";
  return true;
}

function simulatorStatusValue(member, key) {
  return (member.statuses || []).reduce((sum, status) => sum + (Number(status[key]) || 0) * (Number(status.stacks) || 1), 0);
}

function simulatorEffectiveAtk(member) {
  const hpRatio = member.hp / Math.max(1, simulatorEffectiveMaxHp(member));
  const conditionalTalentAtk = (member.profile?.passiveRules || []).reduce((sum, rule) => {
    if (rule.sourceType !== "talent" || !rule.atkUp || !rule.hpAbove || hpRatio <= rule.hpAbove) return sum;
    return sum + rule.atkUp;
  }, 0);
  return Math.max(1, member.atk * (1 + simulatorStatusValue(member, "atk") + conditionalTalentAtk));
}

function simulatorEffectiveDef(member) {
  return Math.max(0, member.def * (1 + simulatorStatusValue(member, "def")));
}

function simulatorEffectiveMaxHp(member) {
  return Math.max(1, member.maxHp * (1 + simulatorStatusValue(member, "hp")));
}

function simulatorAttributeCode(member) {
  return String(member?.unit?.details?.roleModels?.[0]?.rc_type || "");
}

function simulatorAttributeRelation(attacker, defender) {
  const attackType = simulatorAttributeCode(attacker);
  const defendType = simulatorAttributeCode(defender);
  if (!attackType || !defendType || attackType === defendType) return 0;
  const restricts = {
    T0: new Set(["T1"]),
    T1: new Set(["T2"]),
    T2: new Set(["T0"]),
    T3: new Set(["T4"]),
    T4: new Set(["T3"]),
    T5: new Set(["T0", "T1", "T2", "T3", "T4"])
  };
  if (restricts[attackType]?.has(defendType)) return 1;
  if (restricts[defendType]?.has(attackType)) return -1;
  return 0;
}

function simulatorAddStatus(member, status) {
  if (!member || !member.alive) return null;
  member.statuses ||= [];
  const key = String(status.key || `${status.sourceId || "effect"}:${status.kind || "status"}`);
  const existing = member.statuses.find(item => item.key === key);
  if (existing) {
    existing.stacks = Math.min(Number(status.maxStacks) || 1, (existing.stacks || 1) + 1);
    existing.turns = Math.max(existing.turns || 1, Number(status.turns) || 1);
    return existing;
  }
  const created = { stacks: 1, turns: 1, maxStacks: 1, isDebuff: false, isBuff: true, ...status, key };
  member.statuses.push(created);
  return created;
}

function simulatorTickStatuses(team) {
  team.all.forEach(member => {
    member.statuses = (member.statuses || []).filter(status => {
      if (status.permanent) return true;
      status.turns = Math.max(0, Number(status.turns || 1) - 1);
      return status.turns > 0;
    });
    member.weak = Math.max(0, Number(member.weak || 0) - 1);
    member.healBlocked = Math.max(0, Number(member.healBlocked || 0) - 1);
  });
}

function simulatorRuleProviderAvailable(provider, team, rule) {
  if (!provider?.alive) return false;
  if (rule.modeRestricted) return false;
  if (team.active.includes(provider)) return true;
  return team.bench.includes(provider) && rule.backupEffective;
}

function simulatorRuleActorMatches(rule, eventName, provider, team, context) {
  const text = rule.normalizedText;
  const actor = context.actor;
  const target = context.target;
  if ((["before-active", "after-active"].includes(eventName) && rule.cardOnly && !context.sourceIsCard)
    || (context.triggerDepth || 0) > 3) return false;
  if (rule.minLevel > 1 && Number(context.level || 1) < rule.minLevel) return false;
  if (rule.hpBelow) {
    const subject = /our character|allied character|an ally/.test(text) ? (target || actor || provider) : provider;
    if (!subject || subject.hp / Math.max(1, simulatorEffectiveMaxHp(subject)) >= rule.hpBelow) return false;
  }
  if (["before-active", "after-active"].includes(eventName)) {
    if (!actor || actor.side !== provider.side) return false;
    if (/when (?:you|self) (?:use|uses|cast|casts|release|releases) an? active skill|after (?:you|self) (?:use|uses|cast|casts)/.test(text) && actor !== provider) return false;
    if (/after an? allied|when an? allied|each time your team/.test(text) && actor === provider && /other allied/.test(text)) return false;
    if (/allied ccg|ccg character/.test(text) && !simulatorRequirementMatches(actor.unit, "CCG")) return false;
  }
  if (["before-damage", "after-damage", "after-crit"].includes(eventName)) {
    if (!actor || actor.side !== provider.side) return false;
    if (!/allied|your team|our character/.test(text) && actor !== provider) return false;
  }
  if (["before-hit", "after-hit", "hp-changed", "receive-weak"].includes(eventName)) {
    if (!target || target.side !== provider.side) return false;
    if (!/allied|your team|our character|characters gain the following/.test(text) && target !== provider) return false;
    if (rule.faction && !simulatorRequirementMatches(target.unit, rule.faction)) return false;
  }
  if (eventName === "power-burst" && context.actor !== provider) return false;
  if (eventName === "status-gained") {
    if (context.target !== provider) return false;
    if (/when flash is activated/.test(text) && !/flash/.test(String(context.statusName || "").toLowerCase())) return false;
  }
  if (eventName === "after-weak" && /applying weak|inflicting weak|when causing weak/.test(text) && context.actor !== provider) return false;
  if (eventName === "receive-weak" && context.target !== provider && !/allied|your team|our character/.test(text)) return false;
  if (eventName === "after-death" && /successfully (?:killing|defeating)|when (?:you|self) (?:kill|kills|defeat|defeats)/.test(text) && context.killer !== provider) return false;
  return true;
}

function simulatorRuleRecipients(rule, provider, team, enemyTeam, context) {
  const text = rule.normalizedText;
  if (/when taking damage|when (?:the character|an allied [^.]*character) takes damage/.test(text) && context.target?.side === provider.side) return [context.target];
  if (rule.atkDown || rule.defDown || rule.cleanseBuffs) {
    if (/all enemies|each enemy|enemies(?:'|â€™)/.test(text)) return simulatorLiving(enemyTeam);
    return [context.target || context.actor].filter(member => member?.side !== provider.side);
  }
  if (/all enemies|each enemy/.test(text)) return simulatorLiving(enemyTeam);
  if (/all allied|all allies|your whole team|your team|all of our|our characters|each allied|characters gain the following effects|your [^.]*characters? gain/.test(text)) {
    return simulatorLiving(team).filter(member => !rule.faction || simulatorRequirementMatches(member.unit, rule.faction));
  }
  if (/character with the highest initial attack|highest initial atk/.test(text)) {
    const highest = [...simulatorLiving(team)].sort((a, b) => b.baseAtk - a.baseAtk)[0];
    return /yourself and|self and/.test(text) ? [...new Set([provider, highest].filter(Boolean))] : [highest].filter(Boolean);
  }
  if (/target(?:'s)?/.test(text) && context.target) return [context.target];
  return [provider];
}

function simulatorPassiveLog(log, round, team, provider, rule, text, actionType = "Passive", kind = "passive", extra = {}) {
  if (!log) return;
  const duplicate = log.slice(-80).some(entry => entry.round === round
    && entry.side === team.side
    && entry.actorId === provider.id
    && entry.passiveId === rule.id
    && entry.actionType === actionType
    && entry.text === text);
  if (duplicate) return;
  log.push({
    round, side: team.side, actorId: provider.id, kind, actionType, targetIds: [],
    passiveId: rule.id, passiveName: rule.name, passiveText: rule.text,
    text, ...extra
  });
}

function simulatorCleanse(team, debuffs, buffs, count = 1, random = Math.random) {
  const candidates = simulatorLiving(team).flatMap(member => (member.statuses || [])
    .filter(status => debuffs ? status.isDebuff : buffs ? status.isBuff : false)
    .map(status => ({ member, status })));
  let removed = 0;
  while (candidates.length && removed < count) {
    const index = Math.floor(random() * candidates.length);
    const { member, status } = candidates.splice(index, 1)[0];
    member.statuses = member.statuses.filter(item => item !== status);
    removed++;
  }
  return removed;
}

function simulatorCleanseMember(member, count = 1, random = Math.random) {
  if (!member?.alive) return 0;
  const candidates = (member.statuses || []).filter(status => status.isDebuff);
  let removed = 0;
  while (candidates.length && removed < count) {
    const index = Math.floor(random() * candidates.length);
    const status = candidates.splice(index, 1)[0];
    member.statuses = member.statuses.filter(item => item !== status);
    removed++;
  }
  return removed;
}

function simulatorHealMember(source, target, rule) {
  if (!target?.alive || target.healBlocked > 0) return 0;
  const maxHp = simulatorEffectiveMaxHp(target);
  const hasFlash = (source.statuses || []).some(status => String(status.name || "").toLowerCase().includes("flash"));
  const attackHealing = rule.healAtk
    ? simulatorEffectiveAtk(source) * rule.healAtk * (hasFlash ? Math.max(1, Number(rule.healAtkFlashMultiplier) || 1) : 1)
    : 0;
  const baseAmount = attackHealing || (rule.healLost
    ? (maxHp - Math.max(0, target.hp)) * rule.healLost
    : maxHp * rule.heal);
  const restoration = rule.ignoreRestorationRate ? 0 : (Number(target.profile?.regeneration) || 0) + simulatorStatusValue(target, "regeneration");
  const amount = baseAmount * (1 + Math.max(-0.8, restoration));
  const healed = Math.max(0, Math.min(maxHp - target.hp, amount));
  target.hp += healed;
  source.healing += healed;
  return healed;
}

function simulatorRuleForEvent(rule, eventName) {
  const text = rule.normalizedText;
  const current = { ...rule };
  if (/when taking damage[^.;]*(?:max hp|hp-related|def)/.test(text) && eventName !== "after-hit") {
    current.hpUp = 0;
    current.defUp = 0;
  }
  if (/when (?:dealing|causing) damage[^.;]*(?:target(?:'s)?|enemy)[^.;]*(?:atk|def)/.test(text) && eventName !== "after-damage") {
    current.atkDown = 0;
    current.defDown = 0;
  }
  if (/when using active skills?[^.;]*(?:damage|dmg|atk|def|max hp)/.test(text) && !["before-active", "after-active"].includes(eventName)) {
    current.damageUp = 0;
    current.atkUp = 0;
    current.defUp = 0;
  }
  if (current.forcedActive) current.damageUp = 0;
  if (current.staticAura) current.basicStats = 0;
  return current;
}

function simulatorDirectDamageAllowed(rule, eventName) {
  const text = rule.normalizedText;
  if (/fatal damage|when [^.]{0,45}(?:dies|is defeated)|death of [^.]{0,45}/.test(text)) return eventName === "after-death";
  if (/retaliat|being attacked|when attacked|attacked by active skills/.test(text)) return eventName === "after-hit";
  if (/when (?:our|your|the) turn ends|at the end of (?:our|your|the) turn/.test(text) && /(?:immediately )?(?:deal|cause)[^.]*?damage/.test(text)) return eventName === "turn-end";
  if (/when (?:our|your|the) turn starts|at the start of (?:our|your|the) turn/.test(text) && /(?:immediately )?(?:deal|cause)[^.]*?damage/.test(text)) return eventName === "turn-start";
  if (/after an? enemy uses an? active skill|after an? allied .*active skill|when (?:you|self) use an? active skill/.test(text)) return eventName === "after-active";
  return !["battle-start", "status-gained", "status-lost"].includes(eventName) || /when (?:the )?battle (?:begins|starts)[^.]*?(?:deal|cause)[^.]*?damage/.test(text);
}

function simulatorRuleStateAllows(provider, rule, eventName, round, log, team, context) {
  provider.ruleState ||= {};
  const stateForRule = provider.ruleState[rule.id] ||= { stacks: 0, lastTurn: -1 };
  if (rule.oncePerTurn && stateForRule.lastTurn === round) return false;
  if (rule.requiredStacks > 0) {
    const fixedGain = rule.normalizedText.match(/gain(?:s)? ([0-9]+) stacks?/);
    const gained = /stacks? (?:of [^.]+ )?equal to (?:the )?skill(?:'s)? level|equal to the (?:active )?skill(?:'s)? level/.test(rule.normalizedText)
      ? Math.max(1, Number(context.level) || 1)
      : Number(fixedGain?.[1] || 1);
    stateForRule.stacks += gained;
    if (stateForRule.stacks < rule.requiredStacks) {
      simulatorPassiveLog(log, round, team, provider, rule,
        `${provider.name} gains ${rule.name} progress (${stateForRule.stacks}/${rule.requiredStacks}).`, "Passive Stack", "buff");
      return false;
    }
    stateForRule.stacks = 0;
  }
  if (rule.oncePerTurn) stateForRule.lastTurn = round;
  return true;
}

function simulatorApplyRuleStatus(rule, recipient, eventName) {
  const dynamicBasic = rule.basicStats || 0;
  const immuneToBasicReduction = (recipient.profile?.passiveRules || []).some(item => item.basicStatReductionImmune);
  const atkDown = immuneToBasicReduction ? 0 : rule.atkDown;
  const defDown = immuneToBasicReduction ? 0 : rule.defDown;
  const debuff = Boolean(atkDown || defDown || rule.healBlock || (rule.skillLevel < 0));
  return simulatorAddStatus(recipient, {
    key: `${rule.id}:${eventName}:${debuff ? "debuff" : "buff"}`,
    sourceId: rule.id, name: rule.name, turns: rule.nextActiveDamage ? 99 : rule.duration, maxStacks: rule.maxStacks,
    isDebuff: debuff, isBuff: !debuff,
    atk: atkDown ? -atkDown : rule.atkUp + dynamicBasic,
    def: defDown ? -defDown : rule.defUp + dynamicBasic,
    hp: rule.hpUp + dynamicBasic,
    damage: rule.damageUp,
    reduction: rule.reduction,
    critRate: rule.critRate,
    critDamage: rule.critDamage,
    critDef: rule.critDef,
    regeneration: rule.regeneration,
    activeReduction: rule.activeReduction,
    nextActiveDamage: rule.nextActiveDamage,
    skillLevel: rule.skillLevel,
    permanent: rule.permanent
  });
}

function simulatorApplyWeak(source, target, duration, sourceTeam, targetTeam, random, log, round, context = {}) {
  if (!target?.alive) return false;
  target.weak = Math.max(target.weak || 0, duration || 1);
  const weakContext = { ...context, actor: source, target, sourceIsCard: false };
  simulatorFirePassives("after-weak", sourceTeam, targetTeam, weakContext, random, log, round);
  simulatorFirePassives("receive-weak", targetTeam, sourceTeam, weakContext, random, log, round);
  return true;
}

function simulatorForcedActiveLevels(provider, rule) {
  if (rule.forcedActiveMode !== "self-hp-threshold") return [rule.forcedActiveLevel || 0];
  const stateForRule = provider.ruleState[`${rule.id}:forced-hp`] ||= { used: [] };
  const ratio = provider.hp / Math.max(1, simulatorEffectiveMaxHp(provider));
  const thresholds = [0.7, 0.5, 0.3];
  const levels = [];
  thresholds.forEach((threshold, index) => {
    if (ratio < threshold && !stateForRule.used.includes(index + 1)) {
      stateForRule.used.push(index + 1);
      levels.push(index + 1);
    }
  });
  return levels;
}

function simulatorApplyForcedActive(eventName, provider, rule, team, enemyTeam, context, random, log, round) {
  if (!rule.forcedActive || !rule.forcedEvents.includes(eventName) || !simulatorLiving(enemyTeam).length) return false;
  if (rule.forcedRandomOption && random() >= 0.25) return false;

  let releaser = provider;
  if (rule.forcedActiveMode === "ally-highest-atk") {
    releaser = simulatorLiving(team)
      .filter(member => member !== provider && (!rule.faction || simulatorRequirementMatches(member.unit, rule.faction)))
      .sort((a, b) => b.baseAtk - a.baseAtk)[0];
  } else if (rule.forcedActiveMode === "event-ally") {
    releaser = context.actor?.side === provider.side ? context.actor
      : context.target?.side === provider.side ? context.target
      : null;
  } else if (rule.forcedActiveMode === "damaged-ally") {
    releaser = context.target?.side === provider.side ? context.target : null;
  }
  if (!releaser?.alive || !team.active.includes(releaser)) return false;

  if (rule.forcedActiveMode === "event-ally") {
    releaser.stunned = 0;
    releaser.weak = 0;
  }
  const originalTargetAlive = Boolean(context.target?.alive && context.target.side !== provider.side);
  const target = rule.forcedTargetLowestHp
    ? [...simulatorLiving(enemyTeam)].sort((a, b) => a.hp / simulatorEffectiveMaxHp(a) - b.hp / simulatorEffectiveMaxHp(b))[0]
    : originalTargetAlive ? context.target : simulatorTarget(enemyTeam, random);
  if (!target) return false;

  const levels = simulatorForcedActiveLevels(provider, rule);
  if (!levels.length) return false;
  levels.forEach(configuredLevel => {
    const fallbackLevel = eventName === "turn-start"
      ? simulatorAutoDecision(releaser, enemyTeam, random).level
      : Number(context.level) || 1;
    const level = Math.max(1, Math.min(3, Number(configuredLevel) || fallbackLevel));
    simulatorPassiveLog(log, round, team, provider, rule,
      `${provider.name} activates ${rule.name}: ${releaser.name} releases a Lv.${level} Active Skill${originalTargetAlive ? ` at ${target.name}` : ` and retargets ${target.name}`}.`,
      "Passive Trigger", "passive", { targetIds: [releaser.id] });
    simulatorUseActiveSkill(releaser, team, enemyTeam, random, log, round, {
      level, target, sourceIsCard: false, triggerDepth: (context.triggerDepth || 0) + 1,
      bonusDamage: rule.forcedDamageUp, triggeredBy: rule, exactLevel: true,
      targetMode: originalTargetAlive ? "same-target" : "retarget-lowest-hp",
      triggerReason: rule.forcedActiveMode === "ally-highest-atk"
        ? `${rule.name} orders the other On Field ${rule.faction || "eligible"} ally with the highest initial ATK to use the same Skill Level.`
        : `${rule.name} triggers an additional Active Skill at its configured level.`
    });
  });
  return true;
}

function simulatorRecordActiveSkill(team, round, member, level, offensive, triggeredBy = "") {
  team.activeSkillHistory ||= {};
  const history = team.activeSkillHistory[round] ||= [];
  history.push({ memberId: member.id, level, offensive: Boolean(offensive), triggeredBy: String(triggeredBy || "") });
}

function simulatorApplyAllUnitCombo(eventName, provider, rule, team, enemyTeam, context, random, log, round) {
  provider.ruleState ||= {};
  const combo = provider.ruleState[`${rule.id}:combo`] ||= { armedRound: 0, pending: new Set() };

  if (eventName === "turn-start") {
    const previousSkills = team.activeSkillHistory?.[round - 1] || [];
    const offensiveOnly = round > 1 && previousSkills.length > 0 && previousSkills.every(skill => skill.offensive);
    combo.armedRound = offensiveOnly ? round : 0;
    combo.pending = new Set(offensiveOnly ? simulatorLiving(team).filter(member => team.active.includes(member)).map(member => member.id) : []);
    if (offensiveOnly) {
      simulatorPassiveLog(log, round, team, provider, rule,
        `${provider.name} activates ${rule.name}. Each On Field ally will repeat their next offensive Active Skill at the same level.`,
        "Passive Ready", "passive");
    }
    return offensiveOnly;
  }

  if (eventName !== "after-active" || !context.actor?.alive || context.actor.side !== provider.side) return false;
  const actor = context.actor;
  const removed = simulatorCleanseMember(actor, 1, random);
  const canRepeat = combo.armedRound === round
    && combo.pending.has(actor.id)
    && context.offensive
    && String(context.triggeredBy?.id || "") !== rule.id;
  if (!canRepeat) return removed > 0;

  combo.pending.delete(actor.id);
  const originalTargetAlive = Boolean(context.target?.alive && context.target.side !== provider.side);
  const target = originalTargetAlive ? context.target : simulatorTarget(enemyTeam, random);
  if (!target) return removed > 0;
  const level = Math.max(1, Math.min(3, Number(context.level) || 1));
  simulatorPassiveLog(log, round, team, provider, rule,
    `${provider.name} activates ${rule.name}: ${actor.name} repeats their Lv.${level} offensive Active Skill.`,
    "Passive Trigger", "passive", { targetIds: [actor.id] });
  simulatorUseActiveSkill(actor, team, enemyTeam, random, log, round, {
    level, target, sourceIsCard: false, triggerDepth: (context.triggerDepth || 0) + 1,
    triggeredBy: rule, exactLevel: true, targetMode: originalTargetAlive ? "same-target" : "retarget",
    triggerReason: `${rule.name} repeats this ally's next offensive Active Skill at the same level.`
  });
  return true;
}

function simulatorApplyPassiveRule(eventName, provider, rule, team, enemyTeam, context, random, log, round) {
  if (random() > rule.chance) return false;
  if (!simulatorRuleStateAllows(provider, rule, eventName, round, log, team, context)) return false;
  if (rule.specialKind === "all-unit-combo") {
    return simulatorApplyAllUnitCombo(eventName, provider, rule, team, enemyTeam, context, random, log, round);
  }
  const effectRule = simulatorRuleForEvent(rule, eventName);
  let applied = false;
  let healedTotal = 0;
  let healedIds = [];
  const recipients = simulatorRuleRecipients(effectRule, provider, team, enemyTeam, context);
  const targetImmuneToBasicReduction = (context.target?.profile?.passiveRules || []).some(item => item.basicStatReductionImmune);
  if (["before-damage", "before-hit"].includes(eventName)) {
    if (effectRule.damageUp && eventName === "before-damage") { context.damageMultiplier *= 1 + effectRule.damageUp; applied = true; }
    if (effectRule.reduction && eventName === "before-hit") { context.damageMultiplier *= 1 - Math.min(0.8, effectRule.reduction); applied = true; }
    if (effectRule.atkDown && eventName === "before-hit" && !targetImmuneToBasicReduction) { context.damageMultiplier *= 1 - Math.min(0.6, effectRule.atkDown); applied = true; }
  }
  if (rule.cleanseDebuffs) {
    const countMatch = rule.normalizedText.match(/remove ([0-9]+) debuffs?/);
    const removed = simulatorCleanse(team, true, false, /remove all|clear all/.test(rule.normalizedText) ? 99 : Number(countMatch?.[1] || 1), random);
    applied ||= removed > 0;
  }
  if (rule.cleanseBuffs) {
    const removed = simulatorCleanse(enemyTeam, false, true, /all buffs/.test(rule.normalizedText) ? 99 : 1, random);
    applied ||= removed > 0;
  }
  applied ||= simulatorApplyForcedActive(eventName, provider, rule, team, enemyTeam, context, random, log, round);
  const directAllowed = simulatorDirectDamageAllowed(rule, eventName);
  if (rule.directDamage > 0 && directAllowed && !rule.forcedActive && !["before-damage", "before-hit"].includes(eventName)) {
    const targets = rule.directAoe ? simulatorLiving(enemyTeam) : [
      eventName === "after-hit" && context.actor?.side !== provider.side ? context.actor
        : context.target?.side !== provider.side ? context.target
        : [...simulatorLiving(enemyTeam)].sort((a, b) => a.hp - b.hp)[0]
    ].filter(Boolean);
    let total = 0;
    const defeatedIds = [];
    targets.forEach(target => {
      const result = simulatorDealDamage(provider, target, rule.directDamage, random, { ignoreDef: /ignores? def/.test(rule.normalizedText) });
      total += result.damage;
      if (result.defeated) defeatedIds.push(target.id);
    });
    if (targets.length) {
      simulatorPassiveLog(log, round, team, provider, rule,
        `${provider.name} activates ${rule.name} for ${formatNumber(total)} ${/retaliat/.test(rule.normalizedText) ? "retaliation" : "follow-up"} damage.`,
        /retaliat/.test(rule.normalizedText) ? "Retaliation" : "Follow-up Attack", "follow-up",
        { targetIds: targets.map(target => target.id), defeatedIds });
      applied = true;
      simulatorBringBackup(enemyTeam, log, round);
    }
  }
  if (effectRule.heal || effectRule.healLost || effectRule.healAtk) {
    healedIds = recipients.filter(target => {
      const healed = simulatorHealMember(provider, target, effectRule);
      healedTotal += healed;
      return healed > 0;
    }).map(target => target.id);
    applied ||= healedTotal > 0;
  }
  if (effectRule.shield) {
    recipients.forEach(target => { target.shield += simulatorEffectiveMaxHp(target) * effectRule.shield; });
    applied ||= recipients.length > 0;
  }
  if (effectRule.basicStats || effectRule.atkUp || effectRule.defUp || effectRule.hpUp || effectRule.damageUp || effectRule.reduction || effectRule.critRate || effectRule.critDamage || effectRule.critDef || effectRule.regeneration || effectRule.activeReduction || effectRule.nextActiveDamage || effectRule.atkDown || effectRule.defDown || effectRule.skillLevel) {
    if (!["before-damage", "before-hit"].includes(eventName)) recipients.forEach(target => {
      const previousMaxHp = simulatorEffectiveMaxHp(target);
      const gainedStatus = simulatorApplyRuleStatus(effectRule, target, eventName);
      const nextMaxHp = simulatorEffectiveMaxHp(target);
      if (nextMaxHp > previousMaxHp) target.hp += nextMaxHp - previousMaxHp;
      if (eventName !== "status-gained" && gainedStatus && /flash/.test(`${effectRule.name} ${effectRule.normalizedText}`.toLowerCase())) {
        simulatorFirePassives("status-gained", team, enemyTeam, { actor: provider, target, statusName: "Flash", status: gainedStatus, sourceIsCard: false, triggerDepth: (context.triggerDepth || 0) + 1 }, random, log, round);
      }
    });
    applied ||= recipients.length > 0;
  }
  if (rule.control) {
    recipients.filter(target => target.side !== provider.side).forEach(target => { target.stunned = Math.max(target.stunned, rule.duration); });
    applied ||= recipients.some(target => target.side !== provider.side);
  }
  if (rule.healBlock) {
    recipients.filter(target => target.side !== provider.side).forEach(target => { target.healBlocked = Math.max(target.healBlocked, rule.duration); });
    applied ||= recipients.some(target => target.side !== provider.side);
  }
  if (rule.weak && eventName !== "after-weak") {
    recipients.filter(target => target.side !== provider.side).forEach(target => simulatorApplyWeak(provider, target, rule.duration, team, enemyTeam, random, log, round, context));
    applied ||= recipients.some(target => target.side !== provider.side);
  }
  if (applied && !rule.forcedActive && !(rule.directDamage > 0 && directAllowed && !["before-damage", "before-hit"].includes(eventName))) {
    const isHealing = Boolean(effectRule.heal || effectRule.healLost || effectRule.healAtk);
    const actionType = rule.cleanseDebuffs ? "Cleanse" : isHealing ? (rule.sourceType === "orb" ? "Orb Heal" : "Passive Heal") : effectRule.shield ? (rule.sourceType === "talent" ? "Talent Shield" : "Passive Shield") : rule.control ? "Control" : rule.sourceType === "orb" ? "Orb Effect" : rule.sourceType === "talent" ? "Talent Effect" : "Passive Trigger";
    const kind = rule.cleanseDebuffs ? "cleanse" : isHealing ? "heal" : effectRule.shield ? (rule.sourceType === "talent" ? "talent" : "buff") : rule.control ? "control" : rule.sourceType === "orb" ? "orb" : rule.sourceType === "talent" ? "talent" : "passive";
    const text = isHealing && healedTotal > 0
      ? `${provider.name}'s ${rule.name} restores ${formatNumber(Math.round(healedTotal))} HP across ${healedIds.length} ${healedIds.length === 1 ? "ally" : "allies"}.`
      : `${provider.name} activates ${rule.name}.`;
    simulatorPassiveLog(log, round, team, provider, rule, text, actionType, kind, { targetIds: healedIds });
  }
  return applied;
}

function simulatorFirePassives(eventName, team, enemyTeam, context, random, log, round) {
  if (!team || !enemyTeam || (context.triggerDepth || 0) > 3) return;
  team.all.forEach(provider => {
    (provider.profile.passiveRules || []).forEach(rule => {
      if (!rule.triggers.includes(eventName) || !simulatorRuleProviderAvailable(provider, team, rule)) return;
      if (!simulatorRuleActorMatches(rule, eventName, provider, team, context)) return;
      simulatorApplyPassiveRule(eventName, provider, rule, team, enemyTeam, context, random, log, round);
    });
  });
}

function simulatorApplyStaticPassives(team) {
  const multipliers = new Map(team.all.map(member => [member, { atk: 0, def: 0, hp: 0, damage: 0, reduction: 0, critRate: 0, critDamage: 0, critDef: 0, regeneration: 0, activeReduction: 0 }]));
  team.all.forEach(provider => {
    (provider.profile.passiveRules || []).forEach(rule => {
      if (!rule.staticAura || !simulatorRuleProviderAvailable(provider, team, rule)) return;
      const recipients = simulatorRuleRecipients(rule, provider, team, { active: [], all: [], bench: [] }, {});
      const matchingAllies = simulatorLiving(team).filter(member => !rule.faction || simulatorRequirementMatches(member.unit, rule.faction)).length;
      const perAlly = Math.min(rule.perAllyCap || 0.6, rule.perAlly * matchingAllies);
      recipients.forEach(member => {
        const values = multipliers.get(member);
        if (!values) return;
        const basic = rule.basicStats + perAlly;
        const hasDynamicTrigger = rule.triggers.some(trigger => trigger !== "battle-start");
        values.atk += basic + (hasDynamicTrigger || rule.hpAbove ? 0 : rule.atkUp);
        values.def += basic + (hasDynamicTrigger ? 0 : rule.defUp);
        values.hp += basic + (hasDynamicTrigger ? 0 : rule.hpUp);
        values.damage += hasDynamicTrigger ? 0 : rule.damageUp;
        values.reduction += hasDynamicTrigger ? 0 : rule.reduction;
        values.critRate += hasDynamicTrigger ? 0 : rule.critRate;
        values.critDamage += hasDynamicTrigger ? 0 : rule.critDamage;
        values.critDef += hasDynamicTrigger ? 0 : rule.critDef;
        values.regeneration += hasDynamicTrigger ? 0 : rule.regeneration;
        values.activeReduction += hasDynamicTrigger ? 0 : rule.activeReduction;
      });
    });
  });
  multipliers.forEach((values, member) => {
    member.atk *= 1 + Math.min(0.8, values.atk);
    member.def *= 1 + Math.min(0.8, values.def);
    member.maxHp *= 1 + Math.min(0.8, values.hp);
    member.hp = member.maxHp;
    member.profile.outgoingAmp = Math.min(0.7, member.profile.outgoingAmp + values.damage);
    member.profile.reduction = Math.min(0.7, member.profile.reduction + values.reduction);
    member.profile.critRate = Math.min(0.8, (member.profile.critRate || 0) + values.critRate);
    member.profile.critDamage = Math.min(1.5, (member.profile.critDamage || 0) + values.critDamage);
    member.profile.critDef = Math.min(1.0, (member.profile.critDef || 0) + values.critDef);
    member.profile.regeneration = Math.min(1.0, (member.profile.regeneration || 0) + values.regeneration);
    member.profile.activeReduction = Math.min(0.7, (member.profile.activeReduction || 0) + values.activeReduction);
  });
}

function makeSimulatorCombatant(id, assistantId, slot, includeKits, maxTalents = false) {
  const unit = simulatorUnit(id);
  const snapshot = state.combatPower[String(id)]?.upgraded;
  if (!unit || !snapshot) return null;
  const assist = battleSimulatorState.includeAssistants ? simulatorAssistantStats(assistantId) : { atk: 0, def: 0, hp: 0 };
  const profile = includeKits ? simulatorSkillProfile(unit, maxTalents) : {
    levels: [1.2, 1.7, 2.5], cards: [], passiveRules: [], aoe: false, ignoreDef: false, doubleCrit: false, pursuit: 0, heal: 0, shield: 0,
    reduction: 0, damageAmp: 0, control: 0, healBlock: false, teamStat: 0, teamRequirement: "", selfPerAlly: 0, selfRequirement: "", recognized: 0, passiveCount: 0
  };
  const hp = Number(snapshot.hp) + assist.hp;
  return {
    id: String(id), name: unit.name, title: unit.title, unit, slot, profile,
    atk: Number(snapshot.atk) + assist.atk,
    def: Number(snapshot.def) + assist.def,
    maxHp: hp, hp, shield: 0, stunned: 0, alive: true,
    damage: 0, healing: 0, kills: 0
  };
}

function simulatorBuildTeam(source, side, includeKits) {
  const members = source.ids.map((id, index) => makeSimulatorCombatant(id, source.assistants[index], index, includeKits));
  const active = members.slice(0, 4).filter(Boolean);
  const bench = members.slice(4).filter(Boolean);
  while (active.length < 4 && bench.length) active.push(bench.shift());
  const all = [...active, ...bench];
  if (includeKits) {
    all.forEach(member => {
      let teamBoost = 0;
      all.forEach(provider => {
        if (provider.profile.teamStat && simulatorRequirementMatches(member.unit, provider.profile.teamRequirement)) teamBoost += provider.profile.teamStat;
      });
      const matchingAllies = all.filter(ally => simulatorRequirementMatches(ally.unit, member.profile.selfRequirement)).length;
      const selfBoost = member.profile.selfPerAlly * matchingAllies;
      const multiplier = 1 + Math.min(0.6, teamBoost + selfBoost);
      member.atk *= multiplier;
      member.def *= multiplier;
      member.maxHp *= multiplier;
      member.hp = member.maxHp;
    });
  }
  return { side, name: source.name, active, bench, all, cp: simulatorTeamCp(source).total };
}

function simulatorRandom(seed) {
  let value = (Number(seed) || 1) >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let next = value;
    next = Math.imul(next ^ next >>> 15, next | 1);
    next ^= next + Math.imul(next ^ next >>> 7, next | 61);
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}

function simulatorLiving(team) {
  return team.active.filter(member => member.alive && member.hp > 0);
}

function simulatorBringBackup(team, log, round) {
  team.active.forEach((member, index) => {
    if ((!member.alive || member.hp <= 0) && team.bench.length) {
      const backup = team.bench.shift();
      team.active[index] = backup;
      if (log) log.push({ round, side: team.side, text: `${backup.name} enters from Back-up.` });
    }
  });
}

function simulatorCardLevel(random) {
  const roll = random();
  return roll < 0.56 ? 1 : roll < 0.88 ? 2 : 3;
}

function simulatorTarget(team, random) {
  const living = simulatorLiving(team);
  if (!living.length) return null;
  if (random() < 0.62) return [...living].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  return living[Math.floor(random() * living.length)];
}

function simulatorDealDamage(attacker, defender, multiplier, random, options = {}) {
  const attack = simulatorEffectiveAtk(attacker);
  const defense = simulatorEffectiveDef(defender);
  const mitigation = options.ignoreDef ? 0 : defense / (defense + 125000);
  const critBonus = (Number(attacker.profile?.critRate) || 0) + simulatorStatusValue(attacker, "critRate");
  const critChance = Math.min(0.95, ((attacker.unit.rarity === "SP" ? 0.19 : 0.15) + critBonus) * (options.doubleCrit ? 2 : 1));
  const critical = random() < critChance;
  const blocked = random() < 0.11;
  const variance = 0.9 + random() * 0.2;
  const activeReduction = options.activeSkill ? (Number(defender.profile?.activeReduction) || 0) + simulatorStatusValue(defender, "activeReduction") : 0;
  const reduction = options.ignoreReduction ? 0 : (defender.profile.reduction || 0) + simulatorStatusValue(defender, "reduction") + activeReduction;
  const incoming = (1 - Math.min(0.75, reduction)) * (1 + Math.min(0.6, (defender.profile.damageAmp || 0) + simulatorStatusValue(defender, "vulnerability")));
  const outgoing = (attacker.profile.outgoingAmp || 0) + simulatorStatusValue(attacker, "damage") + (Number(options.bonusDamage) || 0);
  const attribute = simulatorAttributeRelation(attacker, defender);
  const attributeMultiplier = attribute > 0 ? 1.2 : attribute < 0 ? 0.8 : 1;
  let damage = attack * multiplier * attributeMultiplier * (1 - mitigation) * variance * incoming * (1 + Math.min(0.9, outgoing));
  if (critical) {
    const critDamage = (Number(attacker.profile?.critDamage) || 0) + simulatorStatusValue(attacker, "critDamage");
    const critDef = (Number(defender.profile?.critDef) || 0) + simulatorStatusValue(defender, "critDef");
    damage *= 1 + Math.max(0.1, 0.5 + critDamage - critDef);
  }
  if (blocked) damage *= 0.65;
  damage = Math.max(1, Math.round(damage));
  const hitCaps = (defender.profile?.passiveRules || []).map(rule => Number(rule.singleHitCap) || 0).filter(Boolean);
  const hitCap = hitCaps.length ? Math.min(...hitCaps) : 0;
  const uncappedDamage = damage;
  if (hitCap > 0) damage = Math.min(damage, Math.max(1, Math.round(simulatorEffectiveMaxHp(defender) * hitCap)));
  const capped = damage < uncappedDamage;
  const absorbed = Math.min(defender.shield, damage);
  defender.shield -= absorbed;
  const healthDamage = damage - absorbed;
  defender.hp -= healthDamage;
  defender.damageTaken = (defender.damageTaken || 0) + healthDamage;
  attacker.damage += damage;
  if (defender.hp <= 0 && defender.alive) {
    defender.hp = 0;
    defender.alive = false;
    attacker.kills++;
  }
  return { damage, critical, blocked, attribute, defeated: !defender.alive, capped, uncappedDamage };
}

function simulatorUseActiveSkill(attacker, allies, enemies, random, log, round, options = {}) {
  if (!attacker?.alive) return null;
  const decision = options.decision || simulatorAutoDecision(attacker, enemies, random);
  const skillBonus = Math.round(simulatorStatusValue(attacker, "skillLevel"));
  const requestedLevel = Number(options.level || decision.level || 1);
  const level = Math.max(1, Math.min(3, requestedLevel + (options.exactLevel ? 0 : skillBonus)));
  const profile = attacker.profile;
  const spec = profile.cards?.[level - 1] || {
    level, factor: profile.levels[level - 1], extraAtk: 0, aoe: profile.aoe, ignoreDef: profile.ignoreDef,
    ignoreReduction: false, doubleCrit: profile.doubleCrit, heal: profile.heal, healLost: 0, shield: profile.shield,
    control: Boolean(profile.control), weak: false, healBlock: profile.healBlock, energy: 5
  };
  let primaryTarget = options.target?.alive ? options.target : simulatorAiTarget(enemies, decision, random);
  if (!primaryTarget) return null;
  const consumedNextActiveStatuses = (attacker.statuses || []).filter(status => status.nextActiveDamage > 0);
  const context = {
    actor: attacker, target: primaryTarget, level, spec, sourceIsCard: options.sourceIsCard !== false,
    triggerDepth: Number(options.triggerDepth || 0), damageMultiplier: 1, triggeredBy: options.triggeredBy || null,
    offensive: false
  };
  simulatorFirePassives("before-active", allies, enemies, context, random, log, round);
  const targets = spec.aoe ? simulatorLiving(enemies) : [primaryTarget].filter(Boolean);
  const triggered = options.sourceIsCard === false;
  const skillLogEntry = log ? {
    round, side: allies.side, actorId: attacker.id, kind: triggered ? "triggered" : "attack", actionType: triggered ? "Triggered Skill" : "Active Skill", level,
    cardAction: !triggered,
    targetIds: targets.map(target => target.id), defeatedIds: [], healedId: "", shieldedId: "", controlledIds: [],
    passiveId: options.triggeredBy?.id || "", passiveName: options.triggeredBy?.name || "", passiveText: options.triggeredBy?.text || "",
    rule: triggered ? options.triggeredBy?.id || "passive-release" : decision.rule.key,
    ruleLabel: triggered ? options.triggeredBy?.name || "Passive-forced Active Skill" : decision.rule.label,
    order: triggered ? "TRIGGERED" : decision.rule.order, targetMode: triggered ? options.targetMode || "same-target" : decision.rule.target,
    reason: triggered ? options.triggerReason || `${options.triggeredBy?.name || "A passive"} forces an additional Active Skill.` : decision.rule.reason,
    text: `${attacker.name} prepares a Lv.${level}${spec.aoe ? " area" : ""} Active Skill.`
  } : null;
  if (skillLogEntry) log.push(skillLogEntry);
  let total = 0;
  const defeated = [];
  const controlled = [];
  const cappedTargets = [];
  const attributeResults = [];
  targets.forEach(target => {
    const damageContext = { ...context, target, damageMultiplier: 1 };
    simulatorFirePassives("before-damage", allies, enemies, damageContext, random, log, round);
    simulatorFirePassives("before-hit", enemies, allies, damageContext, random, log, round);
    const multiplier = (spec.factor + spec.extraAtk) * (spec.aoe ? 0.78 : 1) * Math.max(0.05, damageContext.damageMultiplier);
    const result = simulatorDealDamage(attacker, target, multiplier, random, {
      ignoreDef: spec.ignoreDef, ignoreReduction: spec.ignoreReduction, doubleCrit: spec.doubleCrit, bonusDamage: options.bonusDamage, activeSkill: true
    });
    total += result.damage;
    damageContext.damage = result.damage;
    damageContext.critical = result.critical;
    damageContext.attribute = result.attribute;
    attributeResults.push(result.attribute);
    if (result.capped) cappedTargets.push(target);
    damageContext.defeated = result.defeated;
    simulatorFirePassives("after-damage", allies, enemies, damageContext, random, log, round);
    simulatorFirePassives("after-hit", enemies, allies, damageContext, random, log, round);
    simulatorFirePassives("hp-changed", enemies, allies, damageContext, random, log, round);
    if (result.critical) simulatorFirePassives("after-crit", allies, enemies, damageContext, random, log, round);
    if (spec.control && target.alive && random() < 0.3) {
      target.stunned = Math.max(target.stunned, 1);
      controlled.push(target);
    }
    if (spec.healBlock && target.alive) target.healBlocked = Math.max(target.healBlocked, 2);
    if (target.alive && result.attribute > 0) {
      target.weakGauge = Number(target.weakGauge || 0) + 1;
      if (target.weakGauge >= Number(target.weakCap || 6)) {
        target.weakGauge = 0;
        target.stunned = Math.max(target.stunned, 1);
        simulatorApplyWeak(attacker, target, 2, allies, enemies, random, log, round, damageContext);
      }
    }
    if (spec.weak && target.alive) simulatorApplyWeak(attacker, target, 2, allies, enemies, random, log, round, damageContext);
    if (result.defeated) {
      defeated.push(target);
      simulatorFirePassives("after-death", allies, enemies, { ...damageContext, defeated: target, killer: attacker }, random, log, round);
      simulatorFirePassives("after-death", enemies, allies, { ...damageContext, defeated: target, killer: attacker }, random, log, round);
    }
  });
  let healedTarget = null;
  let healedAmount = 0;
  if (spec.heal > 0 || spec.healLost > 0) {
    healedTarget = [...simulatorLiving(allies)].sort((a, b) => a.hp / simulatorEffectiveMaxHp(a) - b.hp / simulatorEffectiveMaxHp(b))[0];
    if (healedTarget) healedAmount = simulatorHealMember(attacker, healedTarget, { heal: spec.heal, healLost: spec.healLost });
    if (healedAmount > 0) simulatorFirePassives("after-heal", allies, enemies, { ...context, target: healedTarget, healing: healedAmount }, random, log, round);
  }
  let shieldedTarget = null;
  if (spec.shield > 0) {
    shieldedTarget = [...simulatorLiving(allies)].sort((a, b) => a.hp / simulatorEffectiveMaxHp(a) - b.hp / simulatorEffectiveMaxHp(b))[0] || attacker;
    shieldedTarget.shield += simulatorEffectiveMaxHp(shieldedTarget) * Math.min(0.6, spec.shield);
  }
  if (skillLogEntry) Object.assign(skillLogEntry, {
    targetIds: targets.map(target => target.id), defeatedIds: defeated.map(target => target.id),
    healedId: healedAmount > 0 ? healedTarget?.id : "", shieldedId: shieldedTarget?.id || "", controlledIds: controlled.map(target => target.id),
    reason: (triggered
      ? options.triggerReason || `${options.triggeredBy?.name || "A passive"} forces an additional Active Skill.`
      : `${decision.rule.reason}${decision.tied ? " Matching candidates tied, so hand order resolved the choice." : ""}${attributeResults.some(value => value > 0) ? " Attribute restriction grants +20% damage." : attributeResults.some(value => value < 0) ? " Restricted attribute applies -20% damage." : ""}`)
      + (cappedTargets.length ? ` Ability Sphere damage cap protected ${cappedTargets.map(target => target.name).join(", ")}.` : ""),
    text: `${attacker.name} ${triggered ? "releases a triggered" : "uses a"} Lv.${level}${spec.aoe ? " area" : ""} Active Skill for ${formatNumber(total)} damage${defeated.length ? ` and defeats ${defeated.map(target => target.name).join(", ")}` : ""}${cappedTargets.length ? `; Ability Sphere damage cap triggered on ${cappedTargets.map(target => target.name).join(", ")}` : ""}.`
  });
  if (profile.pursuit > 0 && simulatorLiving(enemies).length) {
    const target = simulatorTarget(enemies, random);
    const pursuitResult = simulatorDealDamage(attacker, target, profile.pursuit, random, { ignoreDef: spec.ignoreDef });
    if (log) log.push({ round, side: allies.side, actorId: attacker.id, kind: "follow-up", actionType: "Follow-up Attack", targetIds: [target.id], defeatedIds: pursuitResult.defeated ? [target.id] : [], text: `${attacker.name} follows up for ${formatNumber(pursuitResult.damage)} damage.` });
  }
  context.offensive = total > 0 && targets.length > 0;
  simulatorRecordActiveSkill(allies, round, attacker, level, context.offensive, options.triggeredBy?.id);
  if (consumedNextActiveStatuses.length) attacker.statuses = (attacker.statuses || []).filter(status => !consumedNextActiveStatuses.includes(status));
  simulatorFirePassives("after-active", allies, enemies, context, random, log, round);
  attacker.energy = Math.min(100, Number(attacker.energy || 0) + Number(spec.energy || 5));
  if (attacker.energy >= 100) {
    attacker.energy = 0;
    simulatorFirePassives("power-burst", allies, enemies, { ...context, actor: attacker, sourceIsCard: false }, random, log, round);
  }
  simulatorBringBackup(enemies, log, round);
  return { total, targets, defeated, level };
}

function simulatorAct(attacker, allies, enemies, random, log, round) {
  if (!attacker.alive) return;
  if (attacker.stunned > 0) {
    attacker.stunned--;
    if (log) log.push({ round, side: allies.side, actorId: attacker.id, kind: "control", actionType: "Status", cardAction: true, level: 0, targetIds: [], text: `${attacker.name} cannot act because of a control effect.` });
    return;
  }
  simulatorUseActiveSkill(attacker, allies, enemies, random, log, round, { sourceIsCard: true });
}

function simulatorRemaining(team) {
  return team.all.reduce((sum, member) => sum + Math.max(0, member.hp), 0);
}

function simulatorBattle(leftSource, rightSource, seed, maxRounds, includeKits, captureLog = false) {
  const random = simulatorRandom(seed);
  const left = simulatorBuildTeam(leftSource, "A", includeKits);
  const right = simulatorBuildTeam(rightSource, "B", includeKits);
  const log = captureLog ? [] : null;
  let first = left.cp === right.cp ? (random() < 0.5 ? left : right) : (left.cp > right.cp ? left : right);
  const second = first === left ? right : left;
  let round = 0;
  for (round = 1; round <= maxRounds; round++) {
    for (const [acting, defending] of [[first, second], [second, first]]) {
      const actors = [...simulatorLiving(acting)].sort((a, b) => b.atk - a.atk || random() - 0.5);
      for (const actor of actors) {
        if (!simulatorLiving(defending).length && !defending.bench.length) break;
        simulatorAct(actor, acting, defending, random, log, round);
      }
      if (!simulatorLiving(defending).length && !defending.bench.length) break;
    }
    if ((!simulatorLiving(left).length && !left.bench.length) || (!simulatorLiving(right).length && !right.bench.length)) break;
  }
  const leftHp = simulatorRemaining(left);
  const rightHp = simulatorRemaining(right);
  const totalHp = leftHp + rightHp || 1;
  const gap = Math.abs(leftHp - rightHp) / totalHp;
  const winner = gap < 0.005 ? "draw" : leftHp > rightHp ? "A" : "B";
  return {
    winner, rounds: Math.min(round, maxRounds), first: first.side,
    leftHp, rightHp,
    leftSurvivors: left.all.filter(member => member.alive).length,
    rightSurvivors: right.all.filter(member => member.alive).length,
    leftDamage: left.all.reduce((sum, member) => sum + member.damage, 0),
    rightDamage: right.all.reduce((sum, member) => sum + member.damage, 0),
    leftMaxHp: left.all.reduce((sum, member) => sum + member.maxHp, 0),
    rightMaxHp: right.all.reduce((sum, member) => sum + member.maxHp, 0),
    log: log || []
  };
}

function simulatorKitCoverage(source) {
  return source.ids.reduce((totals, id, index) => {
    if (!id) return totals;
    const unit = simulatorUnit(id);
    if (!unit) return totals;
    const profile = simulatorSkillProfile(unit, Boolean(source.maxTalents?.[index]));
    const rules = profile.passiveRules || [];
    totals.modeled += rules.filter(rule => rule.coverage === "modeled").length;
    totals.partial += rules.filter(rule => rule.coverage === "partial").length;
    totals.unmodeled += rules.filter(rule => rule.coverage === "unmodeled").length;
    totals.recognized += rules.filter(rule => rule.coverage !== "unmodeled").length;
    totals.passives += rules.length;
    totals.skills += (profile.cards || []).filter(card => card.text).length;
    return totals;
  }, { recognized: 0, modeled: 0, partial: 0, unmodeled: 0, passives: 0, skills: 0 });
}

function simulatorCoverageMarkup(ids, maxTalents = []) {
  return ids.map((id, index) => {
    if (!id) return "";
    const unit = simulatorUnit(id);
    if (!unit) return "";
    const profile = simulatorSkillProfile(unit, Boolean(maxTalents[index]));
    const rules = profile.passiveRules || [];
    const orbCount = rules.filter(rule => rule.sourceType === "orb").length;
    const talentCount = rules.filter(rule => rule.sourceType === "talent").length;
    const passiveCount = rules.length - orbCount - talentCount;
    return `<article class="simulator-coverage-unit">
      <header><img src="${escapeHtml(unit.image)}" alt=""><div><strong>${escapeHtml(simulatorUnitDisplayName(unit))}</strong><span>${(profile.cards || []).filter(card => card.text).length} Active Skill levels · ${passiveCount} passives · ${orbCount} Ability Sphere · ${talentCount} Talents</span></div></header>
      <div>${rules.map(rule => `<p><em class="coverage-${rule.coverage}">${rule.coverage}</em><b>${rule.sourceType === "orb" ? "ORB · " : rule.sourceType === "talent" ? "TALENT · " : ""}${escapeHtml(rule.name)}</b><span>${escapeHtml(rule.id)} · ${escapeHtml(rule.triggers.join(", ") || "persistent/config-only")}</span></p>`).join("")}</div>
    </article>`;
  }).join("");
}

function runBattleSimulator() {
  const leftSource = simulatorSourceTeam(battleSimulatorState.leftSource);
  const rightSource = simulatorSourceTeam(battleSimulatorState.rightSource);
  if (leftSource.ids.filter(Boolean).length < 1 || rightSource.ids.filter(Boolean).length < 1) {
    document.querySelector("#simulator-results").innerHTML = `<div class="simulator-empty warning"><strong>Both sides need units</strong><p>Add units in CP Battle or Team Building, then return here.</p></div>`;
    return;
  }
  const runButton = document.querySelector("#simulator-run");
  runButton.disabled = true;
  runButton.textContent = "Simulating...";
  const totals = {
    A: 0, B: 0, draw: 0, rounds: 0, leftHp: 0, rightHp: 0, leftSurvivors: 0, rightSurvivors: 0, leftDamage: 0, rightDamage: 0
  };
  let sample = null;
  for (let index = 0; index < battleSimulatorState.runs; index++) {
    const battle = simulatorBattle(leftSource, rightSource, battleSimulatorState.seed + index * 7919, battleSimulatorState.maxRounds, battleSimulatorState.includeKits, index === 0);
    totals[battle.winner]++;
    totals.rounds += battle.rounds;
    totals.leftHp += battle.leftHp / Math.max(1, battle.leftMaxHp);
    totals.rightHp += battle.rightHp / Math.max(1, battle.rightMaxHp);
    totals.leftSurvivors += battle.leftSurvivors;
    totals.rightSurvivors += battle.rightSurvivors;
    totals.leftDamage += battle.leftDamage;
    totals.rightDamage += battle.rightDamage;
    if (index === 0) sample = battle;
  }
  battleSimulatorState.result = { totals, sample, leftSource, rightSource };
  renderBattleSimulatorResults();
  runButton.disabled = false;
  runButton.textContent = "Run Battle Simulation";
}

function simulatorAverage(value) {
  return value / battleSimulatorState.runs;
}

function renderBattleSimulatorResults() {
  const result = battleSimulatorState.result;
  if (!result) return;
  const { totals, sample, leftSource, rightSource } = result;
  const leftRate = totals.A / battleSimulatorState.runs * 100;
  const rightRate = totals.B / battleSimulatorState.runs * 100;
  const drawRate = totals.draw / battleSimulatorState.runs * 100;
  const favored = leftRate === rightRate ? "No clear favorite" : leftRate > rightRate ? "Team A is favored" : "Team B is favored";
  const leftCp = simulatorTeamCp(leftSource).total;
  const rightCp = simulatorTeamCp(rightSource).total;
  const coverageSource = { ids: [...leftSource.ids, ...rightSource.ids], maxTalents: [...leftSource.maxTalents, ...rightSource.maxTalents] };
  const coverage = simulatorKitCoverage(coverageSource);
  const completeTeams = leftSource.ids.filter(Boolean).length >= 4 && rightSource.ids.filter(Boolean).length >= 4;
  const confidence = completeTeams && coverage.recognized >= 4 ? "MEDIUM" : "LOW";
  const firstTeam = leftCp === rightCp ? "Tie - seeded coin flip" : leftCp > rightCp ? "Team A" : "Team B";
  const reasons = [
    `${firstTeam} has the modeled first action (${formatNumber(Math.abs(leftCp - rightCp))} CP gap).`,
    `${coverage.recognized} kit traits were recognized across ${coverage.passives} configured base/rank passives.`,
    battleSimulatorState.includeAssistants ? "Assistant ATK, DEF, and HP transfer is included at the confirmed max 6-star 10% ratio." : "Assistant bonuses are disabled.",
    "Results exclude account-specific Potentials, RC Cells, Force Talents, Scenes, and Tactics."
  ];
  document.querySelector("#simulator-results").innerHTML = `
    <header class="simulator-result-header">
      <div><span>MODELED RESULT</span><h3>${favored}</h3><p>${battleSimulatorState.runs.toLocaleString()} deterministic Monte Carlo battles - seed ${battleSimulatorState.seed}</p></div>
      <div class="simulator-confidence ${confidence.toLowerCase()}"><span>MODEL CONFIDENCE</span><strong>${confidence}</strong></div>
    </header>
    <div class="simulator-win-bars">
      <div class="simulator-win-labels"><strong>Team A ${leftRate.toFixed(1)}%</strong><span>Draw ${drawRate.toFixed(1)}%</span><strong>Team B ${rightRate.toFixed(1)}%</strong></div>
      <div class="simulator-win-track"><span class="a" style="width:${leftRate}%"></span><span class="draw" style="width:${drawRate}%"></span><span class="b" style="width:${rightRate}%"></span></div>
    </div>
    <div class="simulator-metrics">
      <div><span>First action</span><strong>${firstTeam}</strong></div>
      <div><span>Average rounds</span><strong>${simulatorAverage(totals.rounds).toFixed(1)}</strong></div>
      <div><span>Team A survivors</span><strong>${simulatorAverage(totals.leftSurvivors).toFixed(1)}</strong></div>
      <div><span>Team B survivors</span><strong>${simulatorAverage(totals.rightSurvivors).toFixed(1)}</strong></div>
      <div><span>Team A HP left</span><strong>${(simulatorAverage(totals.leftHp) * 100).toFixed(1)}%</strong></div>
      <div><span>Team B HP left</span><strong>${(simulatorAverage(totals.rightHp) * 100).toFixed(1)}%</strong></div>
      <div><span>Team A avg damage</span><strong>${formatNumber(Math.round(simulatorAverage(totals.leftDamage)))}</strong></div>
      <div><span>Team B avg damage</span><strong>${formatNumber(Math.round(simulatorAverage(totals.rightDamage)))}</strong></div>
    </div>
    <div class="simulator-result-grid">
      <section class="simulator-reasons"><h4>Why the model favors this result</h4>${reasons.map(reason => `<p>${escapeHtml(reason)}</p>`).join("")}</section>
      <section class="simulator-log"><h4>Sample battle - run #1</h4><div>${sample.log.slice(0, 28).map(entry => `<p class="side-${entry.side.toLowerCase()}"><span>R${entry.round} - ${entry.side}</span>${escapeHtml(entry.text)}</p>`).join("") || "<p>No actions recorded.</p>"}</div></section>
    </div>`;
}

function initializeBattleSimulator() {
  populateBattleSimulatorSources();
  document.querySelector("#simulator-runs").value = String(battleSimulatorState.runs);
  document.querySelector("#simulator-rounds").value = String(battleSimulatorState.maxRounds);
  document.querySelector("#simulator-seed").value = String(battleSimulatorState.seed);
  document.querySelector("#simulator-assistants").checked = battleSimulatorState.includeAssistants;
  document.querySelector("#simulator-kits").checked = battleSimulatorState.includeKits;
  renderBattleSimulatorSetup();
}

/* Independent one-round Quick Battle interface. These declarations intentionally
   replace the original saved-team source adapter above while retaining its engine helpers. */
function simulatorSourceTeam(side) {
  return {
    name: side === "left" ? "My Team" : "Enemy Team",
    ids: [...battleSimulatorState.teams[side].slots],
    maxTalents: [...battleSimulatorState.teams[side].maxTalents],
    assistants: ["", "", "", "", ""]
  };
}

function simulatorInvestmentMultiplier() {
  return battleSimulatorState.maxInvestment ? SIMULATOR_MAX_INVESTMENT_PROFILE.multiplier : 1;
}

function simulatorCombatPower(id) {
  return Math.round(maxCombatPower(id) * simulatorInvestmentMultiplier());
}

function simulatorStatSnapshot(id) {
  const snapshot = state.combatPower[String(id)]?.upgraded;
  if (!snapshot) return null;
  const multiplier = simulatorInvestmentMultiplier();
  return {
    atk: Number(snapshot.atk) * multiplier,
    def: Number(snapshot.def) * multiplier,
    hp: Number(snapshot.hp) * multiplier,
    combatPower: Math.round(Number(snapshot.combatPower || 0) * multiplier)
  };
}

function simulatorTeamCp(source) {
  const main = source.ids.reduce((sum, id) => sum + simulatorCombatPower(id), 0);
  return { main, assistant: 0, total: main };
}

function simulatorRosterMarkup(side) {
  const team = battleSimulatorState.teams[side];
  const teamName = side === "left" ? "My Team" : "Enemy Team";
  return team.slots.map((id, index) => {
    const unit = simulatorUnit(id);
    if (!unit) return `<div class="simulator-slot"><button class="simulator-unit empty${index === 4 ? " backup-slot" : ""}" type="button" data-simulator-side="${side}" data-simulator-slot="${index}" aria-label="Choose ${teamName} ${index === 4 ? "Backup Slot" : `On Field slot ${index + 1}`}"><span>${index === 4 ? "BACKUP SLOT" : `ON FIELD ${index + 1}`}</span><b>+</b><strong>${index === 4 ? "Select Backup" : "Select unit"}</strong></button></div>`;
    const maxTalents = Boolean(team.maxTalents[index]);
    return `<div class="simulator-slot${maxTalents ? " talents-active" : ""}"><button class="simulator-unit filled" type="button" draggable="true" data-simulator-side="${side}" data-simulator-slot="${index}" aria-label="Change ${teamName} slot ${index + 1}, ${escapeHtml(unit.name)}">
      <span>${index === 4 ? "BACKUP SLOT" : `ON FIELD ${index + 1}`}</span>
      <i class="simulator-drag-grip" aria-hidden="true">⠿</i>
      <img src="${escapeHtml(unit.image)}" alt="">
      <strong>${escapeHtml(simulatorUnitDisplayName(unit))}</strong>
      <small>${index === 4 ? "Enters next turn and inherits the open slot priority" : escapeHtml(unit.rarity)}</small>
      <i class="simulator-atk-priority">${index === 4 ? "ATK PRIORITY · INHERITED" : `ATK PRIORITY #${index + 1} · ${SIMULATOR_SLOT_ATTACK_PREMIUMS[index] ? `TEAM MAX +${SIMULATOR_SLOT_ATTACK_PREMIUMS[index] * 100}%` : "TEAM MAX"}`}</i>
      <em>${formatNumber(simulatorCombatPower(unit.id))}</em>
    </button><label class="simulator-max-talents"><input type="checkbox" data-simulator-talents-side="${side}" data-simulator-talents-slot="${index}"${maxTalents ? " checked" : ""}><span>Max Talents</span></label></div>`;
  }).join("");
}

function renderBattleSimulatorSetup() {
  if (!document.querySelector("#battle-simulator-view")) return;
  const left = simulatorSourceTeam("left");
  const right = simulatorSourceTeam("right");
  const leftCp = simulatorTeamCp(left).total;
  const rightCp = simulatorTeamCp(right).total;
  document.querySelector("#simulator-left-preview").innerHTML = simulatorRosterMarkup("left");
  document.querySelector("#simulator-right-preview").innerHTML = simulatorRosterMarkup("right");
  document.querySelector("#simulator-left-cp").textContent = `${formatNumber(leftCp)} CP`;
  document.querySelector("#simulator-right-cp").textContent = `${formatNumber(rightCp)} CP`;
  document.querySelector(".simulator-team-panel.team-a").classList.toggle("first", leftCp > rightCp && rightCp > 0);
  document.querySelector(".simulator-team-panel.team-b").classList.toggle("first", rightCp > leftCp && leftCp > 0);
  renderSimulatorAiPredictor();
}

function populateBattleSimulatorTeams() {
  const presetIds = [...BATTLE_SIMULATOR_TEST_PRESET.left, ...BATTLE_SIMULATOR_TEST_PRESET.right];
  const missing = presetIds.filter(id => !simulatorUnit(id));
  if (missing.length) {
    document.querySelector("#simulator-results").innerHTML = `<div class="simulator-empty warning"><strong>Test preset is unavailable</strong><p>Unit data is still loading. Please try Populate Teams again in a moment.</p></div>`;
    return;
  }
  if (battleSimulatorState.runTimer) clearTimeout(battleSimulatorState.runTimer);
  battleSimulatorState.runTimer = null;
  battleSimulatorState.playbackToken++;
  battleSimulatorState.teams.left.slots.splice(0, 5, ...BATTLE_SIMULATOR_TEST_PRESET.left);
  battleSimulatorState.teams.right.slots.splice(0, 5, ...BATTLE_SIMULATOR_TEST_PRESET.right);
  battleSimulatorState.teams.left.maxTalents.fill(false);
  battleSimulatorState.teams.right.maxTalents.fill(false);
  battleSimulatorState.result = null;
  const runButton = document.querySelector("#simulator-run");
  runButton.disabled = false;
  runButton.textContent = "Battle";
  document.querySelector("#simulator-populate").disabled = false;
  document.querySelector("#simulator-results").innerHTML = `<div class="simulator-empty updated"><strong>Test teams populated</strong><p>The screenshot preset is ready. Press Battle to run the comparison.</p></div>`;
  renderBattleSimulatorSetup();
}

function simulatorPickerResultsMarkup(side, slotIndex, faction = "all", search = "") {
  const team = battleSimulatorState.teams[side];
  const used = new Set(team.slots.filter(Boolean).map(String));
  const selectedId = String(team.slots[slotIndex] || "");
  const units = battlePool(faction, search).filter(unit => !used.has(String(unit.id)) || String(unit.id) === selectedId);
  if (!units.length) return `<p class="picker-empty">${t("noMatches")}</p>`;
  return units.map(unit => {
    const id = String(unit.id);
    return `<button class="picker-unit${id === selectedId ? " selected" : ""}" type="button" data-unit-id="${escapeHtml(id)}">
      <img src="${escapeHtml(unit.image)}" alt="" loading="lazy">
      <span><strong>${escapeHtml(unit.name)}</strong><small>${escapeHtml(unit.title || unit.faction)} · ${escapeHtml(unit.rarity)}</small></span>
      <b>${simulatorCombatPower(id) ? `${formatNumber(simulatorCombatPower(id))} CP` : "CP N/A"}</b>
    </button>`;
  }).join("");
}

function openSimulatorPicker(side, slot) {
  activeBattlePicker = { context: "simulator", side, slot, role: "main" };
  const teamName = side === "left" ? "My Team" : "Enemy Team";
  document.querySelector("#battle-picker-title").textContent = `${teamName} · Slot ${slot + 1}`;
  document.querySelector(".battle-picker-heading .eyebrow").textContent = "Quick Battle unit pool";
  document.querySelector("#battle-picker-search").value = "";
  document.querySelector("#battle-picker-faction").value = "all";
  document.querySelector("#battle-picker-clear").hidden = !battleSimulatorState.teams[side].slots[slot];
  refreshBattlePicker();
  battlePickerModal.showModal();
  document.querySelector("#battle-picker-search").focus();
}

function makeSimulatorCombatant(id, assistantId, slot, includeKits, maxTalents = false) {
  const unit = simulatorUnit(id);
  const snapshot = simulatorStatSnapshot(id);
  if (!unit || !snapshot) return null;
  const profile = includeKits ? simulatorSkillProfile(unit, maxTalents) : {
    levels: [1.2, 1.7, 2.5], cards: [], passiveRules: [], aoe: false, ignoreDef: false, doubleCrit: false, pursuit: 0, heal: 0, shield: 0,
    reduction: 0, damageAmp: 0, outgoingAmp: 0, control: 0, healBlock: false, teamStat: 0, teamRequirement: "", selfPerAlly: 0, selfRequirement: "", recognized: 0, passiveCount: 0,
    effectiveInBackup: false, backupBoosts: { atk: 0, def: 0, hp: 0, damage: 0, reduction: 0 }, backupRequirement: "", backupPassiveLabel: "", passiveLabel: ""
  };
  const hp = Number(snapshot.hp);
  return {
    id: String(id), name: simulatorUnitDisplayName(unit), title: unit.title, unit, slot, profile, maxTalents,
    atk: Number(snapshot.atk), baseAtk: Number(snapshot.atk), def: Number(snapshot.def), maxHp: hp, hp,
    shield: 0, stunned: 0, healBlocked: 0, weak: 0, weakGauge: 0, weakCap: Number(unit.details?.hero?.weak_max) || 6,
    energy: 0, statuses: [], ruleState: {}, alive: true,
    damage: 0, healing: 0, damageTaken: 0, kills: 0
  };
}

function simulatorBuildTeam(source, side, includeKits) {
  const members = source.ids.map((id, index) => makeSimulatorCombatant(id, "", index, includeKits, Boolean(source.maxTalents?.[index]))).filter(Boolean);
  members.forEach(member => { member.side = side; });
  const active = members.filter(member => member.slot < 4);
  const bench = members.filter(member => member.slot === 4);
  const all = [...active, ...bench];
  const team = { side, name: source.name, active, bench, all, cp: simulatorTeamCp(source).total, backupPending: false, backupReadyRound: 0, backupSlot: -1 };
  if (includeKits) {
    simulatorApplyStaticPassives(team);
    const backupEffectProviders = all.filter(provider => provider.profile.effectiveInBackup);
    all.forEach(member => {
      backupEffectProviders.forEach(provider => {
        if (!provider.profile.effectiveInBackup || !simulatorRequirementMatches(member.unit, provider.profile.backupRequirement)) return;
        const boosts = provider.profile.backupBoosts || {};
        member.atk *= 1 + Math.min(0.35, Number(boosts.atk) || 0);
        member.def *= 1 + Math.min(0.35, Number(boosts.def) || 0);
        member.maxHp *= 1 + Math.min(0.35, Number(boosts.hp) || 0);
        member.profile.outgoingAmp = Math.min(0.5, member.profile.outgoingAmp + (Number(boosts.damage) || 0));
        member.profile.reduction = Math.min(0.5, member.profile.reduction + (Number(boosts.reduction) || 0));
      });
      member.hp = member.maxHp;
    });
  }
  simulatorApplySlotAttackPriority(team);
  return team;
}

function simulatorApplySlotAttackPriority(team) {
  const onField = team.active.filter(member => member?.alive);
  if (!onField.length) return;
  const teamMaximum = Math.max(...team.all.map(member => Number(member.atk) || 0), 1);
  team.slotAttackTargets = {};
  onField.forEach(member => {
    const slot = Math.max(0, Math.min(3, Number(member.slot) || 0));
    const targetAtk = teamMaximum * (1 + SIMULATOR_SLOT_ATTACK_PREMIUMS[slot]);
    member.naturalInitialAtk = member.atk;
    member.atk = Math.max(member.atk, targetAtk);
    member.baseAtk = member.atk;
    member.slotAttackPriority = slot + 1;
    team.slotAttackTargets[slot] = member.atk;
  });
}

function simulatorBringBackup(team, log, round, deploy = false) {
  if (!team.bench.length) return false;
  const defeatedIndex = team.backupSlot >= 0
    ? team.backupSlot
    : team.active.findIndex(member => !member.alive || member.hp <= 0);
  if (defeatedIndex < 0) return false;
  if (!deploy) {
    if (!team.backupPending) {
      team.backupPending = true;
      team.backupReadyRound = round + 1;
      team.backupSlot = defeatedIndex;
    }
    return false;
  }
  if (!team.backupPending || round < team.backupReadyRound) return false;
  const backup = team.bench.shift();
  const inheritedAtk = Number(team.slotAttackTargets?.[team.backupSlot]) || 0;
  backup.atk = Math.max(backup.atk, inheritedAtk);
  backup.baseAtk = backup.atk;
  backup.slotAttackPriority = team.backupSlot + 1;
  team.active[team.backupSlot] = backup;
  team.backupPending = false;
  team.backupReadyRound = 0;
  team.backupSlot = -1;
  if (log) log.push({
    round, side: team.side, actorId: backup.id, kind: "backup", actionType: "Backup Entry", targetIds: [],
    text: `${backup.name} enters the field from the Backup Slot at the start of Turn ${round}.`
  });
  return true;
}

function simulatorOpeningPassiveLog(team, log) {
  if (!log) return;
  team.all.forEach(member => {
    const fromBackup = member.slot === 4;
    const profile = member.profile;
    const activeRules = (profile.passiveRules || []).filter(rule => rule.staticAura && (!fromBackup || rule.backupEffective));
    activeRules.forEach(rule => simulatorPassiveLog(log, 0, team, member, rule,
      `${member.name} activates ${rule.name}${fromBackup ? " while waiting in the Backup Slot" : " as an On Field aura"}.`,
      fromBackup ? "Backup Passive" : "Passive Aura", fromBackup ? "backup" : "passive"));
    if (fromBackup && profile.effectiveInBackup && !activeRules.length) {
      log.push({ round: 0, side: team.side, actorId: member.id, kind: "backup", actionType: "Backup Passive", targetIds: [], text: `${member.name} activates ${profile.backupPassiveLabel} while waiting in the Backup Slot.` });
    }
  });
}

function simulatorBattle(leftSource, rightSource, seed, maxRounds, includeKits, captureLog = false) {
  const random = simulatorRandom(seed);
  const left = simulatorBuildTeam(leftSource, "A", includeKits);
  const right = simulatorBuildTeam(rightSource, "B", includeKits);
  const log = captureLog ? [] : null;
  // Resolve every global phase in actual first-action order. Previously these
  // phases always ran left-to-right, which gave My Team a hidden advantage when
  // passives on both teams competed at battle/turn boundaries.
  const first = left.cp === right.cp ? (random() < 0.5 ? left : right) : (left.cp > right.cp ? left : right);
  const second = first === left ? right : left;
  const priorityOrder = [[first, second], [second, first]];
  if (includeKits) {
    simulatorOpeningPassiveLog(first, log);
    simulatorOpeningPassiveLog(second, log);
    priorityOrder.forEach(([team, enemyTeam]) => {
      simulatorFirePassives("battle-start", team, enemyTeam, { sourceIsCard: false, triggerDepth: 0 }, random, log, 0);
    });
  }
  let turn = 0;
  for (turn = 1; turn <= maxRounds; turn++) {
    for (const [acting, defending] of priorityOrder) {
      simulatorBringBackup(acting, log, turn, true);
      if (includeKits) simulatorFirePassives("turn-start", acting, defending, { sourceIsCard: false, triggerDepth: 0 }, random, log, turn);
      // Each side turn selects at most three primary command cards. Passive-
      // forced skills and pursuits remain extra actions and consume no card.
      const actors = [...simulatorLiving(acting)]
        .sort((a, b) => simulatorEffectiveAtk(b) - simulatorEffectiveAtk(a) || random() - 0.5)
        .slice(0, 3);
      for (const actor of actors) {
        if (!simulatorLiving(defending).length) break;
        simulatorAct(actor, acting, defending, random, log, turn);
      }
      if (includeKits) simulatorFirePassives("turn-end", acting, defending, { sourceIsCard: false, triggerDepth: 0 }, random, log, turn);
      if (!simulatorLiving(defending).length && !defending.bench.length) break;
    }
    if (includeKits) {
      simulatorTickStatuses(left);
      simulatorTickStatuses(right);
    }
    if ((!simulatorLiving(left).length && !left.bench.length) || (!simulatorLiving(right).length && !right.bench.length)) break;
  }
  const leftHp = simulatorRemaining(left);
  const rightHp = simulatorRemaining(right);
  const totalHp = leftHp + rightHp || 1;
  const gap = Math.abs(leftHp - rightHp) / totalHp;
  const winner = gap < 0.005 ? "draw" : leftHp > rightHp ? "A" : "B";
  const unitStats = team => team.all.map(member => ({
    id: member.id, slot: member.slot, name: member.name, image: member.unit.image,
    damage: member.damage, healing: member.healing, damageTaken: member.damageTaken,
    survived: member.alive, hp: member.hp, maxHp: member.maxHp, kills: member.kills
  }));
  return {
    winner, rounds: Math.min(turn, maxRounds), first: first.side,
    leftHp, rightHp,
    leftSurvivors: left.all.filter(member => member.alive).length,
    rightSurvivors: right.all.filter(member => member.alive).length,
    leftDamage: left.all.reduce((sum, member) => sum + member.damage, 0),
    rightDamage: right.all.reduce((sum, member) => sum + member.damage, 0),
    leftMaxHp: left.all.reduce((sum, member) => sum + member.maxHp, 0),
    rightMaxHp: right.all.reduce((sum, member) => sum + member.maxHp, 0),
    leftUnits: unitStats(left), rightUnits: unitStats(right), log: log || []
  };
}

function simulatorNormalizeMirroredBattle(battle) {
  const swapSide = side => side === "A" ? "B" : side === "B" ? "A" : side;
  return {
    ...battle,
    winner: swapSide(battle.winner),
    first: swapSide(battle.first),
    leftHp: battle.rightHp,
    rightHp: battle.leftHp,
    leftSurvivors: battle.rightSurvivors,
    rightSurvivors: battle.leftSurvivors,
    leftDamage: battle.rightDamage,
    rightDamage: battle.leftDamage,
    leftMaxHp: battle.rightMaxHp,
    rightMaxHp: battle.leftMaxHp,
    leftUnits: battle.rightUnits,
    rightUnits: battle.leftUnits,
    log: (battle.log || []).map(entry => ({ ...entry, side: swapSide(entry.side) }))
  };
}

function simulatorBattleLineup(source, side) {
  const battleSide = side === "enemy" ? "B" : "A";
  return `<div class="quick-lineup ${side}" data-battle-side="${battleSide}">${source.ids.map((id, index) => {
    const unit = simulatorUnit(id);
    return unit ? `<div class="quick-combatant${index === 4 ? " is-backup is-waiting" : ""}" data-battle-side="${battleSide}" data-battle-unit="${escapeHtml(String(id))}"><div class="quick-unit-fx"></div>${index === 4 ? `<small class="quick-position-label">BACKUP</small>` : ""}<small class="quick-atk-priority">${index === 4 ? "INHERITS ATK ORDER" : `ATK #${index + 1}`}</small><img src="${escapeHtml(unit.image)}" alt=""><span>${escapeHtml(simulatorUnitDisplayName(unit))}</span><i class="quick-unit-health"><b></b></i><em class="quick-unit-dead-label">DEAD</em></div>` : "";
  }).join("")}</div>`;
}

function showSimulatorBattleStart(leftSource, rightSource) {
  document.querySelector("#simulator-results").innerHTML = `
    <div class="quick-battle-start">
      <p>QUICK SIMULATING</p><h3>BATTLE START</h3><span>Battle 1 is in progress, please wait for the result...</span>
      <div class="quick-stage-lineups">
        <section><strong>MY TEAM</strong>${simulatorBattleLineup(leftSource, "ally")}</section>
        <div><b id="quick-battle-round">1</b><small>TURN</small></div>
        <section><strong>ENEMY TEAM</strong>${simulatorBattleLineup(rightSource, "enemy")}</section>
      </div>
      <section id="quick-turn-cards" class="quick-turn-cards is-waiting">
        <div class="quick-turn-card-team side-a"><header><span>MY TEAM</span><strong>3 CARDS</strong></header><div class="quick-turn-card-row"><i></i><i></i><i></i></div></div>
        <div class="quick-turn-card-vs"><b>VS</b><small>TURN 1</small></div>
        <div class="quick-turn-card-team side-b"><header><span>ENEMY TEAM</span><strong>3 CARDS</strong></header><div class="quick-turn-card-row"><i></i><i></i><i></i></div></div>
      </section>
      <div class="quick-action-callout"><div><em id="quick-action-tag" class="action-ready">READY</em><strong id="quick-action-title">Reading Auto priorities...</strong></div><span id="quick-action-rule">Building the opening hand and checking valid targets.</span></div>
      <div class="quick-loading"><i></i></div>
    </div>`;
}

function simulatorEmptyUnitTotals(source) {
  return source.ids.map((id, slot) => {
    const unit = simulatorUnit(id);
    return { id: String(id), slot, name: simulatorUnitDisplayName(unit), image: unit?.image || "", damage: 0, healing: 0, damageTaken: 0, survived: 0, kills: 0 };
  });
}

function simulatorBattleNode(side, id) {
  const unitId = String(id).replace(/[^0-9A-Za-z_-]/g, "");
  return document.querySelector(`.quick-battle-start .quick-combatant[data-battle-side="${side}"][data-battle-unit="${unitId}"]`);
}

function simulatorTurnCardKey(entry) {
  return `${entry.round}:${entry.side}`;
}

function simulatorTurnCardGroups(log) {
  const groups = new Map();
  log.filter(entry => entry.cardAction && entry.actorId && entry.round > 0).forEach(entry => {
    const key = simulatorTurnCardKey(entry);
    if (!groups.has(key)) groups.set(key, []);
    const cards = groups.get(key);
    if (cards.length < 3) cards.push(entry);
  });
  return groups;
}

function simulatorRenderTurnCards(entry, groups, playbackState) {
  const host = document.querySelector("#quick-turn-cards");
  if (!host) return;
  if (playbackState.round !== entry.round) {
    playbackState.round = entry.round;
    playbackState.indices = { A: 0, B: 0 };
  }
  if (entry.cardAction) {
    const cards = groups.get(simulatorTurnCardKey(entry)) || [];
    const cardIndex = cards.indexOf(entry);
    if (cardIndex >= 0) playbackState.indices[entry.side] = cardIndex;
  }
  const extra = !entry.cardAction;
  const teamMarkup = side => {
    const cards = groups.get(`${entry.round}:${side}`) || [];
    const activeIndex = Math.max(0, Math.min(playbackState.indices[side] || 0, Math.max(0, cards.length - 1)));
    const isActing = entry.side === side;
    const cardMarkup = Array.from({ length: 3 }, (_, index) => {
      const card = cards[index];
      if (!card) return `<article class="quick-turn-card is-empty"><span>EMPTY</span></article>`;
      const unit = simulatorUnit(card.actorId);
      const name = simulatorUnitDisplayName(unit);
      const level = Math.max(0, Math.min(3, Number(card.level) || 0));
      const state = index < activeIndex ? "is-done" : isActing && index === activeIndex ? "is-now" : isActing && index === activeIndex + 1 ? "is-next" : "is-queued";
      const label = index < activeIndex ? "DONE" : isActing && index === activeIndex ? "NOW" : isActing && index === activeIndex + 1 ? "NEXT" : `CARD ${index + 1}`;
      return `<article class="quick-turn-card ${state}" title="${escapeHtml(name)}">
        <small>${label}</small><img src="${escapeHtml(unit?.image || "")}" alt=""><span>${escapeHtml(name)}</span>
        <b>${level ? `Lv.${level} <em>${"★".repeat(level)}</em>` : "BLOCKED"}</b>
      </article>`;
    }).join("");
    const label = side === "A" ? "MY TEAM" : "ENEMY TEAM";
    const actionLabel = isActing ? (extra ? "EXTRA ACTION" : "ACTING") : "WAITING";
    return `<div class="quick-turn-card-team side-${side.toLowerCase()}${isActing ? " is-acting" : ""}"><header><span>${label}</span><strong>${actionLabel}</strong></header><div class="quick-turn-card-row">${cardMarkup}</div></div>`;
  };
  host.className = `quick-turn-cards active-${entry.side.toLowerCase()}${extra ? " has-extra-action" : ""}`;
  host.innerHTML = `${teamMarkup("A")}<div class="quick-turn-card-vs"><b>VS</b><small>TURN ${entry.round}</small></div>${teamMarkup("B")}`;
}

function simulatorAnimateAction(entry, cardGroups, cardState) {
  document.querySelectorAll(".quick-combatant.is-attacking, .quick-combatant.is-hit, .quick-combatant.is-healed, .quick-combatant.is-buffed, .quick-combatant.is-controlled, .quick-combatant.is-entering")
    .forEach(node => node.classList.remove("is-attacking", "is-hit", "is-healed", "is-buffed", "is-controlled", "is-entering"));
  const attacker = simulatorBattleNode(entry.side, entry.actorId);
  const offensiveKinds = new Set(["attack", "triggered", "follow-up"]);
  if (offensiveKinds.has(entry.kind)) attacker?.classList.add("is-attacking");
  const defendingSide = entry.side === "A" ? "B" : "A";
  if (offensiveKinds.has(entry.kind)) {
    (entry.targetIds || []).forEach(id => simulatorBattleNode(defendingSide, id)?.classList.add("is-hit"));
  }
  (entry.defeatedIds || []).forEach(id => simulatorBattleNode(defendingSide, id)?.classList.add("is-defeated"));
  simulatorRenderTurnCards(entry, cardGroups, cardState);
  const round = document.querySelector("#quick-battle-round");
  const title = document.querySelector("#quick-action-title");
  const rule = document.querySelector("#quick-action-rule");
  const tag = document.querySelector("#quick-action-tag");
  if (round) round.textContent = entry.round > 0 ? String(entry.round) : "PRE";
  if (title) title.textContent = entry.text;
  if (tag) {
    tag.className = `action-${String(entry.kind || "status").replace(/[^a-z-]/gi, "").toLowerCase()}`;
    tag.textContent = entry.actionType || "Battle Event";
  }
  if (rule) rule.textContent = entry.ruleLabel
    ? `${entry.ruleLabel} · ${entry.rule} · ${entry.order} — ${entry.reason}`
    : entry.kind === "passive" ? "A configured passive effect is applied to the team."
    : entry.kind === "backup" ? "Backup deployment occurs at the start of the turn after an On Field ally is defeated."
    : entry.kind === "follow-up" ? "The unit's configured pursuit effect triggered after its Active Skill."
    : "A control effect prevents this unit from acting.";
}

function simulatorPlaybackActions(log, limit = 36) {
  const entries = log.filter(entry => entry.actorId && entry.round > 0);
  const combatKinds = new Set(["attack", "triggered", "follow-up"]);
  return entries.filter(entry => combatKinds.has(entry.kind)).slice(0, limit);
}

function finishBattleSimulatorPlayback(result, token) {
  if (token !== battleSimulatorState.playbackToken) return;
  const leftRate = result.totals.A / battleSimulatorState.runs * 100;
  const rightRate = result.totals.B / battleSimulatorState.runs * 100;
  const winner = leftRate === rightRate ? "draw" : leftRate > rightRate ? "A" : "B";
  const arena = document.querySelector(".quick-battle-start");
  arena?.classList.add(winner === "A" ? "winner-a" : winner === "B" ? "winner-b" : "winner-draw");
  const title = document.querySelector("#quick-action-title");
  const rule = document.querySelector("#quick-action-rule");
  const tag = document.querySelector("#quick-action-tag");
  if (title) title.textContent = winner === "A" ? "MY TEAM — VICTORY" : winner === "B" ? "ENEMY TEAM — VICTORY" : "BATTLE DRAW";
  if (rule) rule.textContent = `Modeled result after ${battleSimulatorState.runs.toLocaleString()} simulations.`;
  if (tag) { tag.className = "action-result"; tag.textContent = "RESULT"; }
  battleSimulatorState.runTimer = setTimeout(() => {
    if (token !== battleSimulatorState.playbackToken) return;
    renderBattleSimulatorResults();
    const runButton = document.querySelector("#simulator-run");
    runButton.disabled = false;
    runButton.textContent = "Battle";
    document.querySelector("#simulator-populate").disabled = false;
    document.querySelector("#simulator-max-investment").disabled = false;
    document.querySelectorAll("[data-simulator-talents-side]").forEach(input => { input.disabled = false; });
    battleSimulatorState.runTimer = null;
  }, BATTLE_SIMULATOR_PLAYBACK_TIMING.resultDelay);
}

function playBattleSimulatorSample(result) {
  const token = ++battleSimulatorState.playbackToken;
  const actions = simulatorPlaybackActions(result.sample.log);
  const cardGroups = simulatorTurnCardGroups(result.sample.log);
  const cardState = { round: 0, indices: { A: 0, B: 0 } };
  if (!actions.length) {
    finishBattleSimulatorPlayback(result, token);
    return;
  }
  let index = 0;
  const playNext = () => {
    if (token !== battleSimulatorState.playbackToken) return;
    if (index >= actions.length) {
      finishBattleSimulatorPlayback(result, token);
      return;
    }
    simulatorAnimateAction(actions[index++], cardGroups, cardState);
    battleSimulatorState.runTimer = setTimeout(playNext, BATTLE_SIMULATOR_PLAYBACK_TIMING.actionDelay);
  };
  playNext();
}

function executeBattleSimulator(leftSource, rightSource) {
  const totals = {
    A: 0, B: 0, draw: 0, rounds: 0, leftHp: 0, rightHp: 0, leftSurvivors: 0, rightSurvivors: 0, leftDamage: 0, rightDamage: 0,
    leftUnits: simulatorEmptyUnitTotals(leftSource), rightUnits: simulatorEmptyUnitTotals(rightSource)
  };
  let sample = null;
  for (let index = 0; index < battleSimulatorState.runs; index++) {
    // Use the same seed for each normal/mirrored pair. Mapping the mirrored
    // result back to the user's original teams makes the Monte Carlo estimate
    // invariant to which team is displayed on the left side.
    const pairIndex = Math.floor(index / 2);
    const mirrored = index % 2 === 1;
    const pairSeed = battleSimulatorState.seed + pairIndex * 7919;
    const rawBattle = mirrored
      ? simulatorBattle(rightSource, leftSource, pairSeed, battleSimulatorState.maxRounds, battleSimulatorState.includeKits, false)
      : simulatorBattle(leftSource, rightSource, pairSeed, battleSimulatorState.maxRounds, battleSimulatorState.includeKits, index === 0);
    const battle = mirrored ? simulatorNormalizeMirroredBattle(rawBattle) : rawBattle;
    totals[battle.winner]++;
    totals.rounds += battle.rounds;
    totals.leftHp += battle.leftHp / Math.max(1, battle.leftMaxHp);
    totals.rightHp += battle.rightHp / Math.max(1, battle.rightMaxHp);
    totals.leftSurvivors += battle.leftSurvivors;
    totals.rightSurvivors += battle.rightSurvivors;
    totals.leftDamage += battle.leftDamage;
    totals.rightDamage += battle.rightDamage;
    battle.leftUnits.forEach((unit, slot) => {
      totals.leftUnits[slot].damage += unit.damage;
      totals.leftUnits[slot].healing += unit.healing;
      totals.leftUnits[slot].damageTaken += unit.damageTaken;
      totals.leftUnits[slot].survived += unit.survived ? 1 : 0;
      totals.leftUnits[slot].kills += unit.kills;
    });
    battle.rightUnits.forEach((unit, slot) => {
      totals.rightUnits[slot].damage += unit.damage;
      totals.rightUnits[slot].healing += unit.healing;
      totals.rightUnits[slot].damageTaken += unit.damageTaken;
      totals.rightUnits[slot].survived += unit.survived ? 1 : 0;
      totals.rightUnits[slot].kills += unit.kills;
    });
    if (index === 0) sample = battle;
  }
  battleSimulatorState.result = { totals, sample, leftSource, rightSource };
  playBattleSimulatorSample(battleSimulatorState.result);
}

function runBattleSimulator() {
  const leftSource = simulatorSourceTeam("left");
  const rightSource = simulatorSourceTeam("right");
  if (leftSource.ids.filter(Boolean).length !== 5 || rightSource.ids.filter(Boolean).length !== 5) {
    document.querySelector("#simulator-results").innerHTML = `<div class="simulator-empty warning"><strong>Complete both five-unit teams</strong><p>Every slot on My Team and Enemy Team must be filled before Quick Battle can begin.</p></div>`;
    return;
  }
  if (battleSimulatorState.runTimer) clearTimeout(battleSimulatorState.runTimer);
  const runButton = document.querySelector("#simulator-run");
  runButton.disabled = true;
  runButton.textContent = "Quick Simulating...";
  document.querySelector("#simulator-populate").disabled = true;
  document.querySelector("#simulator-max-investment").disabled = true;
  document.querySelectorAll("[data-simulator-talents-side]").forEach(input => { input.disabled = true; });
  showSimulatorBattleStart(leftSource, rightSource);
  requestAnimationFrame(() => document.querySelector("#simulator-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  battleSimulatorState.runTimer = setTimeout(() => executeBattleSimulator(leftSource, rightSource), BATTLE_SIMULATOR_PLAYBACK_TIMING.startDelay);
}

function simulatorStatRows(units, side) {
  const averaged = units.map(unit => ({
    ...unit,
    damage: unit.damage / battleSimulatorState.runs,
    healing: unit.healing / battleSimulatorState.runs,
    damageTaken: unit.damageTaken / battleSimulatorState.runs,
    survival: unit.survived / battleSimulatorState.runs * 100,
    kills: unit.kills / battleSimulatorState.runs
  }));
  const maxDamage = Math.max(1, ...averaged.map(unit => unit.damage));
  const maxHealing = Math.max(1, ...averaged.map(unit => unit.healing));
  const maxTaken = Math.max(1, ...averaged.map(unit => unit.damageTaken));
  const mvpScore = unit => unit.damage + unit.healing * 0.8 + unit.kills * 100000;
  const mvp = [...averaged].sort((a, b) => mvpScore(b) - mvpScore(a))[0];
  return averaged.map(unit => `<article class="simulator-stat-row ${side}">
    <div class="simulator-stat-unit"><img src="${escapeHtml(unit.image)}" alt=""><span>${unit === mvp ? "MVP" : unit.slot === 4 ? "BACKUP" : `S${unit.slot + 1}`}</span><strong>${escapeHtml(unit.name)}</strong></div>
    <div><b>${formatNumber(Math.round(unit.damage))}</b><i><span style="width:${unit.damage / maxDamage * 100}%"></span></i><small>DMG DEALT</small></div>
    <div><b>${formatNumber(Math.round(unit.healing))}</b><i><span style="width:${unit.healing / maxHealing * 100}%"></span></i><small>HEALING</small></div>
    <div><b>${formatNumber(Math.round(unit.damageTaken))}</b><i><span style="width:${unit.damageTaken / maxTaken * 100}%"></span></i><small>DMG TAKEN</small></div>
    <em>${unit.survival.toFixed(0)}% survive</em>
  </article>`).join("");
}

function simulatorLogEntryMarkup(entry) {
  const unit = simulatorUnit(entry.actorId);
  const kind = String(entry.kind || "status").replace(/[^a-z-]/gi, "").toLowerCase();
  const teamLabel = entry.side === "A" ? "MY TEAM" : "ENEMY TEAM";
  const turnLabel = entry.round > 0 ? `TURN ${entry.round}` : "PRE-BATTLE";
  const detail = entry.passiveName
    ? `${entry.passiveName}${entry.passiveId ? ` · ${entry.passiveId}` : ""}${entry.passiveText ? ` — ${entry.passiveText}` : ""}`
    : entry.ruleLabel
    ? `${entry.ruleLabel} · ${entry.rule} · ${entry.order} — ${entry.reason}`
    : entry.kind === "passive" ? "This configured passive is active for the team, including from Backup when stated in its description."
    : entry.kind === "backup" ? "The Backup enters at the start of the next turn after an On Field unit is defeated."
    : entry.kind === "follow-up" ? "A configured pursuit effect triggered after the Active Skill."
    : "The unit was unable to take its action.";
  return `<article class="simulator-log-entry side-${entry.side.toLowerCase()} action-${kind}">
    <img src="${escapeHtml(unit?.image || "")}" alt="">
    <div><header><span>${turnLabel} · ${teamLabel}</span><em class="simulator-action-tag action-${kind}">${escapeHtml(entry.actionType || "Battle Event")}</em></header>
      <strong>${escapeHtml(entry.text)}</strong><small>${escapeHtml(detail)}</small>
    </div>
  </article>`;
}

function renderBattleSimulatorResults() {
  const result = battleSimulatorState.result;
  if (!result) return;
  const { totals, sample, leftSource, rightSource } = result;
  const leftRate = totals.A / battleSimulatorState.runs * 100;
  const rightRate = totals.B / battleSimulatorState.runs * 100;
  const drawRate = totals.draw / battleSimulatorState.runs * 100;
  const allyResult = leftRate === rightRate ? "DRAW" : leftRate > rightRate ? "VICTORY" : "DEFEAT";
  const enemyResult = allyResult === "VICTORY" ? "DEFEAT" : allyResult === "DEFEAT" ? "VICTORY" : "DRAW";
  const leftCp = simulatorTeamCp(leftSource).total;
  const rightCp = simulatorTeamCp(rightSource).total;
  const coverageSource = { ids: [...leftSource.ids, ...rightSource.ids], maxTalents: [...leftSource.maxTalents, ...rightSource.maxTalents] };
  const coverage = simulatorKitCoverage(coverageSource);
  const coverageRate = coverage.passives ? (coverage.modeled + coverage.partial * 0.5) / coverage.passives : 0;
  const confidence = coverageRate >= 0.75 ? "MEDIUM-HIGH" : coverageRate >= 0.45 ? "MEDIUM" : "LOW";
  const firstTeam = leftCp === rightCp ? "Seeded tie-break" : leftCp > rightCp ? "My Team" : "Enemy Team";
  const winnerClass = allyResult === "VICTORY" ? "winner-ally" : allyResult === "DEFEAT" ? "winner-enemy" : "winner-draw";
  const winnerTitle = allyResult === "VICTORY" ? "MY TEAM WINS" : allyResult === "DEFEAT" ? "ENEMY TEAM WINS" : "BATTLE DRAW";
  const allyOutcomeClass = allyResult === "VICTORY" ? "is-winner" : allyResult === "DEFEAT" ? "is-loser" : "is-draw";
  const enemyOutcomeClass = enemyResult === "VICTORY" ? "is-winner" : enemyResult === "DEFEAT" ? "is-loser" : "is-draw";
  document.querySelector("#simulator-results").innerHTML = `
    <section class="quick-result-board ${winnerClass}">
      <div class="simulator-victory-stamp">${winnerTitle}</div>
      <header><span>QUICK BATTLE RESULT</span><h3>${winnerTitle}</h3><p>${battleSimulatorState.runs.toLocaleString()} side-balanced simulations · 4 On Field + 1 Backup · seed ${battleSimulatorState.seed}${battleSimulatorState.maxInvestment ? " · MAX INVESTMENT PROXY" : ""}</p></header>
      <div class="quick-result-lineups">
        <section class="ally ${allyOutcomeClass}"><em class="quick-side-outcome">${allyResult === "VICTORY" ? "WINNER" : allyResult === "DEFEAT" ? "DEFEATED" : "DRAW"}</em><strong>MY TEAM · ${formatNumber(leftCp)} CP</strong>${simulatorBattleLineup(leftSource, "ally")}</section>
        <div><b>${winnerTitle}</b><span>1</span><small>ROUND</small></div>
        <section class="enemy ${enemyOutcomeClass}"><em class="quick-side-outcome">${enemyResult === "VICTORY" ? "WINNER" : enemyResult === "DEFEAT" ? "DEFEATED" : "DRAW"}</em><strong>ENEMY TEAM · ${formatNumber(rightCp)} CP</strong>${simulatorBattleLineup(rightSource, "enemy")}</section>
      </div>
      <div class="simulator-win-bars"><div class="simulator-win-labels"><strong>My Team ${leftRate.toFixed(1)}%</strong><span>Draw ${drawRate.toFixed(1)}%</span><strong>Enemy ${rightRate.toFixed(1)}%</strong></div><div class="simulator-win-track"><span class="a" style="width:${leftRate}%"></span><span class="draw" style="width:${drawRate}%"></span><span class="b" style="width:${rightRate}%"></span></div></div>
    </section>
    <section class="quick-statistics">
      <header><div><span>Statistics</span><small>Average per-unit results across all simulations</small></div><em class="simulator-confidence ${confidence.toLowerCase().replace(/[^a-z]+/g, "-")}">MODEL ${confidence}</em></header>
      <div class="quick-stat-headings"><div><b>${allyResult}</b><span>ALLY</span></div><strong>VS</strong><div><span>ENEMY</span><b>${enemyResult}</b></div></div>
      <div class="quick-stat-columns"><div>${simulatorStatRows(totals.leftUnits, "ally")}</div><div>${simulatorStatRows(totals.rightUnits, "enemy")}</div></div>
    </section>
    <div class="simulator-metrics">
      <div><span>First action</span><strong>${firstTeam}</strong></div><div><span>Average battle turns</span><strong>${simulatorAverage(totals.rounds).toFixed(1)}</strong></div>
      <div><span>My Team survivors</span><strong>${simulatorAverage(totals.leftSurvivors).toFixed(1)}</strong></div><div><span>Enemy survivors</span><strong>${simulatorAverage(totals.rightSurvivors).toFixed(1)}</strong></div>
    </div>
    <details class="simulator-sample-log" open><summary>Battle action log, passive triggers, and Auto AI decisions</summary><div>${sample.log.slice(0, 220).map(simulatorLogEntryMarkup).join("")}</div></details>
    <details class="simulator-kit-coverage"><summary>Skill/passive/Orb/Talent coverage: ${coverage.modeled} modeled · ${coverage.partial} partial · ${coverage.unmodeled} not yet reproducible</summary>
      <p class="simulator-coverage-note">Fairness control: each random seed is evaluated as a normal/mirrored pair and mapped back to the original teams, removing any left/right screen-position or random-consumption advantage.</p>
      <p class="simulator-coverage-note">Every equipped natural-gift/rank passive, UR Ability Sphere, and enabled Max Talent is audited against its APK event chain. “Partial” means the trigger is reproduced but one or more exact runtime details (for example a named status, card-hand operation, or encrypted target condition) remain approximated.</p>
      <div class="simulator-coverage-grid">${simulatorCoverageMarkup(coverageSource.ids, coverageSource.maxTalents)}</div>
    </details>`;
}

function initializeBattleSimulator() {
  document.querySelector("#simulator-runs").value = String(battleSimulatorState.runs);
  document.querySelector("#simulator-rounds").value = String(battleSimulatorState.maxRounds);
  document.querySelector("#simulator-seed").value = String(battleSimulatorState.seed);
  document.querySelector("#simulator-kits").checked = battleSimulatorState.includeKits;
  document.querySelector("#simulator-max-investment").checked = battleSimulatorState.maxInvestment;
  document.querySelector("#simulator-investment-detail").hidden = !battleSimulatorState.maxInvestment;
  renderBattleSimulatorSetup();
}

/* Legacy single-banner simulator retained temporarily for comparison.
const CARNIVAL_FEATURED_IDS = ["1150", "1114", "1168", "1160", "1147", "1146", "1127", "1135", "1120", "1072", "1058", "1065", "1050"];
const CARNIVAL_STANDARD_SSR_IDS = ["1001", "1010", "1004", "1012", "1015", "1018", "1019", "1023", "1026", "1027", "1033", "1035", "1036", "1037", "1038", "1039", "1041", "1042", "1043", "1046", "1060", "1076"];
const CARNIVAL_ITEM_POOL = [
  { key: "star", name: "Panacean Star-Up Crystal", amount: 1, probability: 0.007 },
  { key: "refine", name: "Panacean Refinement Crystal", amount: 1, probability: 0.007 },
  { key: "token100", name: "Rainbow Token", amount: 100, probability: 0.005 },
  { key: "token30", name: "Rainbow Token", amount: 30, probability: 0.05 },
  { key: "token10", name: "Rainbow Token", amount: 10, probability: 0.30 },
  { key: "token5", name: "Rainbow Token", amount: 5, probability: 0.15 },
  { key: "potential4", name: "Lv.4 Random Potential", amount: 1, probability: 0.05 },
  { key: "witCell", name: "WIT Cell Casket", amount: 1, probability: 0.05 },
  { key: "potential3", name: "Lv.3 Random Potential", amount: 1, probability: 0.10 },
  { key: "booster500", name: "Ability Booster", amount: 500, probability: 0.10 },
  { key: "booster300", name: "Ability Booster", amount: 300, probability: 0.1314 }
];
const CARNIVAL_BONUS_POOL = [
  { key: "featured", name: "Featured character", amount: 1, probability: 0.30 },
  { key: "star", name: "Panacean Star-Up Crystal", amount: 1, probability: 0.24 },
  { key: "refine", name: "Panacean Refinement Crystal", amount: 1, probability: 0.16 },
  { key: "randomChest", name: "Carnival Random Chest · Erosion", amount: 1, probability: 0.30 }
];
const carnivalState = {
  featuredId: "1150", pulls: 0, progress: 0, featuredCopies: 0, otherSsr: 0,
  inventory: {}, recent: [], bonuses: []
};
let carnivalRevealTimer = null;

function carnivalWeightedRoll(pool) {
  let roll = Math.random();
  for (const item of pool) {
    roll -= item.probability;
    if (roll < 0) return item;
  }
  return pool[pool.length - 1];
}

function carnivalUnit(id) {
  return state.units.find(unit => String(unit.id) === String(id));
}

function addCarnivalInventory(item) {
  carnivalState.inventory[item.name] = (carnivalState.inventory[item.name] || 0) + Number(item.amount || 1);
}

function carnivalNormalRoll() {
  const roll = Math.random();
  if (roll < 0.01) {
    carnivalState.featuredCopies++;
    return { kind: "featured", name: carnivalUnit(carnivalState.featuredId)?.name || `Unit #${carnivalState.featuredId}`, amount: 1, probability: 0.01, unitId: carnivalState.featuredId };
  }
  if (roll < 0.0496) {
    const index = Math.min(CARNIVAL_STANDARD_SSR_IDS.length - 1, Math.floor((roll - 0.01) / 0.0018));
    const unitId = CARNIVAL_STANDARD_SSR_IDS[index];
    carnivalState.otherSsr++;
    return { kind: "ssr", name: carnivalUnit(unitId)?.name || `SSR Unit #${unitId}`, amount: 1, probability: 0.0018, unitId };
  }
  const item = carnivalWeightedRoll(CARNIVAL_ITEM_POOL.map(entry => ({ ...entry, probability: entry.probability / 0.9504 })));
  addCarnivalInventory(item);
  return { ...item, kind: "item" };
}

function claimCarnivalBonus() {
  const bonus = carnivalWeightedRoll(CARNIVAL_BONUS_POOL);
  const featured = carnivalUnit(carnivalState.featuredId);
  const result = { ...bonus, atPull: carnivalState.pulls };
  if (bonus.key === "featured") {
    carnivalState.featuredCopies++;
    result.name = featured ? `${featured.name} · ${featured.title}` : `Featured Unit #${carnivalState.featuredId}`;
    result.unitId = carnivalState.featuredId;
  } else addCarnivalInventory(bonus);
  carnivalState.bonuses.unshift(result);
  carnivalState.progress = 0;
}

function carnivalPullMany(count) {
  const featuredBefore = carnivalState.featuredCopies;
  const batch = [];
  for (let index = 0; index < count; index++) {
    carnivalState.pulls++;
    carnivalState.progress++;
    batch.push({ ...carnivalNormalRoll(), pull: carnivalState.pulls });
    if (carnivalState.progress === 100) claimCarnivalBonus();
  }
  carnivalState.recent = batch.slice(-10).reverse();
  renderCarnival();
  const featuredGained = carnivalState.featuredCopies - featuredBefore;
  if (featuredGained > 0) showCarnivalFeaturedReveal(featuredGained);
}

function carnivalResultMarkup(result) {
  const unit = result.unitId ? carnivalUnit(result.unitId) : null;
  return `<article class="carnival-result ${result.kind}">
    ${unit ? `<img src="${escapeHtml(unit.image)}" alt="">` : `<span class="carnival-result-icon">ITEM</span>`}
    <div><strong>${escapeHtml(result.name)}</strong><small>${result.amount > 1 ? `x${formatNumber(result.amount)} · ` : ""}Pull ${formatNumber(result.pull)}</small></div>
  </article>`;
}

function renderCarnivalFeatured() {
  const unit = carnivalUnit(carnivalState.featuredId);
  const card = document.querySelector("#carnival-featured-card");
  if (!unit || !card) return;
  card.innerHTML = `<img src="${escapeHtml(unit.image)}" alt=""><div><span>1.00% featured rate</span><h3>${escapeHtml(unit.name)}</h3><p>${escapeHtml(unit.title || `Unit #${unit.id}`)} · ${escapeHtml(unit.rarity)}</p></div>`;
}

function hideCarnivalFeaturedReveal() {
  clearTimeout(carnivalRevealTimer);
  const reveal = document.querySelector("#carnival-featured-reveal");
  if (reveal) reveal.hidden = true;
}

function showCarnivalFeaturedReveal(count) {
  const unit = carnivalUnit(carnivalState.featuredId);
  const reveal = document.querySelector("#carnival-featured-reveal");
  if (!unit || !reveal) return;
  clearTimeout(carnivalRevealTimer);
  document.querySelector("#carnival-reveal-image").src = unit.image;
  document.querySelector("#carnival-reveal-image").alt = unit.name;
  document.querySelector("#carnival-reveal-name").textContent = unit.name;
  document.querySelector("#carnival-reveal-title").textContent = `${unit.title || `Unit #${unit.id}`} · ${unit.rarity}`;
  document.querySelector("#carnival-reveal-count").textContent = count > 1 ? `${count} featured copies in this batch` : "Featured copy obtained";
  const particles = document.querySelector(".carnival-reveal-particles");
  particles.innerHTML = Array.from({ length: 20 }, (_, index) => `<i style="--particle:${index};--x:${Math.round(Math.random() * 180 - 90)}px;--y:${Math.round(Math.random() * -150 - 30)}px"></i>`).join("");
  reveal.hidden = false;
  reveal.classList.remove("reveal-active");
  void reveal.offsetWidth;
  reveal.classList.add("reveal-active");
  carnivalRevealTimer = setTimeout(hideCarnivalFeaturedReveal, 3200);
}

function renderCarnival() {
  const setText = (selector, value) => { const element = document.querySelector(selector); if (element) element.textContent = value; };
  setText("#carnival-pulls", formatNumber(carnivalState.pulls));
  setText("#carnival-tickets", formatNumber(carnivalState.pulls));
  setText("#carnival-diamonds", formatNumber(carnivalState.pulls * 600));
  setText("#carnival-featured-copies", formatNumber(carnivalState.featuredCopies));
  setText("#carnival-star-crystals", formatNumber(carnivalState.inventory["Panacean Star-Up Crystal"] || 0));
  setText("#carnival-refine-crystals", formatNumber(carnivalState.inventory["Panacean Refinement Crystal"] || 0));
  setText("#carnival-other-ssr", formatNumber(carnivalState.otherSsr));
  setText("#carnival-progress-text", `${carnivalState.progress} / 100`);
  document.querySelector("#carnival-progress-bar").style.width = `${carnivalState.progress}%`;
  document.querySelector("#carnival-featured").disabled = carnivalState.progress !== 0;
  renderCarnivalFeatured();
  document.querySelector("#carnival-results").innerHTML = carnivalState.recent.length
    ? carnivalState.recent.map(carnivalResultMarkup).join("")
    : `<p class="carnival-empty">Recruit to see the latest results.</p>`;
  const inventory = Object.entries(carnivalState.inventory).sort(([a], [b]) => a.localeCompare(b));
  document.querySelector("#carnival-inventory").innerHTML = inventory.length
    ? inventory.map(([name, amount]) => `<div><span>${escapeHtml(name)}</span><strong>${formatNumber(amount)}</strong></div>`).join("")
    : `<p class="carnival-empty">No resources obtained yet.</p>`;
  document.querySelector("#carnival-bonus-log").innerHTML = carnivalState.bonuses.length
    ? carnivalState.bonuses.map(bonus => `<div class="${bonus.key === "featured" ? "featured" : ""}"><span>Draw ${formatNumber(bonus.atPull)}</span><strong>${escapeHtml(bonus.name)}${bonus.amount > 1 ? ` ×${formatNumber(bonus.amount)}` : ""}</strong></div>`).join("")
    : `<p class="carnival-empty">Reach 100 draws to claim the first cumulative reward.</p>`;
}

function initializeCarnival() {
  const select = document.querySelector("#carnival-featured");
  if (!select || select.options.length) return renderCarnival();
  select.innerHTML = CARNIVAL_FEATURED_IDS.map(id => {
    const unit = carnivalUnit(id);
    return unit ? `<option value="${id}">${escapeHtml(unit.name)} · ${escapeHtml(unit.title || id)}</option>` : "";
  }).join("");
  select.value = carnivalState.featuredId;
  renderCarnival();
}

function resetCarnival() {
  hideCarnivalFeaturedReveal();
  Object.assign(carnivalState, { pulls: 0, progress: 0, featuredCopies: 0, otherSsr: 0, inventory: {}, recent: [], bonuses: [] });
  renderCarnival();
}
*/

let carnivalData = null;
let carnivalPlayerSample = null;
let carnivalRevealTimer = null;
const carnivalState = {
  bannerKey: "SeasonGachaTest18_1150", featuredId: "1150", pulls: 0, progress: 0, pendingClaim: false,
  featuredCopies: 0, otherSsr: 0, inventory: {}, selectedRewards: {}, recent: [], bonuses: [], history: [], historyFilter: "all",
  walletTickets: 100, walletDiamonds: 60000, ticketsSpent: 0, diamondsSpent: 0, payment: "tickets-first",
  status: "Set your wallet, then recruit."
};

function carnivalBanner() {
  return carnivalData?.banners.find(banner => banner.key === carnivalState.bannerKey) || carnivalData?.banners.at(-1);
}

function carnivalUnit(id) {
  return state.units.find(unit => String(unit.id) === String(id));
}

function carnivalWeightedRoll(pool, rng = Math.random) {
  let roll = rng();
  for (const item of pool) {
    roll -= Number(item.probability || 0);
    if (roll < 0) return item;
  }
  return pool[pool.length - 1];
}

function resolveCarnivalPotential(item, rng = Math.random) {
  const levelByCode = { "21129": 3, "21130": 4 };
  const level = levelByCode[String(item.code)];
  const families = carnivalData?.randomPotentialFamilies || [];
  if (!level || !families.length) return { ...item };
  const family = families[Math.min(families.length - 1, Math.floor(rng() * families.length))];
  return {
    ...item,
    parentName: item.name,
    potentialFamily: family,
    potentialLevel: level,
    name: `${family}Lv.${level}`
  };
}

function carnivalPool(kind) {
  const banner = carnivalBanner();
  const pool = kind === "bonus" ? banner.cumulativeRewards : [...banner.normalCharacters, ...banner.normalItems];
  return pool.map(item => item.kind === "featured" ? {
    ...item, code: carnivalState.featuredId,
    name: carnivalUnit(carnivalState.featuredId)?.name || `Hero #${carnivalState.featuredId}`,
    title: carnivalUnit(carnivalState.featuredId)?.title || ""
  } : { ...item });
}

function addCarnivalInventory(item) {
  carnivalState.inventory[item.name] = (carnivalState.inventory[item.name] || 0) + Number(item.amount || 1);
}

function carnivalCategory(item, source = "pull") {
  if (source === "cumulative" || source === "chest") return source;
  if (item.kind === "featured") return "featured";
  if (item.kind === "hero") return "ssr";
  if (["20059", "20203"].includes(String(item.code))) return "crystal";
  return "item";
}

function addCarnivalHistory(item, source, pull = carnivalState.pulls) {
  carnivalState.history.unshift({ ...item, source, category: carnivalCategory(item, source), pull, sequence: carnivalState.history.length + 1 });
}

function carnivalCanPay() {
  const cost = Number(carnivalBanner()?.diamondCost || 600);
  const hasTicket = carnivalState.walletTickets >= 1;
  const hasDiamonds = carnivalState.walletDiamonds >= cost;
  if (carnivalState.payment === "tickets-only") return hasTicket;
  if (carnivalState.payment === "diamonds-only") return hasDiamonds;
  return hasTicket || hasDiamonds;
}

function carnivalPayOne() {
  const cost = Number(carnivalBanner().diamondCost);
  const preferDiamonds = carnivalState.payment === "diamonds-first" || carnivalState.payment === "diamonds-only";
  const allowTickets = carnivalState.payment !== "diamonds-only";
  const allowDiamonds = carnivalState.payment !== "tickets-only";
  if (!preferDiamonds && allowTickets && carnivalState.walletTickets >= 1) {
    carnivalState.walletTickets--; carnivalState.ticketsSpent++; return true;
  }
  if (allowDiamonds && carnivalState.walletDiamonds >= cost) {
    carnivalState.walletDiamonds -= cost; carnivalState.diamondsSpent += cost; return true;
  }
  if (preferDiamonds && allowTickets && carnivalState.walletTickets >= 1) {
    carnivalState.walletTickets--; carnivalState.ticketsSpent++; return true;
  }
  return false;
}

function carnivalNormalRoll() {
  const result = carnivalWeightedRoll(carnivalPool("normal"));
  const resolved = result.kind === "item" ? resolveCarnivalPotential(result) : { ...result };
  const item = { ...resolved, unitId: ["featured", "hero"].includes(resolved.kind) ? resolved.code : undefined };
  if (item.kind === "featured") carnivalState.featuredCopies++;
  else if (item.kind === "hero") carnivalState.otherSsr++;
  else addCarnivalInventory(item);
  return item;
}

function carnivalPullMany(requestedCount) {
  if (!carnivalData) return;
  if (carnivalState.pendingClaim) {
    carnivalState.status = "Claim the 100-draw cumulative reward before recruiting again.";
    return renderCarnival();
  }
  const featuredBefore = carnivalState.featuredCopies;
  const allowed = Math.min(Number(requestedCount), 100 - carnivalState.progress);
  const batch = [];
  for (let index = 0; index < allowed; index++) {
    if (!carnivalPayOne()) break;
    carnivalState.pulls++;
    carnivalState.progress++;
    const result = { ...carnivalNormalRoll(), pull: carnivalState.pulls };
    batch.push(result);
    addCarnivalHistory(result, "pull", carnivalState.pulls);
    if (carnivalState.progress === 100) { carnivalState.pendingClaim = true; break; }
  }
  carnivalState.recent = batch.slice(-10).reverse();
  if (!batch.length) carnivalState.status = "Insufficient Carnival Tickets or diamonds for this payment method.";
  else if (carnivalState.pendingClaim) carnivalState.status = "100 draws reached. Claim the cumulative reward to reset progress.";
  else if (batch.length < requestedCount) carnivalState.status = `Recruited ${batch.length}; the wallet could not fund the remaining draws.`;
  else carnivalState.status = `Recruited ${batch.length} using ${carnivalState.payment.replace("-", " ")}.`;
  renderCarnival();
  const featuredGained = carnivalState.featuredCopies - featuredBefore;
  if (featuredGained > 0) showCarnivalFeaturedReveal(featuredGained);
}

function claimCarnivalBonus() {
  if (!carnivalState.pendingClaim) return;
  const result = { ...carnivalWeightedRoll(carnivalPool("bonus")), atPull: carnivalState.pulls };
  if (result.kind === "featured") { result.unitId = carnivalState.featuredId; carnivalState.featuredCopies++; }
  else addCarnivalInventory(result);
  carnivalState.bonuses.unshift(result);
  addCarnivalHistory(result, "cumulative", carnivalState.pulls);
  carnivalState.pendingClaim = false;
  carnivalState.progress = 0;
  carnivalState.status = `Cumulative reward claimed: ${result.name}${result.amount > 1 ? ` x${result.amount}` : ""}.`;
  renderCarnival();
  if (result.kind === "featured") showCarnivalFeaturedReveal(1);
}

function carnivalResultMarkup(result) {
  const unit = result.unitId ? carnivalUnit(result.unitId) : null;
  return `<article class="carnival-result ${result.kind}">${unit ? `<img src="${escapeHtml(unit.image)}" alt="">` : `<span class="carnival-result-icon">ITEM</span>`}<div><strong>${escapeHtml(result.name)}</strong><small>${result.amount > 1 ? `x${formatNumber(result.amount)} · ` : ""}Pull ${formatNumber(result.pull)}</small></div></article>`;
}

function renderCarnivalFeatured() {
  const unit = carnivalUnit(carnivalState.featuredId);
  const banner = carnivalBanner();
  const card = document.querySelector("#carnival-featured-card");
  if (!unit || !card || !banner) return;
  const rate = carnivalPool("normal").find(item => item.kind === "featured")?.probability || 0;
  card.innerHTML = `<img src="${escapeHtml(unit.image)}" alt=""><div><span>${(rate * 100).toFixed(2)}% featured rate</span><h3>${escapeHtml(unit.name)}</h3><p>${escapeHtml(unit.title || `Unit #${unit.id}`)} · ${escapeHtml(unit.rarity)}</p><small>${escapeHtml(banner.key)} · ${escapeHtml(banner.selectionChestName)}</small></div>`;
}

function hideCarnivalFeaturedReveal() {
  clearTimeout(carnivalRevealTimer);
  const reveal = document.querySelector("#carnival-featured-reveal");
  if (reveal) reveal.hidden = true;
}

function showCarnivalFeaturedReveal(count) {
  const unit = carnivalUnit(carnivalState.featuredId);
  const reveal = document.querySelector("#carnival-featured-reveal");
  if (!unit || !reveal) return;
  clearTimeout(carnivalRevealTimer);
  document.querySelector("#carnival-reveal-image").src = unit.image;
  document.querySelector("#carnival-reveal-image").alt = unit.name;
  document.querySelector("#carnival-reveal-name").textContent = unit.name;
  document.querySelector("#carnival-reveal-title").textContent = `${unit.title || `Unit #${unit.id}`} · ${unit.rarity}`;
  document.querySelector("#carnival-reveal-count").textContent = count > 1 ? `${count} featured copies in this batch` : "Featured copy obtained";
  document.querySelector(".carnival-reveal-particles").innerHTML = Array.from({ length: 20 }, (_, index) => `<i style="--particle:${index};--x:${Math.round(Math.random() * 180 - 90)}px;--y:${Math.round(Math.random() * -150 - 30)}px"></i>`).join("");
  reveal.hidden = false;
  reveal.classList.remove("reveal-active");
  void reveal.offsetWidth;
  reveal.classList.add("reveal-active");
  carnivalRevealTimer = setTimeout(hideCarnivalFeaturedReveal, 3200);
}

function carnivalHistoryMarkup(entry) {
  const unit = entry.unitId ? carnivalUnit(entry.unitId) : null;
  const source = ({ pull: "Normal pull", cumulative: "100-draw reward", chest: "Chest selection" })[entry.source] || entry.source;
  return `<article class="carnival-history-entry ${entry.category}">${unit ? `<img src="${escapeHtml(unit.image)}" alt="">` : `<span>${entry.kind === "item" ? "ITEM" : "SSR"}</span>`}<div><strong>${escapeHtml(entry.name)}${entry.amount > 1 ? ` x${formatNumber(entry.amount)}` : ""}</strong><small>${escapeHtml(source)} · Draw ${formatNumber(entry.pull)}</small></div></article>`;
}

function renderCarnivalHistory() {
  const matches = entry => ({
    all: true,
    featured: entry.kind === "featured",
    ssr: entry.kind === "hero" && entry.source === "pull",
    crystal: ["20059", "20203"].includes(String(entry.code)),
    item: entry.kind === "item" && entry.source === "pull",
    cumulative: entry.source === "cumulative",
    chest: entry.source === "chest"
  })[carnivalState.historyFilter] ?? true;
  const filtered = carnivalState.history.filter(matches);
  document.querySelector("#carnival-history-count").textContent = `${formatNumber(filtered.length)} of ${formatNumber(carnivalState.history.length)} entries`;
  document.querySelector("#carnival-history").innerHTML = filtered.length ? filtered.map(carnivalHistoryMarkup).join("") : `<p class="carnival-empty">No history entries match this filter.</p>`;
}

function renderCarnivalRates() {
  const banner = carnivalBanner();
  if (!banner) return;
  const normal = carnivalPool("normal");
  const bonus = carnivalPool("bonus");
  const formatRate = value => `${(Number(value) * 100).toFixed(Number(value) < .01 ? 2 : 1)}%`;
  document.querySelector("#carnival-rule-summary").textContent = `At 100 draws, claim one separately rolled reward: ${bonus.map(item => `${item.name} ${formatRate(item.probability)}`).join(" · ")}.`;
  const potentialNote = carnivalData.randomPotentialFamilies?.length
    ? `<p class="potential-note">Random Potential results resolve to ${carnivalData.randomPotentialFamilies.map(escapeHtml).join(", ")}. The simulator uses an equal sub-roll, supported by the supplied 300-pull sample.</p>`
    : "";
  document.querySelector("#carnival-rate-grid").innerHTML = `<div><h3>Normal character results</h3>${normal.filter(item => item.kind !== "item").map(item => `<p>${escapeHtml(item.name)}${item.title ? ` · ${escapeHtml(item.title)}` : ""}: ${formatRate(item.probability)}</p>`).join("")}</div><div><h3>Normal item results</h3>${normal.filter(item => item.kind === "item").map(item => `<p>${escapeHtml(item.name)}${item.amount > 1 ? ` x${formatNumber(item.amount)}` : ""}: ${formatRate(item.probability)}</p>`).join("")}${potentialNote}</div><div><h3>Cumulative reward · claim at 100</h3>${bonus.map(item => `<p>${escapeHtml(item.name)}${item.amount > 1 ? ` x${formatNumber(item.amount)}` : ""}: ${formatRate(item.probability)}</p>`).join("")}<p><strong>${banner.selectionChestChoices.length}</strong> choose-one chest options · ${escapeHtml(banner.ticketName)} or ${formatNumber(banner.diamondCost)} diamonds per draw.</p></div>`;
  renderCarnivalPlayerSample();
}

function renderCarnivalPlayerSample() {
  const container = document.querySelector("#carnival-player-sample");
  if (!container) return;
  const sample = carnivalPlayerSample;
  if (!sample || sample.bannerKey !== carnivalState.bannerKey) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const rate = value => `${(Number(value) * 100).toFixed(2)}%`;
  const metric = (label, observed, observedRate, configuredRate) => `<div><span>${escapeHtml(label)}</span><strong>${formatNumber(observed)} <small>${rate(observedRate)}</small></strong><em>APK ${rate(configuredRate)}</em></div>`;
  const featured = sample.comparison.featured;
  const star = sample.comparison["Panacean Star-Up Crystal x1"];
  const refine = sample.comparison["Panacean Refinement Crystal x1"];
  const families = Object.entries(sample.potentials.byFamily).map(([name, count]) => `${escapeHtml(name)} ${formatNumber(count)}`).join(" · ");
  container.innerHTML = `<header><div><p class="eyebrow">Real player validation</p><h3>${formatNumber(sample.sampleSize)} recorded pulls</h3></div><span>${escapeHtml(sample.obtainedAt)}</span></header><div class="carnival-sample-metrics">${metric("All SSR", sample.summary.totalSsr, sample.summary.observedSsrRate, sample.summary.configuredSsrRate)}${metric("Featured Haise", featured.observed, featured.observedRate, featured.configuredRate)}${metric("Star-Up Crystal", star.observed, star.observedRate, star.configuredRate)}${metric("Refinement Crystal", refine.observed, refine.observedRate, refine.configuredRate)}</div><p><strong>${formatNumber(sample.potentials.total)} named Potential results:</strong> ${families}.</p><small>The observed sample closely matches the configured table. It validates the model but does not redefine the APK rates; normal random variation is expected.</small>`;
}

function renderCarnival() {
  if (!carnivalData) return;
  const banner = carnivalBanner();
  const setText = (selector, value) => { const element = document.querySelector(selector); if (element) element.textContent = value; };
  setText("#carnival-pulls", formatNumber(carnivalState.pulls));
  setText("#carnival-tickets", formatNumber(carnivalState.walletTickets));
  setText("#carnival-diamonds", formatNumber(carnivalState.walletDiamonds));
  setText("#carnival-featured-copies", formatNumber(carnivalState.featuredCopies));
  setText("#carnival-star-crystals", formatNumber(carnivalState.inventory["Panacean Star-Up Crystal"] || 0));
  setText("#carnival-refine-crystals", formatNumber(carnivalState.inventory["Panacean Refinement Crystal"] || 0));
  setText("#carnival-other-ssr", formatNumber(carnivalState.otherSsr));
  setText("#carnival-progress-text", `${carnivalState.progress} / 100${carnivalState.pendingClaim ? " · CLAIM READY" : ""}`);
  setText("#carnival-spend-summary", `Spent: ${formatNumber(carnivalState.ticketsSpent)} tickets · ${formatNumber(carnivalState.diamondsSpent)} diamonds`);
  setText("#carnival-status", carnivalState.status);
  document.querySelector("#carnival-progress-bar").style.width = `${carnivalState.progress}%`;
  document.querySelector("#carnival-featured").disabled = carnivalState.progress !== 0 || carnivalState.pendingClaim;
  document.querySelector("#carnival-banner").disabled = carnivalState.progress !== 0 || carnivalState.pendingClaim;
  document.querySelector("#carnival-claim").hidden = !carnivalState.pendingClaim;
  document.querySelectorAll("[data-carnival-pulls]").forEach(button => button.disabled = carnivalState.pendingClaim || !carnivalCanPay());
  document.querySelector("#carnival-wallet-tickets").value = carnivalState.walletTickets;
  document.querySelector("#carnival-wallet-diamonds").value = carnivalState.walletDiamonds;
  document.querySelector("#carnival-payment").value = carnivalState.payment;
  renderCarnivalFeatured();
  document.querySelector("#carnival-results").innerHTML = carnivalState.recent.length ? carnivalState.recent.map(carnivalResultMarkup).join("") : `<p class="carnival-empty">Recruit to see the latest results.</p>`;
  const inventory = Object.entries(carnivalState.inventory).sort(([a], [b]) => a.localeCompare(b));
  const selectedRewards = Object.entries(carnivalState.selectedRewards).sort(([a], [b]) => a.localeCompare(b));
  document.querySelector("#carnival-inventory").innerHTML = inventory.length || selectedRewards.length ? `${inventory.map(([name, amount]) => `<div><span>${escapeHtml(name)}</span><strong>${formatNumber(amount)}</strong>${name === banner.selectionChestName ? `<button type="button" data-open-carnival-chest>Choose reward</button>` : ""}</div>`).join("")}${selectedRewards.map(([name, amount]) => `<div class="selected-reward"><span>${escapeHtml(name)} <small>Chest selection</small></span><strong>${formatNumber(amount)}</strong></div>`).join("")}` : `<p class="carnival-empty">No resources obtained yet.</p>`;
  document.querySelector("#carnival-bonus-log").innerHTML = carnivalState.bonuses.length ? carnivalState.bonuses.map(bonus => `<div class="${bonus.kind === "featured" ? "featured" : ""}"><span>Draw ${formatNumber(bonus.atPull)}</span><strong>${escapeHtml(bonus.name)}${bonus.amount > 1 ? ` x${formatNumber(bonus.amount)}` : ""}</strong></div>`).join("") : `<p class="carnival-empty">Reach 100 draws, then manually claim the cumulative reward.</p>`;
  renderCarnivalHistory();
  renderCarnivalRates();
}

function populateCarnivalFeatured() {
  const banner = carnivalBanner();
  const select = document.querySelector("#carnival-featured");
  select.innerHTML = banner.switchableHeroIds.map(id => {
    const unit = carnivalUnit(id);
    return unit ? `<option value="${id}">${escapeHtml(unit.name)} · ${escapeHtml(unit.title || id)}</option>` : "";
  }).join("");
  if (!banner.switchableHeroIds.includes(carnivalState.featuredId)) carnivalState.featuredId = banner.featuredId;
  select.value = carnivalState.featuredId;
}

async function initializeCarnival() {
  if (!carnivalData || !carnivalPlayerSample) {
    [carnivalData, carnivalPlayerSample] = await Promise.all([
      carnivalData || fetch("./carnival-banner-data.json").then(checkResponse).then(response => response.json()),
      carnivalPlayerSample || fetch("./carnival-player-sample.json").then(checkResponse).then(response => response.json())
    ]);
  }
  const select = document.querySelector("#carnival-banner");
  select.innerHTML = [...carnivalData.banners].reverse().map(banner => `<option value="${escapeHtml(banner.key)}">${escapeHtml(banner.featuredName)} · ${escapeHtml(banner.featuredTitle)}</option>`).join("");
  carnivalState.bannerKey = carnivalData.currentBannerKey;
  carnivalState.featuredId = carnivalBanner().featuredId;
  select.value = carnivalState.bannerKey;
  populateCarnivalFeatured();
  renderCarnival();
}

function resetCarnival(keepWallet = false) {
  hideCarnivalFeaturedReveal();
  const wallet = keepWallet ? { walletTickets: carnivalState.walletTickets, walletDiamonds: carnivalState.walletDiamonds, payment: carnivalState.payment } : { walletTickets: 100, walletDiamonds: 60000, payment: "tickets-first" };
  Object.assign(carnivalState, { pulls: 0, progress: 0, pendingClaim: false, featuredCopies: 0, otherSsr: 0, inventory: {}, selectedRewards: {}, recent: [], bonuses: [], history: [], ticketsSpent: 0, diamondsSpent: 0, status: "Simulation reset." }, wallet);
  renderCarnival();
}

function openCarnivalChest() {
  const banner = carnivalBanner();
  if (!banner || !(carnivalState.inventory[banner.selectionChestName] > 0)) return;
  document.querySelector("#carnival-chest-title").textContent = banner.selectionChestName;
  document.querySelector("#carnival-chest-choices").innerHTML = banner.selectionChestChoices.map((choice, index) => {
    const unit = choice.kind === "hero" ? carnivalUnit(choice.code) : null;
    return `<button type="button" data-chest-choice="${index}">${unit ? `<img src="${escapeHtml(unit.image)}" alt="">` : `<span>ITEM</span>`}<div><strong>${escapeHtml(choice.name)}</strong><small>${escapeHtml(choice.title || choice.rarity || "Choose this reward")}</small></div></button>`;
  }).join("");
  document.querySelector("#carnival-chest-modal").showModal();
}

function chooseCarnivalChestReward(index) {
  const banner = carnivalBanner();
  const choice = banner?.selectionChestChoices[Number(index)];
  if (!choice || !(carnivalState.inventory[banner.selectionChestName] > 0)) return;
  carnivalState.inventory[banner.selectionChestName]--;
  if (!carnivalState.inventory[banner.selectionChestName]) delete carnivalState.inventory[banner.selectionChestName];
  if (choice.kind === "item") addCarnivalInventory(choice);
  else carnivalState.selectedRewards[choice.name] = (carnivalState.selectedRewards[choice.name] || 0) + Number(choice.amount || 1);
  addCarnivalHistory({ ...choice, unitId: choice.kind === "hero" ? choice.code : undefined }, "chest", carnivalState.pulls);
  carnivalState.status = `Selected ${choice.name} from ${banner.selectionChestName}.`;
  document.querySelector("#carnival-chest-modal").close();
  renderCarnival();
}

function runCarnivalAnalysis() {
  const sessionsInput = document.querySelector("#carnival-analysis-sessions");
  const drawsInput = document.querySelector("#carnival-analysis-draws");
  const sessions = Math.max(100, Math.min(10000, Number(sessionsInput.value) || 1000));
  const draws = Math.max(10, Math.min(1000, Number(drawsInput.value) || 100));
  sessionsInput.value = sessions; drawsInput.value = draws;
  const normalPool = carnivalPool("normal");
  const bonusPool = carnivalPool("bonus");
  const totals = { featured: 0, normalFeatured: 0, star: 0, refine: 0, firstDrawSum: 0, firstDrawCount: 0, zero: 0, distribution: [0, 0, 0, 0, 0] };
  for (let session = 0; session < sessions; session++) {
    let featured = 0; let firstDraw = 0;
    for (let draw = 1; draw <= draws; draw++) {
      const result = carnivalWeightedRoll(normalPool);
      if (result.kind === "featured") { featured++; totals.normalFeatured++; if (!firstDraw) firstDraw = draw; }
      if (result.code === "20059") totals.star += Number(result.amount || 1);
      if (result.code === "20203") totals.refine += Number(result.amount || 1);
      if (draw % 100 === 0) {
        const bonus = carnivalWeightedRoll(bonusPool);
        if (bonus.kind === "featured") { featured++; if (!firstDraw) firstDraw = draw; }
        if (bonus.code === "20059") totals.star += Number(bonus.amount || 1);
        if (bonus.code === "20203") totals.refine += Number(bonus.amount || 1);
      }
    }
    totals.featured += featured;
    if (!featured) totals.zero++;
    totals.distribution[Math.min(4, featured)]++;
    if (firstDraw) { totals.firstDrawSum += firstDraw; totals.firstDrawCount++; }
  }
  const average = value => value / sessions;
  const maxBucket = Math.max(...totals.distribution, 1);
  document.querySelector("#carnival-analysis-results").innerHTML = `<div class="carnival-analysis-metrics"><div><span>Average featured</span><strong>${average(totals.featured).toFixed(2)}</strong></div><div><span>Zero-featured chance</span><strong>${(totals.zero / sessions * 100).toFixed(1)}%</strong></div><div><span>Avg. normal featured</span><strong>${average(totals.normalFeatured).toFixed(2)}</strong></div><div><span>Avg. Star-Up Crystals</span><strong>${average(totals.star).toFixed(2)}</strong></div><div><span>Avg. Refinement Crystals</span><strong>${average(totals.refine).toFixed(2)}</strong></div><div><span>Avg. diamonds to first*</span><strong>${totals.firstDrawCount ? formatNumber(Math.round(totals.firstDrawSum / totals.firstDrawCount * carnivalBanner().diamondCost)) : "N/A"}</strong></div></div><div class="carnival-histogram">${totals.distribution.map((value, index) => `<div><span>${index === 4 ? "4+" : index} featured</span><i><b style="width:${value / maxBucket * 100}%"></b></i><strong>${(value / sessions * 100).toFixed(1)}%</strong></div>`).join("")}</div><p>Based on ${formatNumber(sessions)} sessions x ${formatNumber(draws)} draws using ${escapeHtml(carnivalBanner().featuredName)}'s APK preset. *First-featured cost is averaged only across sessions that obtained at least one featured unit.</p>`;
}

let potentialWheelData = null;
let wheelRevealTimer = null;
const potentialWheelState = {
  diamonds: 100000,
  coins: 0,
  freeSpins: 1,
  totalSpins: 0,
  paidSpins: 0,
  diamondsSpent: 0,
  fortunePoints: 0,
  failedRainbowSpins: 0,
  rainbowCount: 0,
  counts: {},
  recent: [],
  history: [],
  historyFilter: "all",
  status: "One daily free spin is ready."
};

function wheelRainbowRate(failedSpins = potentialWheelState.failedRainbowSpins) {
  if (!potentialWheelData) return 0.001;
  let weight = Number(potentialWheelData.rainbowPity.baseWeightPerThousand || 1);
  for (const threshold of potentialWheelData.rainbowPity.thresholds) {
    if (failedSpins >= Number(threshold.failedSpins)) weight = Number(threshold.weightPerThousand);
  }
  return Math.min(1, weight / 1000);
}

function wheelRateLabel(probability) {
  if (probability >= 1) return "FORCED";
  return `${(probability * 100).toFixed(probability < 0.01 ? 2 : 1)}%`;
}

function potentialWheelRoll(rng = Math.random) {
  const rainbow = potentialWheelData.baseRates.find(item => item.key === "rainbow");
  const rainbowRate = wheelRainbowRate();
  const roll = rng();
  if (roll < rainbowRate) return { ...rainbow, probabilityUsed: rainbowRate };
  const normal = potentialWheelData.baseRates.filter(item => item.key !== "rainbow");
  const normalTotal = normal.reduce((sum, item) => sum + Number(item.probability), 0);
  let conditionalRoll = (roll - rainbowRate) / Math.max(1 - rainbowRate, Number.EPSILON);
  for (const item of normal) {
    conditionalRoll -= Number(item.probability) / normalTotal;
    if (conditionalRoll < 0) return { ...item, probabilityUsed: (1 - rainbowRate) * Number(item.probability) / normalTotal };
  }
  return { ...normal.at(-1), probabilityUsed: (1 - rainbowRate) * Number(normal.at(-1).probability) / normalTotal };
}

function wheelPayOne() {
  if (potentialWheelState.freeSpins > 0) {
    potentialWheelState.freeSpins--;
    return "Daily free spin";
  }
  if (potentialWheelState.coins > 0) {
    potentialWheelState.coins--;
    potentialWheelState.paidSpins++;
    return "Potential Lucky Coin";
  }
  return "";
}

function showWheelRainbowReveal() {
  const reveal = document.querySelector("#wheel-rainbow-reveal");
  clearTimeout(wheelRevealTimer);
  reveal.hidden = false;
  reveal.classList.remove("active");
  void reveal.offsetWidth;
  reveal.classList.add("active");
  wheelRevealTimer = setTimeout(hideWheelRainbowReveal, 3600);
}

function hideWheelRainbowReveal() {
  clearTimeout(wheelRevealTimer);
  const reveal = document.querySelector("#wheel-rainbow-reveal");
  if (reveal) reveal.hidden = true;
}

function spinPotentialWheel(requestedCount) {
  if (!potentialWheelData) return;
  const batch = [];
  let rainbowObtained = false;
  for (let index = 0; index < Number(requestedCount); index++) {
    const payment = wheelPayOne();
    if (!payment) break;
    const counterBefore = potentialWheelState.failedRainbowSpins;
    const result = potentialWheelRoll();
    potentialWheelState.totalSpins++;
    potentialWheelState.fortunePoints += Number(result.fortunePoints || 0);
    potentialWheelState.counts[result.key] = (potentialWheelState.counts[result.key] || 0) + 1;
    if (result.key === "rainbow") {
      potentialWheelState.rainbowCount++;
      potentialWheelState.failedRainbowSpins = 0;
      rainbowObtained = true;
    } else {
      potentialWheelState.failedRainbowSpins++;
    }
    const entry = { ...result, payment, counterBefore, spin: potentialWheelState.totalSpins };
    batch.push(entry);
    potentialWheelState.history.unshift(entry);
  }
  potentialWheelState.recent = batch.slice(-10).reverse();
  if (!batch.length) potentialWheelState.status = "No free spin or Lucky Coin available. Buy coins with diamonds first.";
  else if (batch.length < requestedCount) potentialWheelState.status = `Completed ${batch.length} spin${batch.length === 1 ? "" : "s"}; your free spin and Lucky Coins are now empty.`;
  else potentialWheelState.status = `Completed ${batch.length} spin${batch.length === 1 ? "" : "s"}.`;
  renderPotentialWheel();
  if (rainbowObtained) showWheelRainbowReveal();
}

function buyPotentialWheelCoins(amount) {
  if (!potentialWheelData) return;
  const quantity = Math.max(1, Math.floor(Number(amount) || 1));
  const cost = quantity * Number(potentialWheelData.coinCostDiamonds);
  if (potentialWheelState.diamonds < cost) {
    potentialWheelState.status = `Not enough diamonds to buy ${formatNumber(quantity)} Lucky Coins.`;
  } else {
    potentialWheelState.diamonds -= cost;
    potentialWheelState.diamondsSpent += cost;
    potentialWheelState.coins += quantity;
    potentialWheelState.status = `Purchased ${formatNumber(quantity)} Potential Lucky Coin${quantity === 1 ? "" : "s"} for ${formatNumber(cost)} diamonds.`;
  }
  renderPotentialWheel();
}

function wheelResultMarkup(result) {
  const label = result.key === "rainbow" ? "RB" : `L${result.level}`;
  return `<article class="wheel-result ${escapeHtml(result.key)}"><span>${label}</span><div><strong>${escapeHtml(result.name)}</strong><small>+${formatNumber(result.fortunePoints)} Fortune Points · Spin ${formatNumber(result.spin)}</small></div></article>`;
}

function renderPotentialWheelHistory() {
  if (!potentialWheelData) return;
  const filtered = potentialWheelState.history.filter(entry => potentialWheelState.historyFilter === "all" || entry.key === potentialWheelState.historyFilter);
  document.querySelector("#wheel-history-count").textContent = `${formatNumber(filtered.length)} of ${formatNumber(potentialWheelState.history.length)} entries`;
  document.querySelector("#wheel-history").innerHTML = filtered.length ? filtered.map(entry => `<article class="wheel-history-entry ${escapeHtml(entry.key)}"><span>${entry.key === "rainbow" ? "RB" : `L${entry.level}`}</span><div><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.payment)} · Spin ${formatNumber(entry.spin)} · Rainbow rate ${wheelRateLabel(entry.probabilityUsed)}</small></div></article>`).join("") : `<p class="wheel-empty">No history entries match this filter.</p>`;
}

function renderPotentialWheelRates() {
  if (!potentialWheelData) return;
  document.querySelector("#wheel-rate-table").innerHTML = potentialWheelData.baseRates.map(item => `<p><span>${escapeHtml(item.name)}</span><strong>${wheelRateLabel(item.probability)}</strong></p>`).join("");
  const base = [{ failedSpins: 0, weightPerThousand: potentialWheelData.rainbowPity.baseWeightPerThousand }, ...potentialWheelData.rainbowPity.thresholds];
  document.querySelector("#wheel-pity-table").innerHTML = base.map(item => `<p><span>${item.failedSpins ? `${formatNumber(item.failedSpins)} failed spins` : "Starting rate"}</span><strong>${wheelRateLabel(Math.min(1, Number(item.weightPerThousand) / 1000))}</strong></p>`).join("");
}

function renderPotentialWheel() {
  if (!potentialWheelData) return;
  const setText = (selector, value) => { const element = document.querySelector(selector); if (element) element.textContent = value; };
  const currentRate = wheelRainbowRate();
  setText("#wheel-total-spins", formatNumber(potentialWheelState.totalSpins));
  setText("#wheel-diamonds", formatNumber(potentialWheelState.diamonds));
  setText("#wheel-coins", formatNumber(potentialWheelState.coins));
  setText("#wheel-free-spins", formatNumber(potentialWheelState.freeSpins));
  setText("#wheel-fortune", formatNumber(potentialWheelState.fortunePoints));
  setText("#wheel-rainbows", formatNumber(potentialWheelState.rainbowCount));
  setText("#wheel-pity-counter", `${formatNumber(potentialWheelState.failedRainbowSpins)} failed spins`);
  setText("#wheel-rainbow-rate", wheelRateLabel(currentRate));
  setText("#wheel-status", potentialWheelState.status);
  document.querySelector("#wheel-diamonds-input").value = potentialWheelState.diamonds;
  document.querySelector("#wheel-coins-input").value = potentialWheelState.coins;
  document.querySelector("#wheel-pity-bar").style.width = `${Math.min(100, potentialWheelState.failedRainbowSpins / 1499 * 100)}%`;
  document.querySelector("#wheel-results").innerHTML = potentialWheelState.recent.length ? potentialWheelState.recent.map(wheelResultMarkup).join("") : `<p class="wheel-empty">Spin the wheel to see results.</p>`;
  document.querySelector("#wheel-level-counts").innerHTML = potentialWheelData.baseRates.map(item => `<div class="${escapeHtml(item.key)}"><span>${escapeHtml(item.level === "Rainbow" ? "Rainbow" : `Lv.${item.level}`)}</span><strong>${formatNumber(potentialWheelState.counts[item.key] || 0)}</strong><small>${potentialWheelState.totalSpins ? ((potentialWheelState.counts[item.key] || 0) / potentialWheelState.totalSpins * 100).toFixed(2) : "0.00"}% observed · ${wheelRateLabel(item.probability)} base</small></div>`).join("");
  document.querySelectorAll("[data-wheel-spin]").forEach(button => button.disabled = potentialWheelState.freeSpins < 1 && potentialWheelState.coins < 1);
  document.querySelectorAll("[data-wheel-buy]").forEach(button => button.disabled = potentialWheelState.diamonds < Number(button.dataset.wheelBuy) * potentialWheelData.coinCostDiamonds);
  renderPotentialWheelHistory();
  renderPotentialWheelRates();
}

function resetPotentialWheel(keepWallet = false) {
  hideWheelRainbowReveal();
  const wallet = keepWallet ? { diamonds: potentialWheelState.diamonds, coins: potentialWheelState.coins } : { diamonds: 100000, coins: 0 };
  Object.assign(potentialWheelState, {
    ...wallet,
    freeSpins: Number(potentialWheelData?.dailyFreeSpins || 1),
    totalSpins: 0,
    paidSpins: 0,
    diamondsSpent: 0,
    fortunePoints: 0,
    failedRainbowSpins: 0,
    rainbowCount: 0,
    counts: {},
    recent: [],
    history: [],
    status: "One daily free spin is ready."
  });
  renderPotentialWheel();
}

async function initializePotentialWheel() {
  potentialWheelData = await fetch("./potential-wheel-data.json").then(checkResponse).then(response => response.json());
  resetPotentialWheel(false);
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
  const translatedEntries = Array.isArray(skill.entry_translated) ? skill.entry_translated : [];
  const entryNames = Array.isArray(skill.entry) ? skill.entry.map((value, index) => {
    const translated = state.skillEntries[value] ?? translatedEntries[index];
    if (translated != null) return translated;
    if (/^tid#Skill_(?:Sup)?EntryName_0$/.test(value)) return "";
    return String(value).replace(/^tid#Skill_(?:Sup)?EntryName_/, "Effect ");
  }) : [];
  entryNames.forEach((value, index) => {
    result = result.replaceAll(`#Entry_${index + 1}#`, value);
  });
  return cleanText(result);
}

function translatedSkillEntries(skill, key) {
  const tokens = Array.isArray(skill[key]) ? skill[key] : [];
  if (tokens.length) {
    const resolved = tokens.map(token => state.skillEntries[token]).filter(Boolean);
    if (resolved.length === tokens.length) return resolved.join(" ");
  }
  const translated = skill[`${key}_translated`];
  return Array.isArray(translated) ? translated.join(" ") : translated || "";
}

function skillCard(skill, label, className = "") {
  const base = replaceTokens(skill.desc_short_translated || skill.max_desc_short_translated, skill);
  const entry = cleanText(translatedSkillEntries(skill, "entry_desc"));
  const rank = cleanText(translatedSkillEntries(skill, "r_max_entry_desc"));
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
  const orb = state.battleEffectAudit.get(String(unit.id))?.orbs?.[0];
  const orbName = orb?.name || `${unit.title || unit.name} Ability Sphere`;
  const orbDescription = orb?.text || "Ability Sphere information is not available in the extracted data.";
  modalContent.innerHTML = `
    <header class="hero-banner">
      <img class="hero-portrait" src="${escapeHtml(unit.image)}" alt="${escapeHtml(unit.name)}">
      <div>
        <p class="eyebrow">Unit #${escapeHtml(unit.id)}</p>
        <h2>${escapeHtml(unit.name)}</h2>
        <p class="hero-title">${escapeHtml(unit.title || "Character record")}</p>
        <div class="hero-meta">
          <span class="pill accent">${escapeHtml(unit.rarity)}</span>
          ${unit.upcoming ? `<span class="pill upcoming-pill">Upcoming Preview</span>` : ""}
          <span class="pill">${escapeHtml(unit.faction)}</span>
          ${model.tactic_type ? `<span class="pill">${escapeHtml(tacticNames[model.tactic_type] || `Tactic ${model.tactic_type}`)}</span>` : ""}
          ${model.rc_type ? `<span class="pill">${escapeHtml(model.rc_type)}</span>` : ""}
          ${releaseDate ? `<span class="pill">Released ${escapeHtml(releaseDate)}</span>` : ""}
        </div>
      </div>
    </header>
    <div class="details-body">
      ${unit.upcoming ? `<section class="upcoming-preview-warning"><strong>Upcoming preview · subject to change</strong><p>This record comes from ${escapeHtml(d.preview?.sourceVersion || "preview data")}. The kit, assets, release timing, rarity, and availability may change before release.</p></section>` : ""}
      <section class="ability-card">
        <div class="orb-icon">◉</div>
        <div>
          <span class="skill-kind">Orb Details · Exclusive Skill</span>
          <h3>${escapeHtml(orbName)}</h3>
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
document.querySelector("#simulator-runs").addEventListener("change", event => {
  battleSimulatorState.runs = Math.max(100, Math.min(1000, Number(event.target.value) || 500));
});
document.querySelector("#simulator-rounds").addEventListener("change", event => {
  battleSimulatorState.maxRounds = Math.max(3, Math.min(30, Math.floor(Number(event.target.value) || 12)));
  event.target.value = String(battleSimulatorState.maxRounds);
});
document.querySelector("#simulator-seed").addEventListener("change", event => {
  battleSimulatorState.seed = Math.floor(Number(event.target.value) || 5081);
  event.target.value = String(battleSimulatorState.seed);
});
document.querySelector("#simulator-kits").addEventListener("change", event => {
  battleSimulatorState.includeKits = event.target.checked;
  battleSimulatorState.result = null;
});
document.querySelector("#simulator-max-investment").addEventListener("change", event => {
  battleSimulatorState.maxInvestment = event.target.checked;
  battleSimulatorState.result = null;
  document.querySelector("#simulator-investment-detail").hidden = !battleSimulatorState.maxInvestment;
  document.querySelector("#simulator-results").innerHTML = battleSimulatorState.maxInvestment
    ? `<div class="simulator-empty updated"><strong>Max investment scenario enabled</strong><p>${escapeHtml(SIMULATOR_MAX_INVESTMENT_PROFILE.detail)}. Both teams receive the same proxy so investment is equalized.</p></div>`
    : `<div class="simulator-empty updated"><strong>Standard S00 scenario restored</strong><p>The simulator is using the stored direct S00 unit stats and Combat Power.</p></div>`;
  renderBattleSimulatorSetup();
});
document.querySelector("#simulator-run").addEventListener("click", runBattleSimulator);
document.querySelector("#simulator-populate").addEventListener("click", populateBattleSimulatorTeams);
document.querySelector("#battle-simulator-view").addEventListener("change", event => {
  const input = event.target.closest("[data-simulator-talents-side][data-simulator-talents-slot]");
  if (!input) return;
  const side = input.dataset.simulatorTalentsSide;
  const slot = Number(input.dataset.simulatorTalentsSlot);
  battleSimulatorState.teams[side].maxTalents[slot] = input.checked;
  battleSimulatorState.result = null;
  document.querySelector("#simulator-results").innerHTML = `<div class="simulator-empty updated"><strong>Max Talents ${input.checked ? "enabled" : "disabled"}</strong><p>${input.checked ? "All three Skill Up tiers will be applied to this unit." : "This unit will battle without its Skill Up tier effects."}</p></div>`;
  renderBattleSimulatorSetup();
});
document.querySelector("#battle-simulator-view").addEventListener("click", event => {
  if (Date.now() < simulatorIgnoreClickUntil) return;
  const slot = event.target.closest("[data-simulator-side][data-simulator-slot]");
  if (slot) {
    openSimulatorPicker(slot.dataset.simulatorSide, Number(slot.dataset.simulatorSlot));
    return;
  }
  const clear = event.target.closest("[data-simulator-clear]");
  if (clear) {
    battleSimulatorState.teams[clear.dataset.simulatorClear].slots.fill("");
    battleSimulatorState.teams[clear.dataset.simulatorClear].maxTalents.fill(false);
    battleSimulatorState.result = null;
    document.querySelector("#simulator-results").innerHTML = `<div class="simulator-empty"><strong>Team cleared</strong><p>Select five units for each side, then press Battle.</p></div>`;
    renderBattleSimulatorSetup();
  }
});
document.querySelector("#battle-simulator-view").addEventListener("dragstart", event => {
  const slot = event.target.closest(".simulator-unit.filled[data-simulator-side][data-simulator-slot]");
  if (!slot) return;
  simulatorDrag = { side: slot.dataset.simulatorSide, slot: Number(slot.dataset.simulatorSlot) };
  slot.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", JSON.stringify(simulatorDrag));
});
function completeSimulatorReorder(side, sourceSlot, destinationSlot) {
  if (sourceSlot === destinationSlot) return false;
  const slots = battleSimulatorState.teams[side].slots;
  [slots[sourceSlot], slots[destinationSlot]] = [slots[destinationSlot], slots[sourceSlot]];
  const maxTalents = battleSimulatorState.teams[side].maxTalents;
  [maxTalents[sourceSlot], maxTalents[destinationSlot]] = [maxTalents[destinationSlot], maxTalents[sourceSlot]];
  // Suppress only the synthetic click emitted by the completed drag. A timestamp
  // cannot remain stuck and block later slot or Clear clicks after the rerender.
  simulatorIgnoreClickUntil = Date.now() + 250;
  battleSimulatorState.result = null;
  document.querySelector("#simulator-results").innerHTML = `<div class="simulator-empty updated"><strong>Line-up repositioned</strong><p>The two unit positions were swapped.</p></div>`;
  renderBattleSimulatorSetup();
  return true;
}
document.querySelector("#battle-simulator-view").addEventListener("dragover", event => {
  const slot = event.target.closest(".simulator-unit[data-simulator-side][data-simulator-slot]");
  if (!slot || !simulatorDrag || slot.dataset.simulatorSide !== simulatorDrag.side) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  document.querySelectorAll("#battle-simulator-view .simulator-unit.drag-over").forEach(item => item.classList.remove("drag-over"));
  slot.classList.add("drag-over");
});
document.querySelector("#battle-simulator-view").addEventListener("dragleave", event => {
  const slot = event.target.closest(".simulator-unit.drag-over");
  if (slot && !slot.contains(event.relatedTarget)) slot.classList.remove("drag-over");
});
document.querySelector("#battle-simulator-view").addEventListener("drop", event => {
  const destination = event.target.closest(".simulator-unit[data-simulator-side][data-simulator-slot]");
  if (!destination || !simulatorDrag || destination.dataset.simulatorSide !== simulatorDrag.side) return;
  event.preventDefault();
  const destinationSlot = Number(destination.dataset.simulatorSlot);
  completeSimulatorReorder(simulatorDrag.side, simulatorDrag.slot, destinationSlot);
  simulatorDrag = null;
});
document.querySelector("#battle-simulator-view").addEventListener("dragend", () => {
  simulatorDrag = null;
  document.querySelectorAll("#battle-simulator-view .simulator-unit.dragging, #battle-simulator-view .simulator-unit.drag-over").forEach(item => item.classList.remove("dragging", "drag-over"));
});
document.querySelector("#battle-simulator-view").addEventListener("pointerdown", event => {
  const grip = event.target.closest(".simulator-drag-grip");
  const slot = grip?.closest(".simulator-unit.filled[data-simulator-side][data-simulator-slot]");
  if (!slot) return;
  simulatorPointerDrag = {
    side: slot.dataset.simulatorSide,
    slot: Number(slot.dataset.simulatorSlot),
    startX: event.clientX,
    startY: event.clientY,
    moved: false
  };
  grip.setPointerCapture?.(event.pointerId);
});
document.querySelector("#battle-simulator-view").addEventListener("pointermove", event => {
  if (!simulatorPointerDrag) return;
  if (Math.hypot(event.clientX - simulatorPointerDrag.startX, event.clientY - simulatorPointerDrag.startY) < 7) return;
  simulatorPointerDrag.moved = true;
  event.preventDefault();
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".simulator-unit[data-simulator-side][data-simulator-slot]");
  document.querySelectorAll("#battle-simulator-view .simulator-unit.drag-over").forEach(item => item.classList.remove("drag-over"));
  if (target?.dataset.simulatorSide === simulatorPointerDrag.side) target.classList.add("drag-over");
});
document.querySelector("#battle-simulator-view").addEventListener("pointerup", event => {
  if (!simulatorPointerDrag) return;
  const current = simulatorPointerDrag;
  simulatorPointerDrag = null;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".simulator-unit[data-simulator-side][data-simulator-slot]");
  document.querySelectorAll("#battle-simulator-view .simulator-unit.drag-over").forEach(item => item.classList.remove("drag-over"));
  if (current.moved && target?.dataset.simulatorSide === current.side) {
    event.preventDefault();
    completeSimulatorReorder(current.side, current.slot, Number(target.dataset.simulatorSlot));
  }
});
document.querySelector("#battle-simulator-view").addEventListener("pointercancel", () => {
  simulatorPointerDrag = null;
  document.querySelectorAll("#battle-simulator-view .simulator-unit.drag-over").forEach(item => item.classList.remove("drag-over"));
});
document.querySelectorAll(".language-option").forEach(button => {
  button.addEventListener("click", () => {
    state.language = button.dataset.language;
    localStorage.setItem("xiii-language", state.language);
    applyLanguage();
  });
});
document.querySelector("#carnival-featured").addEventListener("change", event => {
  if (carnivalState.progress !== 0 || carnivalState.pendingClaim) return;
  carnivalState.featuredId = event.target.value;
  carnivalState.status = "Featured character switched at zero cumulative progress.";
  renderCarnival();
});
document.querySelector("#carnival-banner").addEventListener("change", event => {
  carnivalState.bannerKey = event.target.value;
  carnivalState.featuredId = carnivalBanner().featuredId;
  resetCarnival(true);
  populateCarnivalFeatured();
  document.querySelector("#carnival-analysis-results").innerHTML = `<p class="carnival-empty">Run an analysis to estimate outcomes for this banner.</p>`;
  carnivalState.status = `Loaded APK preset ${carnivalBanner().key}.`;
  renderCarnival();
});
document.querySelector("#carnival-view").addEventListener("click", event => {
  const pullButton = event.target.closest("[data-carnival-pulls]");
  if (pullButton) carnivalPullMany(Number(pullButton.dataset.carnivalPulls));
  if (event.target.closest("[data-open-carnival-chest]")) openCarnivalChest();
});
document.querySelector("#carnival-reset").addEventListener("click", () => resetCarnival(false));
document.querySelector("#carnival-claim").addEventListener("click", claimCarnivalBonus);
document.querySelector("#carnival-featured-reveal").addEventListener("click", hideCarnivalFeaturedReveal);
document.querySelector("#carnival-wallet-tickets").addEventListener("change", event => { carnivalState.walletTickets = Math.max(0, Math.floor(Number(event.target.value) || 0)); renderCarnival(); });
document.querySelector("#carnival-wallet-diamonds").addEventListener("change", event => { carnivalState.walletDiamonds = Math.max(0, Math.floor(Number(event.target.value) || 0)); renderCarnival(); });
document.querySelector("#carnival-payment").addEventListener("change", event => { carnivalState.payment = event.target.value; renderCarnival(); });
document.querySelector("#carnival-history-filter").addEventListener("change", event => { carnivalState.historyFilter = event.target.value; renderCarnivalHistory(); });
document.querySelector("#carnival-history-clear").addEventListener("click", () => { carnivalState.history = []; renderCarnivalHistory(); });
document.querySelector("#carnival-analysis-run").addEventListener("click", runCarnivalAnalysis);
document.querySelector("#carnival-chest-close").addEventListener("click", () => document.querySelector("#carnival-chest-modal").close());
document.querySelector("#carnival-chest-choices").addEventListener("click", event => { const choice = event.target.closest("[data-chest-choice]"); if (choice) chooseCarnivalChestReward(choice.dataset.chestChoice); });
document.querySelector("#carnival-chest-modal").addEventListener("click", event => { if (event.target.id === "carnival-chest-modal") event.target.close(); });
document.querySelector("#potential-wheel-view").addEventListener("click", event => {
  const spinButton = event.target.closest("[data-wheel-spin]");
  const buyButton = event.target.closest("[data-wheel-buy]");
  if (spinButton) spinPotentialWheel(Number(spinButton.dataset.wheelSpin));
  if (buyButton) buyPotentialWheelCoins(Number(buyButton.dataset.wheelBuy));
});
document.querySelector("#wheel-reset").addEventListener("click", () => resetPotentialWheel(false));
document.querySelector("#wheel-diamonds-input").addEventListener("change", event => { potentialWheelState.diamonds = Math.max(0, Math.floor(Number(event.target.value) || 0)); potentialWheelState.status = "Diamond balance updated."; renderPotentialWheel(); });
document.querySelector("#wheel-coins-input").addEventListener("change", event => { potentialWheelState.coins = Math.max(0, Math.floor(Number(event.target.value) || 0)); potentialWheelState.status = "Potential Lucky Coin balance updated."; renderPotentialWheel(); });
document.querySelector("#wheel-history-filter").addEventListener("change", event => { potentialWheelState.historyFilter = event.target.value; renderPotentialWheelHistory(); });
document.querySelector("#wheel-history-clear").addEventListener("click", () => { potentialWheelState.history = []; renderPotentialWheelHistory(); });
document.querySelector("#wheel-rainbow-reveal").addEventListener("click", hideWheelRainbowReveal);
document.querySelector("#team-builder-stages").addEventListener("click", event => {
  const shareButton = event.target.closest(".builder-share-button");
  if (shareButton) {
    openTeamShare(Number(shareButton.dataset.stage));
    return;
  }
  if (event.target.closest(".builder-team-name, .builder-team-description")) return;
  const slot = event.target.closest(".builder-unit-slot");
  if (slot) openBuilderPicker(Number(slot.dataset.stage), slot.dataset.role, Number(slot.dataset.slot));
});
document.querySelector("#team-builder-stages").addEventListener("input", event => {
  const input = event.target.closest(".builder-team-name");
  if (input) state.builder[Number(input.dataset.stage)].name = input.value;
  const description = event.target.closest(".builder-team-description");
  if (description) state.builder[Number(description.dataset.stage)].description = description.value;
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
document.querySelector("#team-share-close").addEventListener("click", () => teamShareModal.close());
document.querySelector("#team-share-copy").addEventListener("click", copyTeamShareImage);
teamShareModal.addEventListener("click", event => { if (event.target === teamShareModal) teamShareModal.close(); });
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
  } else if (activeBattlePicker.context === "simulator") {
    battleSimulatorState.teams[activeBattlePicker.side].slots[activeBattlePicker.slot] = button.dataset.unitId;
    battleSimulatorState.teams[activeBattlePicker.side].maxTalents[activeBattlePicker.slot] = false;
    battleSimulatorState.result = null;
    renderBattleSimulatorSetup();
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
  } else if (activeBattlePicker.context === "simulator") {
    battleSimulatorState.teams[activeBattlePicker.side].slots[activeBattlePicker.slot] = "";
    battleSimulatorState.teams[activeBattlePicker.side].maxTalents[activeBattlePicker.slot] = false;
    battleSimulatorState.result = null;
    renderBattleSimulatorSetup();
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
initializePotentialWheel();
loadCatalog();
