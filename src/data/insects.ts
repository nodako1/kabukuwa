import type { InsectDefinition, InsectId } from "../types/game";

const DAY_FORESTS = [
  "backyard",
  "shrine",
  "mixed-forest",
  "oak-forest",
  "bamboo-grove",
  "school",
  "secret-forest",
] as const;

export const insects: InsectDefinition[] = [
  {
    id: "japanese-rhino",
    name: "カブトムシ",
    family: "カブトムシ",
    rarity: 1,
    minSizeMm: 35,
    maxSizeMm: 85,
    hint: "朝早い時間か、夜の樹液を探してみよう。",
    appearances: [
      { locations: [...DAY_FORESTS], periods: ["morning", "evening"], chance: 0.2 },
      { locations: [...DAY_FORESTS], periods: ["day"], chance: 0.08 },
      {
        locations: ["backyard"],
        periods: ["night"],
        chance: 0.28,
        spotKinds: ["tree", "sap", "banana-trap", "light-trap"],
      },
    ],
  },
  {
    id: "saw-stag",
    name: "ノコギリクワガタ",
    family: "クワガタムシ",
    rarity: 2,
    minSizeMm: 25,
    maxSizeMm: 74,
    hint: "雑木林やクヌギ林の少し低い場所も見てみよう。",
    appearances: [
      { locations: [...DAY_FORESTS], periods: ["morning", "evening"], chance: 0.16 },
      { locations: [...DAY_FORESTS], periods: ["day"], chance: 0.06 },
      { locations: ["backyard"], periods: ["night"], chance: 0.18 },
    ],
  },
  {
    id: "miyama-stag",
    name: "ミヤマクワガタ",
    family: "クワガタムシ",
    rarity: 3,
    minSizeMm: 30,
    maxSizeMm: 79,
    hint: "涼しい林では、夕方にも出会えるかもしれない。",
    appearances: [
      {
        locations: ["mixed-forest", "bamboo-grove", "secret-forest"],
        periods: ["morning", "evening"],
        chance: 0.1,
      },
      { locations: ["mixed-forest", "secret-forest"], periods: ["day"], chance: 0.03 },
    ],
  },
  {
    id: "giant-stag",
    name: "オオクワガタ",
    family: "クワガタムシ",
    rarity: 5,
    minSizeMm: 32,
    maxSizeMm: 83,
    hint: "昼でも可能性はゼロではない。古い大木を根気よく探そう。",
    appearances: [
      {
        locations: ["shrine", "oak-forest", "secret-forest"],
        periods: ["morning", "evening"],
        chance: 0.018,
      },
      {
        locations: ["shrine", "oak-forest", "secret-forest"],
        periods: ["day"],
        chance: 0.005,
      },
      { locations: ["backyard"], periods: ["night"], chance: 0.012 },
    ],
  },
  {
    id: "atlas-beetle",
    name: "アトラスオオカブト",
    family: "カブトムシ",
    rarity: 5,
    minSizeMm: 45,
    maxSizeMm: 110,
    hint: "外国産のカブトムシは、夜の裏庭に現れるという噂。",
    appearances: [
      {
        locations: ["backyard"],
        periods: ["night"],
        chance: 0.01,
        spotKinds: ["banana-trap", "light-trap"],
      },
    ],
  },
];

export const insectById = Object.fromEntries(
  insects.map((insect) => [insect.id, insect]),
) as Record<InsectId, InsectDefinition>;
