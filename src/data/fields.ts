import type { FieldId, FacingDirection, LocationId, NpcId } from "../types/game";

export type FieldTheme =
  | "home"
  | "backyard"
  | "paddy"
  | "shrine"
  | "forest"
  | "bamboo"
  | "school"
  | "secret";

export type FieldObjectKind =
  | "house"
  | "shed"
  | "fence"
  | "water"
  | "paddy"
  | "torii"
  | "shrine"
  | "stone"
  | "bush"
  | "bamboo"
  | "school"
  | "flower";

export interface FieldSpawnPoint {
  id: string;
  x: number;
  y: number;
  facing: FacingDirection;
}

export interface EdgeExit {
  id: string;
  label: string;
  side: "top" | "right" | "bottom" | "left";
  rangeStart: number;
  rangeEnd: number;
  toFieldId: FieldId;
  toSpawnId: string;
  travelMinutes: number;
  requiresSecretRoute?: boolean;
}

export type FieldExit = EdgeExit;

export interface FieldObject {
  id: string;
  kind: FieldObjectKind;
  x: number;
  y: number;
  width: number;
  height: number;
  solid?: boolean;
  label?: string;
}

export interface PositionedHotspot {
  spotId: string;
  x: number;
  y: number;
}

export interface NpcPosition {
  npcId: NpcId;
  x: number;
  y: number;
}

export interface FieldRewardPoint {
  x: number;
  y: number;
  label: string;
}

export interface FieldDefinition {
  id: FieldId;
  name: string;
  description: string;
  theme: FieldTheme;
  locationId?: LocationId;
  width: number;
  height: number;
  defaultSpawnId: string;
  spawnPoints: FieldSpawnPoint[];
  exits: EdgeExit[];
  objects: FieldObject[];
  hotspots: PositionedHotspot[];
  npcPositions: NpcPosition[];
  rewardPoint?: FieldRewardPoint;
  secret?: boolean;
}

const spawn = (
  id: string,
  x: number,
  y: number,
  facing: FacingDirection,
): FieldSpawnPoint => ({ id, x, y, facing });

