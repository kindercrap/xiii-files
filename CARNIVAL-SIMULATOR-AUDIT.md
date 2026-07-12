# Carnival Simulator APK Audit

Source reviewed: installed-game extraction in `ldplayer-btc-export/config-data-extracted/textassets`.

## Verified current table

- Gacha record: `SeasonGachaTest18_1150` in `00347_Gacha.bin`
- Featured: Haise Sasaki [Sealed Memory], hero ID `1150`
- Cost: 1 Carnival Summon Ticket (`21135`) or 600 diamonds per draw
- Character result rate: 4.96%
  - Featured character: 1.00%
  - 22 standard SSR characters: 0.18% each, 3.96% total
- Item result rate: 95.04%
  - Panacean Star-Up Crystal: 0.70%
  - Panacean Refinement Crystal: 0.70%
  - Rainbow Token x100: 0.50%
  - Rainbow Token x30: 5.00%
  - Rainbow Token x10: 30.00%
  - Rainbow Token x5: 15.00%
  - Lv.4 Random Potential: 5.00%
  - WIT Cell Casket: 5.00%
  - Lv.3 Random Potential: 10.00%
  - Ability Booster x500: 10.00%
  - Ability Booster x300: 13.14%

## Cumulative reward

Every 100 draws unlocks one separate cumulative reward. The counter resets after that reward is received.

- Selected featured character: 30%
- Panacean Star-Up Crystal: 24%
- Panacean Refinement Crystal: 16%
- Carnival Selection Chest - Erosion: 30%

Although some English item-name rows say "Random Chest," `00241_Item.bin` defines these as choose-one items with a reward list and the instruction token translated as "Choose to get a reward upon use." Each selectable result points to a fixed entry in `00384_Reward.bin`. The current Erosion chest has 25 choices.

## Banner presets

The local simulator now contains 13 canonical Carnival records, from `SeasonGachaTest1` through `SeasonGachaTest18_1150` where the APK exposes an eligible selectable banner. Each preset retains its own normal item pool, Cell Casket type, chest identity, and chest choices. These canonical records use the 30% / 24% / 16% / 30% cumulative table. The APK also contains superseded legacy/test variants with different reward tables; those are intentionally excluded from the preset selector.

## Corrections to the supplied HTML simulator

1. Removed the invented guaranteed featured character at draw 100. The APK gives a random cumulative reward, not a guaranteed featured copy.
2. Removed the rule that prevents another featured character after one is drawn within a 100-draw block. Normal draws remain independent.
3. Preserved the separate 100-draw cumulative reward instead of combining it with an extra pity copy.
4. Replaced informal item names with translated in-game names.
5. Removed the unverified star/refinement upgrade calculator. Those progression rules are separate from the Carnival gacha table and should not be presented as part of the verified pull model.
6. Added a manual reward-claim gate at 100 draws, matching the rule that progress resets after the cumulative reward is received.
7. Separated Carnival Ticket and diamond spending, including configurable payment priority and insufficient-funds behavior.
8. Replaced the generic chest roll with banner-specific choose-one chest contents.

## Source rule text

`00244_Rules.bin` maps Carnival Recruitment to `SeasonGachaRule`. The English rule records in `00155_TranslateForMultiEN.bin` state that a cumulative reward is earned every 100 draws, resets after receipt, can repeat during the event, and does not carry over. Switching to previous Carnival characters is allowed only when total summon progress is 0 or reset.
