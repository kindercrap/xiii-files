import fs from "node:fs";

const pages = {
  30: ["LC10", "LC5", "LC10", "LC5", "LC10", "AB300", "CELL", "LC10", "C:Naki [Crybaby]", "LC10"],
  29: ["LC10", "LC5", "CELL", "LC5", "AB500", "LC10", "AB500", "AB500", "AB500", "C:Kohtaro Amon [Twinblades of Justice]"],
  28: ["AB300", "LC5", "LC10", "AB300", "C:Kyoji Misaka [Warden]", "LC10", "AB500", "C:Kohtaro Amon [Twinblades of Justice]", "P4:Artifice", "C:Yukinori Shinohara [Arata proto]"],
  27: ["LC5", "AB300", "LC10", "AB500", "CELL", "LC10", "LC10", "AB300", "C:Kohtaro Amon [Twinblades of Justice]", "LC10"],
  26: ["AB300", "LC10", "LC30", "P3:Initiate", "LC5", "CELL", "LC30", "LC10", "LC5", "LC30"],
  25: ["P3:Eliminate", "LC10", "LC10", "LC10", "AB300", "LC5", "LC5", "LC5", "AB500", "AB500"],
  24: ["CELL", "LC5", "LC10", "CELL", "AB300", "AB300", "LC10", "LC10", "AB300", "LC5"],
  23: ["LC100", "P4:Potent", "LC5", "STAR", "AB500", "LC5", "AB300", "LC10", "LC10", "LC10"],
  22: ["P3:Potent", "LC5", "P3:Smash", "LC30", "LC5", "AB300", "LC10", "AB500", "AB500", "AB300"],
  21: ["C:Haise Sasaki [Sealed Memory]", "AB300", "P3:Initiate", "P3:Smash", "P3:Smash", "LC30", "LC10", "AB500", "AB500", "LC10"],
  20: ["AB300", "LC10", "LC10", "P4:Initiate", "AB500", "AB500", "LC5", "CELL", "P3:Eliminate", "CELL"],
  19: ["P3:Undermine", "LC5", "LC5", "AB300", "P3:Eliminate", "LC10", "LC10", "LC5", "LC5", "CELL"],
  18: ["P4:Eliminate", "AB300", "LC10", "LC10", "LC10", "AB300", "LC10", "LC5", "C:Haise Sasaki [Sealed Memory]", "P4:Artifice"],
  17: ["LC5", "P4:Eliminate", "LC5", "AB300", "LC30", "LC10", "AB500", "AB500", "LC10", "LC10"],
  16: ["AB500", "P4:Potent", "AB300", "AB500", "LC10", "LC10", "P3:Initiate", "LC5", "LC10", "LC10"],
  15: ["P3:Smash", "LC5", "LC10", "AB300", "LC10", "LC30", "LC10", "REFINE", "LC10", "AB300"],
  14: ["LC10", "LC10", "P3:Artifice", "P4:Initiate", "LC10", "LC5", "P3:Potent", "AB500", "P4:Smash", "LC10"],
  13: ["LC10", "LC5", "C:Mogan Tanakamaru [Battleground Gentleman]", "LC10", "P3:Artifice", "LC5", "AB500", "LC10", "AB500", "P4:Initiate"],
  12: ["LC10", "LC10", "LC10", "LC5", "LC10", "LC10", "LC10", "CELL", "AB300", "P3:Undermine"],
  11: ["LC10", "P4:Initiate", "LC10", "P3:Smash", "C:Rize Kamishiro [Binge Eater]", "LC10", "P3:Initiate", "P4:Artifice", "P3:Undermine", "LC10"],
  10: ["LC10", "LC10", "AB300", "AB500", "P3:Smash", "AB500", "LC10", "LC10", "CELL", "LC10"],
  9: ["STAR", "CELL", "P3:Eliminate", "LC30", "LC5", "LC10", "P3:Undermine", "AB300", "P3:Undermine", "LC10"],
  8: ["LC10", "LC30", "AB300", "LC10", "AB300", "LC5", "AB300", "P3:Eliminate", "LC10", "LC10"],
  7: ["AB500", "LC10", "LC10", "LC10", "LC10", "LC5", "AB300", "LC10", "LC10", "LC10"],
  6: ["P3:Undermine", "C:Mogan Tanakamaru [Battleground Gentleman]", "AB500", "LC5", "AB300", "C:Ayumu Hogi [Long-haired Ghoul Investigator]", "P3:Eliminate", "AB300", "P3:Potent", "LC10"],
  5: ["P4:Undermine", "AB500", "LC10", "LC5", "P3:Undermine", "LC30", "LC10", "AB500", "CELL", "LC5"],
  4: ["LC10", "AB300", "C:Kaya Irimi [Black Dog]", "LC5", "LC10", "CELL", "P4:Smash", "P4:Eliminate", "LC10", "LC5"],
  3: ["LC10", "AB300", "LC30", "AB500", "LC10", "LC5", "LC10", "LC5", "LC10", "C:Younger Bin [Tail Brothers]"],
  2: ["REFINE", "AB300", "AB300", "CELL", "LC5", "AB300", "LC5", "LC5", "P4:Smash", "P4:Potent"],
  1: ["AB500", "LC5", "LC10", "LC10", "AB300", "P3:Eliminate", "AB500", "C:Haise Sasaki [Sealed Memory]", "CELL", "CELL"]
};

