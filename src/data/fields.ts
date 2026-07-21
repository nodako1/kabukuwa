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

export interface FieldExit {
  id: string;
  label: string;
  x: number;
  y: number;
  toFieldId: FieldId;
  toSpawnId: string;
  travelMinutes: number;
  requiresSecretRoute?: boolean;
}

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
  exits: FieldExit[];
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
      spawn("from-paddy", 590, 210, "down"),
      spawn("from-backyard", 260, 700, "right"),
    ],
    exits: [
      {
        id: "to-paddy",
        label: "田んぼ道へ",
        x: 590,
        y: 105,
        toFieldId: "paddy-road",
        toSpawnId: "from-house",
        travelMinutes: 5,
      },
      {
        id: "to-backyard",
        label: "裏庭へ",
        x: 125,
        y: 700,
        toFieldId: "backyard",
        toSpawnId: "from-house",
        travelMinutes: 5,
      },
    ],
    objects: [
      { id: "house", kind: "house", x: 730, y: 280, width: 390, height: 330, solid: true, label: "家" },
      { id: "shed", kind: "shed", x: 120, y: 180, width: 220, height: 170, solid: true },
      { id: "fence-left", kind: "fence", x: 0, y: 0, width: 60, height: 600, solid: true },
      { id: "fence-right", kind: "fence", x: 1140, y: 0, width: 60, height: 1000, solid: true },
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
    spawnPoints: [spawn("from-house", 900, 870, "left")],
    exits: [
      {
        id: "to-house",
        label: "家へ戻る",
        x: 1010,
        y: 870,
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
      spawn("from-house", 450, 1430, "up"),
      spawn("from-shrine", 450, 170, "down"),
    ],
    exits: [
      {
        id: "to-house",
        label: "おばあちゃんの家へ",
        x: 450,
        y: 1510,
        toFieldId: "grandma-house",
        toSpawnId: "from-paddy",
        travelMinutes: 5,
      },
      {
        id: "to-shrine",
        label: "神社へ",
        x: 450,
        y: 90,
        toFieldId: "shrine",
        toSpawnId: "from-paddy",
        travelMinutes: 5,
      },
    ],
    objects: [
      { id: "water-left", kind: "water", x: 250, y: 0, width: 55, height: 1600, solid: true },
      { id: "water-right", kind: "water", x: 595, y: 0, width: 55, height: 1600, solid: true },
      { id: "paddy-left", kind: "paddy", x: 0, y: 0, width: 250, height: 1600, solid: true },
      { id: "paddy-right", kind: "paddy", x: 650, y: 0, width: 250, height: 1600, solid: true },
      { id: "stone-one", kind: "stone", x: 325, y: 930, width: 50, height: 35, solid: true },
      { id: "stone-two", kind: "stone", x: 530, y: 510, width: 55, height: 38, solid: true },
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
      spawn("from-paddy", 650, 970, "up"),
      spawn("from-forest", 1120, 570, "left"),
      spawn("from-secret", 190, 430, "right"),
    ],
    exits: [
      {
        id: "to-paddy",
        label: "田んぼ道へ",
        x: 650,
        y: 1020,
        toFieldId: "paddy-road",
        toSpawnId: "from-shrine",
        travelMinutes: 5,
      },
      {
        id: "to-forest",
        label: "林道へ",
        x: 1210,
        y: 570,
        toFieldId: "forest-road",
        toSpawnId: "from-shrine",
        travelMinutes: 5,
      },
      {
        id: "to-secret",
        label: "草むらの奥へ",
        x: 90,
        y: 430,
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
      { id: "stone-wall-right", kind: "stone", x: 1245, y: 0, width: 55, height: 400, solid: true },
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
    description: "木漏れ日の分かれ道。看板を見て行き先を決めよう。",
    theme: "forest",
    width: 1800,
    height: 1100,
    defaultSpawnId: "from-shrine",
    spawnPoints: [
      spawn("from-shrine", 150, 550, "right"),
      spawn("from-mixed", 470, 210, "down"),
      spawn("from-oak", 880, 210, "down"),
      spawn("from-bamboo", 1280, 890, "up"),
      spawn("from-school", 1650, 550, "left"),
    ],
    exits: [
      { id: "to-shrine", label: "神社へ", x: 70, y: 550, toFieldId: "shrine", toSpawnId: "from-forest", travelMinutes: 5 },
      { id: "to-mixed", label: "雑木林へ", x: 470, y: 95, toFieldId: "mixed-forest", toSpawnId: "from-road", travelMinutes: 5 },
      { id: "to-oak", label: "クヌギ林へ", x: 880, y: 95, toFieldId: "oak-forest", toSpawnId: "from-road", travelMinutes: 5 },
      { id: "to-bamboo", label: "竹林へ", x: 1280, y: 1010, toFieldId: "bamboo-grove", toSpawnId: "from-road", travelMinutes: 5 },
      { id: "to-school", label: "小学校へ", x: 1730, y: 550, toFieldId: "school", toSpawnId: "from-road", travelMinutes: 5 },
    ],
    objects: [
      { id: "north-bush-one", kind: "bush", x: 0, y: 0, width: 370, height: 360, solid: true },
      { id: "north-bush-two", kind: "bush", x: 570, y: 0, width: 210, height: 340, solid: true },
      { id: "north-bush-three", kind: "bush", x: 980, y: 0, width: 820, height: 350, solid: true },
      { id: "south-bush-one", kind: "bush", x: 0, y: 760, width: 1080, height: 340, solid: true },
      { id: "south-bush-two", kind: "bush", x: 1430, y: 760, width: 370, height: 340, solid: true },
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
    spawnPoints: [spawn("from-road", 575, 920, "up")],
    exits: [{ id: "to-road", label: "林道へ", x: 575, y: 990, toFieldId: "forest-road", toSpawnId: "from-mixed", travelMinutes: 5 }],
    objects: [
      { id: "bush-left", kind: "bush", x: 0, y: 0, width: 80, height: 1050, solid: true },
      { id: "bush-right", kind: "bush", x: 1070, y: 0, width: 80, height: 1050, solid: true },
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
    defaultSpawnId: "from-road",
    spawnPoints: [spawn("from-road", 600, 960, "up")],
    exits: [{ id: "to-road", label: "林道へ", x: 600, y: 1030, toFieldId: "forest-road", toSpawnId: "from-oak", travelMinutes: 5 }],
    objects: [
      { id: "bush-top", kind: "bush", x: 0, y: 0, width: 1200, height: 70, solid: true },
      { id: "bush-left", kind: "bush", x: 0, y: 0, width: 70, height: 1100, solid: true },
      { id: "bush-right", kind: "bush", x: 1130, y: 0, width: 70, height: 1100, solid: true },
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
    defaultSpawnId: "from-road",
    spawnPoints: [spawn("from-road", 525, 180, "down")],
    exits: [{ id: "to-road", label: "林道へ", x: 525, y: 80, toFieldId: "forest-road", toSpawnId: "from-bamboo", travelMinutes: 5 }],
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
    defaultSpawnId: "from-road",
    spawnPoints: [spawn("from-road", 180, 550, "right")],
    exits: [{ id: "to-road", label: "林道へ", x: 80, y: 550, toFieldId: "forest-road", toSpawnId: "from-school", travelMinutes: 5 }],
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
      spawn("from-shrine", 400, 1350, "up"),
      spawn("from-secret", 400, 160, "down"),
    ],
    exits: [
      { id: "to-shrine", label: "神社へ戻る", x: 400, y: 1420, toFieldId: "shrine", toSpawnId: "from-secret", travelMinutes: 5 },
      { id: "to-secret", label: "秘密の森へ", x: 400, y: 80, toFieldId: "secret-forest", toSpawnId: "from-path", travelMinutes: 5, requiresSecretRoute: true },
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
    spawnPoints: [spawn("from-path", 625, 970, "up")],
    exits: [{ id: "to-path", label: "秘密の小道へ", x: 625, y: 1030, toFieldId: "secret-path", toSpawnId: "from-secret", travelMinutes: 5 }],
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

export const getDefaultFieldForLocation = (locationId: LocationId): FieldId => locationId;
