from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
TABLES = ROOT / "ldplayer-btc-export" / "config-data-extracted" / "textassets"
OUTPUT = ROOT / "carnival-banner-data.json"

CANONICAL_GACHAS = [
    "SeasonGachaTest1",
    "SeasonGachaTest2_bz",
    "SeasonGachaTest3_xd",
    "SeasonGachaTest4_td",
    "SeasonGachaTest7_1120",
    "SeasonGachaTest10_1135",
    "SeasonGachaTest12_1127",
    "SeasonGachaTest13_1146",
    "SeasonGachaTest14_1147",
    "SeasonGachaTest15_1160",
    "SeasonGachaTest16_1168",
    "SeasonGachaTest17_1114",
    "SeasonGachaTest18_1150",
]


def load_decoder():
    spec = importlib.util.spec_from_file_location("btc_decoder", ROOT / "decode-game-table.py")
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


decoder = load_decoder()


def table(name: str):
    return decoder.parse_table((TABLES / name).read_bytes())[1]


translations = {
    record["fields"].get("1"): record["fields"].get("2")
    for record in table("00155_TranslateForMultiEN.bin")
}
items = {record["key"]: record for record in table("00241_Item.bin")}
rewards = {record["key"]: record for record in table("00384_Reward.bin")}
gachas = {record["key"]: record for record in table("00347_Gacha.bin")}
units = {
    str(unit["id"]): unit
    for unit in json.loads((ROOT / "btc-units-chatgpt.json").read_text(encoding="utf-8"))["units"]
}


def item_name(code: str) -> str:
    item = items.get(str(code), {})
    token = item.get("fields", {}).get("2", f"tid#ItemName_{code}")
    return translations.get(token) or translations.get(f"tid#ItemName_{code}") or f"Item #{code}"


def reward_entry(raw: dict, featured_id: str) -> dict:
    code = str(raw.get("code", ""))
    reward_type = str(raw.get("type", ""))
    if reward_type == "3":
        hero_id = featured_id if code == "-1" else code
        unit = units.get(hero_id, {})
        return {
            "kind": "featured" if hero_id == featured_id else "hero",
            "code": hero_id,
            "name": unit.get("name") or f"Hero #{hero_id}",
            "title": unit.get("title") or "",
            "rarity": unit.get("rarity") or "",
            "amount": raw.get("amount", 1),
            **({"probability": raw["prob"]} if "prob" in raw else {}),
        }
    return {
        "kind": "item",
        "code": code,
        "name": item_name(code),
        "amount": raw.get("amount", 1),
        **({"probability": raw["prob"]} if "prob" in raw else {}),
    }


def chest_choices(chest_id: str, featured_id: str) -> list[dict]:
    item = items.get(chest_id)
    if not item:
        return []
    result = []
    for reward_id in item["fields"].get("14", []):
        reward = rewards.get(reward_id)
        if not reward:
            continue
        payload = json.loads(reward["fields"].get("3", "[]"))
        if payload:
            result.append(reward_entry(payload[0], featured_id))
    return result


banners = []
for key in CANONICAL_GACHAS:
    fields = gachas[key]["fields"]
    hero_id = str(fields["30"])
    hero = units.get(hero_id, {})
    normal = json.loads(fields["21"])
    bonus_groups = json.loads(fields["5"])
    bonus_raw = bonus_groups[0]["100"]
    milestone = json.loads(fields["4"])[0]["100"]
    chest_id = str(milestone["item"])
    bonus = [reward_entry(entry, hero_id) for entry in bonus_raw]
    reward_chest_ids = [entry["code"] for entry in bonus if entry["kind"] == "item" and entry["code"].startswith("218")]
    selection_chest_id = reward_chest_ids[0] if reward_chest_ids else ""
    banners.append({
        "key": key,
        "featuredId": hero_id,
        "featuredName": hero.get("name") or f"Hero #{hero_id}",
        "featuredTitle": hero.get("title") or "",
        "featuredRarity": hero.get("rarity") or "",
        "ticketId": str(fields["12"]),
        "ticketName": item_name(str(fields["12"])),
        "diamondCost": fields["13"],
        "milestoneAt": 100,
        "milestoneDisplayItemId": chest_id,
        "milestoneDisplayItemName": item_name(chest_id),
        "switchableHeroIds": [str(value) for value in fields.get("28", [hero_id])],
        "normalCharacters": [reward_entry(entry, hero_id) for entry in normal["1"]],
        "normalItems": [reward_entry(entry, hero_id) for entry in normal["2"]],
        "cumulativeRewards": bonus,
        "selectionChestId": selection_chest_id,
        "selectionChestName": item_name(selection_chest_id) if selection_chest_id else "",
        "selectionChestChoices": chest_choices(selection_chest_id, hero_id) if selection_chest_id else [],
    })


output = {
    "format": "XIII Files Carnival Recruitment Simulator Data",
    "source": {
        "package": "com.tokyoghoulsea1.google",
        "version": "3.10814",
        "tables": ["00347_Gacha.bin", "00241_Item.bin", "00384_Reward.bin", "00155_TranslateForMultiEN.bin"],
    },
    "currentBannerKey": "SeasonGachaTest18_1150",
    "randomPotentialFamilies": ["Artifice", "Eliminate", "Initiate", "Potent", "Smash", "Undermine"],
    "note": "Chest items use choose-one reward lists from Item field 14 and fixed Reward entries; they are not random rolls.",
    "banners": banners,
}

OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"output": str(OUTPUT), "banners": len(banners)}, indent=2))
