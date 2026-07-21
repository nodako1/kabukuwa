import { fields } from "./fields";
import { locationById } from "./locations";
import type {
  HotspotDefinition,
  InspectionSceneKind,
  TimePeriod,
  TrapState,
  TreeDefinition,
  TreeInspectionPoint,
} from "../types/game";

const point = (
  treeId: string,
  sceneKind: InspectionSceneKind,
  label: string,
  options: {
    unlockAfterPointId?: string;
    activePeriods?: TimePeriod[];
    tags?: string[];
  } = {},
): TreeInspectionPoint => ({
  id: `${treeId}:${sceneKind}`,
  label,
  sceneKind,
  unlockAfterPointId: options.unlockAfterPointId,
  activePeriods: options.activePeriods,
  encounterWeightTags: options.tags ?? [sceneKind],
});

const pointsForHotspot = (hotspot: HotspotDefinition): TreeInspectionPoint[] => {
  if (hotspot.kind === "banana-trap") {
    const trap = point(hotspot.id, "banana-trap", "バナナトラップ", {
      activePeriods: hotspot.activePeriods,
      tags: ["sweet", "trap"],
    });
    return [trap, point(hotspot.id, "root", "仕掛けの下の落ち葉", {
      unlockAfterPointId: trap.id,
      activePeriods: hotspot.activePeriods,
    })];
  }
  if (hotspot.kind === "light-trap") {
    const trap = point(hotspot.id, "light-trap", "ライトトラップ", {
      activePeriods: hotspot.activePeriods,
      tags: ["light", "trap"],
    });
    return [trap, point(hotspot.id, "bark-crack", "灯りの横の幹", {
      unlockAfterPointId: trap.id,
      activePeriods: hotspot.activePeriods,
    })];
  }
  if (hotspot.kind === "sap") {
    const sap = point(hotspot.id, "sap", "樹液が出ているところ");
    return [sap, point(hotspot.id, "root", "木の根元", { unlockAfterPointId: sap.id })];
  }

  const match = hotspot.id.match(/-(\d+)$/);
  const index = Number(match?.[1] ?? 1);
  if (index === 2) {
    const crack = point(hotspot.id, "bark-crack", "幹の割れ目");
    return [crack, point(hotspot.id, "root", "足元の落ち葉", { unlockAfterPointId: crack.id })];
  }
  if (index === 3) {
    const sap = point(hotspot.id, "sap", "樹液が出ているところ");
    const crack = point(hotspot.id, "bark-crack", "幹の割れ目", { unlockAfterPointId: sap.id });
    return [
      sap,
      crack,
      point(hotspot.id, "root", "木の根元", { unlockAfterPointId: crack.id }),
    ];
  }
  if (index === 4) {
    return [point(hotspot.id, "bark-crack", "細い幹のすき間")];
  }
  const sap = point(hotspot.id, "sap", "樹液が出ているところ");
  return [sap, point(hotspot.id, "root", "木の根元", { unlockAfterPointId: sap.id })];
};

const speciesForField = (fieldId: TreeDefinition["fieldId"]): TreeDefinition["species"] => {
  if (["oak-forest", "mixed-forest", "shrine", "secret-forest", "backyard"].includes(fieldId)) {
    return "kunugi";
  }
  if (fieldId === "school") return "konara";
  return "other";
};

export const trees: TreeDefinition[] = fields.flatMap((field) => {
  if (!field.locationId) return [];
  const location = locationById[field.locationId];
  return field.hotspots.flatMap((position) => {
    const hotspot = location.hotspots.find((candidate) => candidate.id === position.spotId);
    if (!hotspot) return [];
    const inspectionPoints = pointsForHotspot(hotspot);
    return [{
      id: hotspot.id,
      legacySpotId: hotspot.id,
      fieldId: field.id,
      label: hotspot.label,
      species: speciesForField(field.id),
      x: position.x,
      y: position.y,
      primaryPointId: inspectionPoints[0].id,
      inspectionPoints,
      clueProfileId: hotspot.kind === "light-trap" ? "light" : hotspot.kind === "banana-trap" ? "sweet" : "tree",
      encounterKind: hotspot.kind,
      trapKind: hotspot.kind === "banana-trap" ? "banana" : hotspot.kind === "light-trap" ? "light" : undefined,
    } satisfies TreeDefinition];
  });
});

export const treeById = Object.fromEntries(
  trees.map((tree) => [tree.id, tree]),
) as Record<string, TreeDefinition>;

export const treesByFieldId = Object.fromEntries(
  fields.map((field) => [field.id, trees.filter((tree) => tree.fieldId === field.id)]),
) as Record<TreeDefinition["fieldId"], TreeDefinition[]>;

export const legacySpotToTreeId = Object.fromEntries(
  trees.map((tree) => [tree.legacySpotId, tree.id]),
) as Record<string, string>;

export const initialTrapStates = (): Record<string, TrapState> => Object.fromEntries(
  trees.flatMap((tree) => tree.trapKind
    ? [[tree.id, { kind: tree.trapKind, installed: true } satisfies TrapState] as const]
    : []),
);