export const fields: FieldDefinition[] = [
  {
    id: "grandma-house",
    name: "おばあちゃんの家",
    description: "縁側と土の庭。ここから今日の虫取りが始まる。",
    theme: "home",
    locationId: "grandma-house",
    width: 1200,
    height: 1000,
    defaultSpawnId: "start",
    spawnPoints: [
      spawn("start", 570, 710, "up"),
      spawn("from-paddy", 1128, 700, "left"),
      spawn("from-backyard", 72, 700, "right"),
      spawn("from-forest", 560, 72, "down"),
    ],
    exits: [
      {
        id: "to-paddy",
        label: "田んぼ道へ",
        side: "right",
        rangeStart: 620,
        rangeEnd: 780,
        toFieldId: "paddy-road",
        toSpawnId: "from-house",
        travelMinutes: 5,
      },
      {
        id: "to-backyard",
        label: "裏庭へ",
        side: "left",
        rangeStart: 620,
        rangeEnd: 780,
        toFieldId: "backyard",
        toSpawnId: "from-house",
        travelMinutes: 5,
      },
      {
        id: "to-forest",
        label: "林道へ",
        side: "top",
        rangeStart: 480,
        rangeEnd: 640,
        toFieldId: "forest-road",
        toSpawnId: "from-house",
        travelMinutes: 5,
      },
    ],
    objects: [
      { id: "house", kind: "house", x: 730, y: 280, width: 390, height: 330, solid: true, label: "家" },
      { id: "shed", kind: "shed", x: 120, y: 180, width: 220, height: 170, solid: true },
      { id: "fence-left", kind: "fence", x: 0, y: 0, width: 60, height: 600, solid: true },
      { id: "fence-right-top", kind: "fence", x: 1140, y: 0, width: 60, height: 590, solid: true },
      { id: "fence-right-bottom", kind: "fence", x: 1140, y: 810, width: 60, height: 190, solid: true },
      { id: "flowers", kind: "flower", x: 780, y: 650, width: 260, height: 70 },
    ],
    hotspots: [],
    npcPositions: [{ npcId: "grandma", x: 700, y: 690 }],
    rewardPoint: { x: 930, y: 680, label: "おばあちゃんの応援" },
  },
  {
    id: "backyard",
    name: "おばあちゃんの家の裏庭",
    description: "昼は木陰、夜は三つのトラップが待つ特別な庭。",
    theme: "backyard",
    locationId: "backyard",
    width: 1100,
    height: 1050,
    defaultSpawnId: "from-house",
    spawnPoints: [spawn("from-house", 1028, 870, "left")],
    exits: [
      {
        id: "to-house",
        label: "家へ戻る",
        side: "right",
        rangeStart: 790,
        rangeEnd: 940,
        toFieldId: "grandma-house",
        toSpawnId: "from-backyard",
        travelMinutes: 5,
      },
    ],
    objects: [
      { id: "shed", kind: "shed", x: 800, y: 80, width: 230, height: 180, solid: true },
      { id: "fence-top", kind: "fence", x: 0, y: 0, width: 760, height: 55, solid: true },
      { id: "fence-left", kind: "fence", x: 0, y: 0, width: 55, height: 1050, solid: true },
      { id: "bush", kind: "bush", x: 410, y: 410, width: 220, height: 115, solid: true },
    ],
    hotspots: [
      { spotId: "backyard-tree-1", x: 190, y: 260 },
      { spotId: "backyard-tree-2", x: 700, y: 270 },
      { spotId: "backyard-sap", x: 270, y: 690 },
      { spotId: "backyard-banana", x: 590, y: 720 },
      { spotId: "backyard-light", x: 850, y: 590 },
    ],
    npcPositions: [{ npcId: "grandma", x: 840, y: 820 }],
  },
  {
    id: "paddy-road",
    name: "田んぼ道",
    description: "用水路の音と稲の匂いが続く、神社までの一本道。",
    theme: "paddy",
    width: 900,
    height: 1600,
    defaultSpawnId: "from-house",
    spawnPoints: [
      spawn("from-house", 72, 800, "right"),
      spawn("from-shrine", 828, 800, "left"),
    ],
    exits: [
      {
        id: "to-house",
        label: "おばあちゃんの家へ",
        side: "left",
        rangeStart: 720,
        rangeEnd: 880,
        toFieldId: "grandma-house",
        toSpawnId: "from-paddy",
        travelMinutes: 5,
      },
      {
        id: "to-shrine",
        label: "神社へ",
        side: "right",
        rangeStart: 720,
        rangeEnd: 880,
        toFieldId: "shrine",
        toSpawnId: "from-paddy",
        travelMinutes: 5,
      },
    ],
    objects: [
      { id: "paddy-top", kind: "paddy", x: 0, y: 0, width: 900, height: 650, solid: true },
      { id: "water-top", kind: "water", x: 0, y: 650, width: 900, height: 50, solid: true },
      { id: "water-bottom", kind: "water", x: 0, y: 900, width: 900, height: 50, solid: true },
      { id: "paddy-bottom", kind: "paddy", x: 0, y: 950, width: 900, height: 650, solid: true },
      { id: "stone-one", kind: "stone", x: 330, y: 760, width: 50, height: 35, solid: true },
      { id: "stone-two", kind: "stone", x: 560, y: 825, width: 55, height: 38, solid: true },
    ],
    hotspots: [],
    npcPositions: [],
  },
  {
    id: "shrine",
    name: "古い神社",
    description: "石段と大木が残る境内。左手の藪が少し気になる。",
    theme: "shrine",
    locationId: "shrine",
    width: 1300,
    height: 1100,
    defaultSpawnId: "from-paddy",
    spawnPoints: [
      spawn("from-paddy", 72, 850, "right"),
      spawn("from-bamboo", 1000, 72, "down"),
      spawn("from-secret", 1228, 430, "left"),
    ],
    exits: [
      {
        id: "to-paddy",
        label: "田んぼ道へ",
        side: "left",
        rangeStart: 770,
        rangeEnd: 930,
        toFieldId: "paddy-road",
        toSpawnId: "from-shrine",
        travelMinutes: 5,
      },
      {
        id: "to-bamboo",
        label: "竹林へ",
        side: "top",
        rangeStart: 920,
        rangeEnd: 1080,
        toFieldId: "bamboo-grove",
        toSpawnId: "from-shrine",
        travelMinutes: 5,
      },
      {
        id: "to-secret",
        label: "草むらの奥へ",
        side: "right",
        rangeStart: 350,
        rangeEnd: 510,
        toFieldId: "secret-path",
        toSpawnId: "from-shrine",
        travelMinutes: 5,
        requiresSecretRoute: true,
      },
    ],
    objects: [
      { id: "main-shrine", kind: "shrine", x: 475, y: 70, width: 350, height: 230, solid: true },
      { id: "torii", kind: "torii", x: 570, y: 760, width: 160, height: 55, solid: true },
      { id: "stone-wall-left", kind: "stone", x: 0, y: 0, width: 55, height: 330, solid: true },
      { id: "stone-wall-right", kind: "stone", x: 1245, y: 0, width: 55, height: 330, solid: true },
    ],
    hotspots: [
      { spotId: "shrine-tree-1", x: 240, y: 280 },
      { spotId: "shrine-tree-2", x: 610, y: 350 },
      { spotId: "shrine-tree-3", x: 1000, y: 280 },
      { spotId: "shrine-tree-4", x: 360, y: 720 },
      { spotId: "shrine-tree-5", x: 930, y: 730 },
    ],
    npcPositions: [{ npcId: "shrine-keeper", x: 690, y: 470 }],
  },
  {
    id: "forest-road",
    name: "林道",
    description: "雑木林から家へ戻る、木漏れ日の周回路。",
    theme: "forest",
    width: 1800,
    height: 1100,
    defaultSpawnId: "from-mixed",
    spawnPoints: [
      spawn("from-mixed", 900, 72, "down"),
      spawn("from-house", 900, 1028, "up"),
    ],
    exits: [
      { id: "to-mixed", label: "雑木林へ", side: "top", rangeStart: 820, rangeEnd: 980, toFieldId: "mixed-forest", toSpawnId: "from-road", travelMinutes: 5 },
      { id: "to-house", label: "おばあちゃんの家へ", side: "bottom", rangeStart: 820, rangeEnd: 980, toFieldId: "grandma-house", toSpawnId: "from-forest", travelMinutes: 5 },
    ],
    objects: [
      { id: "north-bush-one", kind: "bush", x: 0, y: 0, width: 790, height: 330, solid: true },
      { id: "north-bush-two", kind: "bush", x: 1010, y: 0, width: 790, height: 330, solid: true },
      { id: "south-bush-one", kind: "bush", x: 0, y: 790, width: 790, height: 310, solid: true },
      { id: "south-bush-two", kind: "bush", x: 1010, y: 790, width: 790, height: 310, solid: true },
      { id: "road-stone", kind: "stone", x: 1050, y: 560, width: 58, height: 40, solid: true },
    ],
    hotspots: [],
    npcPositions: [],
  },
  {
    id: "mixed-forest",
    name: "雑木林",
    description: "木の種類が多く、どこからか羽音が聞こえる。",
    theme: "forest",
    locationId: "mixed-forest",
    width: 1150,
    height: 1050,
    defaultSpawnId: "from-road",
    spawnPoints: [
      spawn("from-oak", 1078, 300, "left"),
      spawn("from-road", 575, 978, "up"),
    ],
    exits: [
      { id: "to-oak", label: "クヌギ林へ", side: "right", rangeStart: 220, rangeEnd: 380, toFieldId: "oak-forest", toSpawnId: "from-mixed", travelMinutes: 5 },
      { id: "to-road", label: "林道へ", side: "bottom", rangeStart: 495, rangeEnd: 655, toFieldId: "forest-road", toSpawnId: "from-mixed", travelMinutes: 5 },
    ],
    objects: [
      { id: "bush-left", kind: "bush", x: 0, y: 0, width: 80, height: 1050, solid: true },
      { id: "bush-right-top", kind: "bush", x: 1070, y: 0, width: 80, height: 190, solid: true },
      { id: "bush-right-bottom", kind: "bush", x: 1070, y: 410, width: 80, height: 640, solid: true },
      { id: "fallen", kind: "bush", x: 460, y: 520, width: 230, height: 90, solid: true },
    ],
    hotspots: [
      { spotId: "mixed-tree-1", x: 190, y: 250 },
      { spotId: "mixed-tree-2", x: 470, y: 320 },
      { spotId: "mixed-tree-3", x: 850, y: 240 },
      { spotId: "mixed-tree-4", x: 300, y: 720 },
      { spotId: "mixed-tree-5", x: 870, y: 700 },
    ],
    npcPositions: [],
  },
  {
    id: "oak-forest",
    name: "クヌギ林",
    description: "樹液の匂いが濃い、村いちばんの採集場所。",
    theme: "forest",
    locationId: "oak-forest",
    width: 1200,
    height: 1100,
    defaultSpawnId: "from-school",
    spawnPoints: [
      spawn("from-school", 1128, 800, "left"),
      spawn("from-mixed", 72, 300, "right"),
    ],
    exits: [
      { id: "to-school", label: "小学校へ", side: "right", rangeStart: 720, rangeEnd: 880, toFieldId: "school", toSpawnId: "from-oak", travelMinutes: 5 },
      { id: "to-mixed", label: "雑木林へ", side: "left", rangeStart: 220, rangeEnd: 380, toFieldId: "mixed-forest", toSpawnId: "from-oak", travelMinutes: 5 },
    ],
    objects: [
      { id: "bush-top", kind: "bush", x: 0, y: 0, width: 1200, height: 70, solid: true },
      { id: "bush-left-top", kind: "bush", x: 0, y: 0, width: 70, height: 190, solid: true },
      { id: "bush-left-bottom", kind: "bush", x: 0, y: 410, width: 70, height: 690, solid: true },
      { id: "bush-right-top", kind: "bush", x: 1130, y: 0, width: 70, height: 690, solid: true },
      { id: "bush-right-bottom", kind: "bush", x: 1130, y: 910, width: 70, height: 190, solid: true },
      { id: "stone", kind: "stone", x: 540, y: 600, width: 110, height: 60, solid: true },
    ],
    hotspots: [
      { spotId: "oak-tree-1", x: 190, y: 240 },
      { spotId: "oak-tree-2", x: 510, y: 310 },
      { spotId: "oak-tree-3", x: 930, y: 250 },
      { spotId: "oak-tree-4", x: 330, y: 760 },
      { spotId: "oak-tree-5", x: 900, y: 730 },
    ],
    npcPositions: [{ npcId: "professor", x: 690, y: 470 }],
  },
  {
    id: "bamboo-grove",
    name: "竹林",
    description: "青竹の間を細い道が抜け、風がさらさらと鳴る。",
    theme: "bamboo",
    locationId: "bamboo-grove",
    width: 1050,
    height: 1250,
    defaultSpawnId: "from-shrine",
    spawnPoints: [
      spawn("from-shrine", 525, 1178, "up"),
      spawn("from-school", 525, 72, "down"),
    ],
    exits: [
      { id: "to-shrine", label: "神社へ", side: "bottom", rangeStart: 445, rangeEnd: 605, toFieldId: "shrine", toSpawnId: "from-bamboo", travelMinutes: 5 },
      { id: "to-school", label: "小学校へ", side: "top", rangeStart: 445, rangeEnd: 605, toFieldId: "school", toSpawnId: "from-bamboo", travelMinutes: 5 },
    ],
    objects: [
      { id: "bamboo-left", kind: "bamboo", x: 0, y: 0, width: 180, height: 1250, solid: true },
      { id: "bamboo-right", kind: "bamboo", x: 870, y: 0, width: 180, height: 1250, solid: true },
      { id: "bamboo-mid", kind: "bamboo", x: 430, y: 500, width: 190, height: 150, solid: true },
    ],
    hotspots: [
      { spotId: "bamboo-tree-1", x: 250, y: 300 },
      { spotId: "bamboo-tree-2", x: 490, y: 370 },
      { spotId: "bamboo-tree-3", x: 760, y: 300 },
      { spotId: "bamboo-tree-4", x: 310, y: 880 },
      { spotId: "bamboo-tree-5", x: 730, y: 930 },
    ],
    npcPositions: [],
  },
  {
    id: "school",
    name: "小学校",
    description: "夏休みの校庭。裏門の木陰は意外な穴場。",
    theme: "school",
    locationId: "school",
    width: 1400,
    height: 1050,
    defaultSpawnId: "from-bamboo",
    spawnPoints: [
      spawn("from-bamboo", 1200, 978, "up"),
      spawn("from-oak", 72, 520, "right"),
    ],
    exits: [
      { id: "to-bamboo", label: "竹林へ", side: "bottom", rangeStart: 1120, rangeEnd: 1280, toFieldId: "bamboo-grove", toSpawnId: "from-school", travelMinutes: 5 },
      { id: "to-oak", label: "クヌギ林へ", side: "left", rangeStart: 440, rangeEnd: 600, toFieldId: "oak-forest", toSpawnId: "from-school", travelMinutes: 5 },
    ],
    objects: [
      { id: "school-building", kind: "school", x: 760, y: 80, width: 560, height: 280, solid: true, label: "校舎" },
      { id: "pool", kind: "water", x: 980, y: 650, width: 300, height: 190, solid: true },
      { id: "fence", kind: "fence", x: 0, y: 0, width: 50, height: 440, solid: true },
    ],
    hotspots: [
      { spotId: "school-tree-1", x: 280, y: 260 },
      { spotId: "school-tree-2", x: 570, y: 210 },
      { spotId: "school-tree-3", x: 1050, y: 430 },
      { spotId: "school-tree-4", x: 440, y: 790 },
      { spotId: "school-tree-5", x: 820, y: 820 },
    ],
    npcPositions: [
      { npcId: "rival", x: 650, y: 520 },
      { npcId: "candy-shopkeeper", x: 260, y: 650 },
    ],
  },
  {
    id: "secret-path",
    name: "秘密の小道",
    description: "夕方の光でだけ輪郭が見える、草木に隠れた道。",
    theme: "secret",
    width: 800,
    height: 1500,
    defaultSpawnId: "from-shrine",
    spawnPoints: [
      spawn("from-shrine", 400, 1428, "up"),
      spawn("from-secret", 400, 72, "down"),
    ],
    exits: [
      { id: "to-shrine", label: "神社へ戻る", side: "bottom", rangeStart: 320, rangeEnd: 480, toFieldId: "shrine", toSpawnId: "from-secret", travelMinutes: 5 },
      { id: "to-secret", label: "秘密の森へ", side: "top", rangeStart: 320, rangeEnd: 480, toFieldId: "secret-forest", toSpawnId: "from-path", travelMinutes: 5, requiresSecretRoute: true },
    ],
    objects: [
      { id: "brush-left", kind: "bush", x: 0, y: 0, width: 245, height: 1500, solid: true },
      { id: "brush-right", kind: "bush", x: 555, y: 0, width: 245, height: 1500, solid: true },
      { id: "stone-one", kind: "stone", x: 270, y: 980, width: 55, height: 40, solid: true },
      { id: "stone-two", kind: "stone", x: 490, y: 610, width: 58, height: 42, solid: true },
    ],
    hotspots: [],
    npcPositions: [],
    secret: true,
  },
  {
    id: "secret-forest",
    name: "秘密の森",
    description: "夕日が差す、地図に載っていない深い森。",
    theme: "secret",
    locationId: "secret-forest",
    width: 1250,
    height: 1100,
    defaultSpawnId: "from-path",
    spawnPoints: [spawn("from-path", 625, 1028, "up")],
    exits: [{ id: "to-path", label: "秘密の小道へ", side: "bottom", rangeStart: 545, rangeEnd: 705, toFieldId: "secret-path", toSpawnId: "from-secret", travelMinutes: 5 }],
    objects: [
      { id: "brush-top", kind: "bush", x: 0, y: 0, width: 1250, height: 70, solid: true },
      { id: "brush-left", kind: "bush", x: 0, y: 0, width: 70, height: 1100, solid: true },
      { id: "brush-right", kind: "bush", x: 1180, y: 0, width: 70, height: 1100, solid: true },
      { id: "old-stone", kind: "stone", x: 540, y: 500, width: 160, height: 85, solid: true },
    ],
    hotspots: [
      { spotId: "secret-tree-1", x: 190, y: 280 },
      { spotId: "secret-tree-2", x: 500, y: 220 },
      { spotId: "secret-tree-3", x: 950, y: 290 },
      { spotId: "secret-tree-4", x: 330, y: 760 },
      { spotId: "secret-tree-5", x: 930, y: 750 },
    ],
    npcPositions: [{ npcId: "professor", x: 760, y: 560 }],
    secret: true,
  },
];

export const fieldById = Object.fromEntries(
  fields.map((field) => [field.id, field]),
) as Record<FieldId, FieldDefinition>;

export const HOME_FIELD_IDS: FieldId[] = ["grandma-house", "backyard"];

export const getSpawnPoint = (fieldId: FieldId, spawnId?: string): FieldSpawnPoint => {
  const field = fieldById[fieldId];
  return (
    field.spawnPoints.find((candidate) => candidate.id === spawnId) ??
    field.spawnPoints.find((candidate) => candidate.id === field.defaultSpawnId) ??
    field.spawnPoints[0]
  );
};
