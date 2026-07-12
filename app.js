const EXPORT_ROOT = "./btc-character-export/";
const state = {
  units: [],
  combatPower: {},
  skillEntries: {},
  language: localStorage.getItem("xiii-language") === "zh" ? "zh" : "en",
  rarity: "all",
  faction: "all",
  sort: "default",
  query: "",
  battle: {
    left: { slots: ["", "", "", "", ""], assistants: ["", "", "", "", ""] },
    right: { slots: ["", "", "", "", ""], assistants: ["", "", "", "", ""] }
  },
  builder: Array.from({ length: 3 }, (_, index) => ({ name: `Team ${index + 1}`, description: "", slots: ["", "", "", ""], backup: "" }))
};

const translations = {
  en: {
    subtitle: "Tokyo Ghoul Awakening", archive: "Unit Archive", battle: "CP Battle", builder: "Team Building", carnival: "Carnival Banner Simulator",
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
const teamShareModal = document.querySelector("#team-share-modal");
const teamShareCanvas = document.querySelector("#team-share-canvas");
const teamShareImage = document.querySelector("#team-share-image");
let activeBattlePicker = null;
let builderDrag = null;
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
    const [index, combatPowerData, skillEntryData] = await Promise.all([
      fetch(`${EXPORT_ROOT}index.json`).then(checkResponse).then(r => r.json()),
      fetch("./btc-combat-power-s00.json").then(checkResponse).then(r => r.json()).catch(() => ({ units: {} })),
      fetch(`${EXPORT_ROOT}skill-entry-translations.json`).then(checkResponse).then(r => r.json()).catch(() => ({}))
    ]);
    state.combatPower = combatPowerData.units || {};
    state.skillEntries = skillEntryData;
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
  document.querySelector('[data-view="battle"]').textContent = t("battle");
  document.querySelector('[data-view="builder"]').textContent = t("builder");
  document.querySelector('[data-view="carnival"]').textContent = t("carnival");
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
  document.querySelector("#carnival-view").hidden = view !== "carnival";
  document.querySelectorAll(".app-tab").forEach(tab => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
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
  const item = { ...result, unitId: ["featured", "hero"].includes(result.kind) ? result.code : undefined };
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
  document.querySelector("#carnival-rate-grid").innerHTML = `<div><h3>Normal character results</h3>${normal.filter(item => item.kind !== "item").map(item => `<p>${escapeHtml(item.name)}${item.title ? ` · ${escapeHtml(item.title)}` : ""}: ${formatRate(item.probability)}</p>`).join("")}</div><div><h3>Normal item results</h3>${normal.filter(item => item.kind === "item").map(item => `<p>${escapeHtml(item.name)}${item.amount > 1 ? ` x${formatNumber(item.amount)}` : ""}: ${formatRate(item.probability)}</p>`).join("")}</div><div><h3>Cumulative reward · claim at 100</h3>${bonus.map(item => `<p>${escapeHtml(item.name)}${item.amount > 1 ? ` x${formatNumber(item.amount)}` : ""}: ${formatRate(item.probability)}</p>`).join("")}<p><strong>${banner.selectionChestChoices.length}</strong> choose-one chest options · ${escapeHtml(banner.ticketName)} or ${formatNumber(banner.diamondCost)} diamonds per draw.</p></div>`;
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
  if (!carnivalData) carnivalData = await fetch("./carnival-banner-data.json").then(checkResponse).then(response => response.json());
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
["left", "right"].forEach(side => {
  const slots = document.querySelector(`#${side}-slots`);
  slots.addEventListener("click", event => {
    const trigger = event.target.closest(".picker-trigger");
    if (trigger) openBattlePicker(side, Number(trigger.dataset.slot), trigger.dataset.role || "main");
  });
});
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
