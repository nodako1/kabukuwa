import type { HotspotDefinition, LocationDefinition, LocationId } from "../types/game";

const trees = (prefix: string, positions: Array<[number, number]>): HotspotDefinition[] =>
  positions.map(([x, y], index) => ({
    id: `${prefix}-${index + 1}`,
    label: `木${index + 1}`,
    kind: "tree",
    x,
    y,
  }));

export const locations: LocationDefinition[] = [
  {
    id: "grandma-house",
    name: "おばあちゃんの家",
    mapLabel: "おばあちゃんの家",
    description: "縁側から蝉の声が聞こえる、夏休みの拠点。",
    travelMinutes: 15,
    hotspots: [],
  },
  {
    id: "backyard",
    name: "おばあちゃんの家の裏庭",
    mapLabel: "裏庭",
    description: "昼は木陰、夜はトラップを巡って採集できる特別な庭。",
    travelMinutes: 15,
    hotspots: [
      { id: "backyard-tree-1", label: "クヌギ", kind: "tree", x: 18, y: 43 },
      { id: "backyard-tree-2", label: "柿の木", kind: "tree", x: 78, y: 38 },
      { id: "backyard-sap", label: "樹液", kind: "sap", x: 28, y: 70 },
      { id: "backyard-banana", label: "バナナトラップ", kind: "banana-trap", x: 61, y: 70 },
      {
        id: "backyard-light",
        label: "ライトトラップ",
        kind: "light-trap",
        x: 86,
        y: 64,
        activePeriods: ["night"],
      },
    ],
  },
  {
    id: "shrine",
    name: "古い神社",
    mapLabel: "神社",
    description: "ひんやりした石段と大木が残る、小さな神社。",
    travelMinutes: 15,
    daytimeOnly: true,
    hotspots: trees("shrine-tree", [
      [14, 39],
      [42, 31],
      [75, 40],
      [29, 67],
      [71, 69],
    ]),
  },
  {
    id: "mixed-forest",
    name: "雑木林",
    mapLabel: "雑木林",
    description: "いろいろな木が混ざり、どこからか羽音がする。",
    travelMinutes: 15,
    daytimeOnly: true,
    hotspots: trees("mixed-tree", [
      [13, 36],
      [39, 44],
      [69, 32],
      [26, 73],
      [76, 70],
    ]),
  },
  {
    id: "oak-forest",
    name: "クヌギ林",
    mapLabel: "クヌギ林",
    description: "樹液の匂いが濃い、村いちばんの採集場所。",
    travelMinutes: 15,
    daytimeOnly: true,
    hotspots: trees("oak-tree", [
      [16, 33],
      [47, 39],
      [81, 34],
      [31, 70],
      [69, 67],
    ]),
  },
  {
    id: "bamboo-grove",
    name: "竹林",
    mapLabel: "竹林",
    description: "風が吹くたび、青竹がさらさらと鳴る。",
    travelMinutes: 15,
    daytimeOnly: true,
    hotspots: trees("bamboo-tree", [
      [12, 31],
      [37, 38],
      [64, 31],
      [25, 71],
      [78, 67],
    ]),
  },
  {
    id: "school",
    name: "小学校",
    mapLabel: "小学校",
    description: "夏休みの校庭。裏門の木陰は意外な穴場。",
    travelMinutes: 15,
    daytimeOnly: true,
    hotspots: trees("school-tree", [
      [15, 42],
      [39, 32],
      [73, 39],
      [28, 72],
      [77, 70],
    ]),
  },
  {
    id: "secret-forest",
    name: "秘密の森",
    mapLabel: "秘密の森",
    description: "夕方だけ道が見える、地図にない深い森。",
    travelMinutes: 15,
    daytimeOnly: true,
    secret: true,
    hotspots: trees("secret-tree", [
      [10, 37],
      [36, 29],
      [68, 36],
      [28, 71],
      [78, 68],
    ]),
  },
];

export const locationById = Object.fromEntries(
  locations.map((location) => [location.id, location]),
) as Record<LocationId, LocationDefinition>;

export const HOME_LOCATION_IDS: LocationId[] = ["grandma-house", "backyard"];