const expected = {
  featured: 0.01,
  offBannerSsr: 0.0396,
  "Panacean Star-Up Crystal x1": 0.007,
  "Panacean Refinement Crystal x1": 0.007,
  "Limit Crystal x100": 0.005,
  "Limit Crystal x30": 0.05,
  "Limit Crystal x10": 0.30,
  "Limit Crystal x5": 0.15,
  "Lv.4 Random Potential": 0.05,
  "WIT Cell Casket x1": 0.05,
  "Lv.3 Random Potential": 0.10,
  "Ability Booster x500": 0.10,
  "Ability Booster x300": 0.1314
};

const label = value => ({
  LC5: "Limit Crystal x5", LC10: "Limit Crystal x10", LC30: "Limit Crystal x30", LC100: "Limit Crystal x100",
  AB300: "Ability Booster x300", AB500: "Ability Booster x500", CELL: "WIT Cell Casket x1",
  STAR: "Panacean Star-Up Crystal x1", REFINE: "Panacean Refinement Crystal x1"
})[value] || value;

const rows = Object.entries(pages).sort(([a], [b]) => Number(a) - Number(b)).flatMap(([page, values]) =>
  values.map((raw, row) => ({ page: Number(page), row: row + 1, raw, label: label(raw) }))
);
if (rows.length !== 300 || Object.values(pages).some(values => values.length !== 10)) throw new Error("Expected 30 pages of 10 results.");

const count = predicate => rows.filter(predicate).length;
const countBy = (values, key) => Object.fromEntries([...new Set(values.map(key))].sort().map(value => [value, values.filter(item => key(item) === value).length]));
const featuredName = "Haise Sasaki [Sealed Memory]";
const characters = rows.filter(row => row.raw.startsWith("C:")).map(row => row.raw.slice(2));
const potentials = rows.filter(row => /^P[34]:/.test(row.raw)).map(row => {
  const [, level, family] = row.raw.match(/^P([34]):(.+)$/);
  return { level: Number(level), family };
});

const observedCounts = {
  featured: characters.filter(name => name === featuredName).length,
  offBannerSsr: characters.filter(name => name !== featuredName).length,
  "Panacean Star-Up Crystal x1": count(row => row.raw === "STAR"),
  "Panacean Refinement Crystal x1": count(row => row.raw === "REFINE"),
  "Limit Crystal x100": count(row => row.raw === "LC100"),
  "Limit Crystal x30": count(row => row.raw === "LC30"),
  "Limit Crystal x10": count(row => row.raw === "LC10"),
  "Limit Crystal x5": count(row => row.raw === "LC5"),
  "Lv.4 Random Potential": potentials.filter(item => item.level === 4).length,
  "WIT Cell Casket x1": count(row => row.raw === "CELL"),
  "Lv.3 Random Potential": potentials.filter(item => item.level === 3).length,
  "Ability Booster x500": count(row => row.raw === "AB500"),
  "Ability Booster x300": count(row => row.raw === "AB300")
};

const output = {
  format: "XIII Files Carnival Real Player Sample",
  bannerKey: "SeasonGachaTest18_1150",
  banner: "Haise Sasaki [Sealed Memory] Carnival Recruitment",
  obtainedAt: "2026-07-13",
  sampleSize: rows.length,
  source: "30 user-supplied in-game recruit-history screenshots, 10 results per page",
  evidenceScope: "Observed frequencies validate the APK table but do not replace configured probabilities.",
  summary: {
    totalSsr: characters.length,
    featuredSsr: observedCounts.featured,
    offBannerSsr: observedCounts.offBannerSsr,
    observedSsrRate: characters.length / rows.length,
    configuredSsrRate: expected.featured + expected.offBannerSsr
  },
  comparison: Object.fromEntries(Object.entries(observedCounts).map(([name, observed]) => [name, {
    observed,
    observedRate: observed / rows.length,
    configuredRate: expected[name]
  }])),
  characters: countBy(characters, value => value),
  potentials: {
    total: potentials.length,
    byLevel: countBy(potentials, item => `Lv.${item.level}`),
    byFamily: countBy(potentials, item => item.family),
    byLevelAndFamily: countBy(potentials, item => `${item.family} Lv.${item.level}`),
    supportedFamilies: ["Artifice", "Eliminate", "Initiate", "Potent", "Smash", "Undermine"]
  },
  transcription: rows
};

fs.writeFileSync("carnival-player-sample.json", `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ summary: output.summary, counts: observedCounts, potentials: output.potentials }, null, 2));
