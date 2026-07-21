import { locationById } from "../data/locations";
import { treeById } from "../data/trees";
import type { CaptureSource, GameState, InsectId, Specimen } from "../types/game";

export type SpecimenSort = "newest" | "largest";

export const compareSpecimensNewest = (left: Specimen, right: Specimen): number =>
  right.day - left.day ||
  right.caughtAtMinutes - left.caughtAtMinutes ||
  (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

export const compareSpecimensLargest = (left: Specimen, right: Specimen): number =>
  right.sizeMm - left.sizeMm || compareSpecimensNewest(left, right);

export const getSpeciesSpecimens = (
  specimens: readonly Specimen[],
  insectId: InsectId,
  sort: SpecimenSort = "newest",
): Specimen[] => specimens
  .filter((specimen) => specimen.insectId === insectId)
  .sort(sort === "largest" ? compareSpecimensLargest : compareSpecimensNewest);

export const getSpeciesBestSize = (
  specimens: readonly Specimen[],
  insectId: InsectId,
): number => specimens.reduce(
  (best, specimen) => specimen.insectId === insectId ? Math.max(best, specimen.sizeMm) : best,
  0,
);

export const getBestDifference = (specimen: Specimen, bestSize: number): number =>
  Math.max(0, Math.round((bestSize - specimen.sizeMm) * 10) / 10);

export const getFavoriteSpecimens = (state: GameState): Specimen[] => {
  const byId = new Map(state.specimens.map((specimen) => [specimen.id, specimen]));
  return [...state.favoriteSpecimenIds]
    .reverse()
    .map((id) => byId.get(id))
    .filter((specimen): specimen is Specimen => Boolean(specimen));
};

export const normalizeFavoriteSpecimenIds = (
  favoriteIds: readonly string[],
  specimens: readonly Specimen[],
): { ids: string[]; repaired: boolean } => {
  const specimenIds = new Set(specimens.map((specimen) => specimen.id));
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of favoriteIds) {
    if (!specimenIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return {
    ids,
    repaired: ids.length !== favoriteIds.length || ids.some((id, index) => id !== favoriteIds[index]),
  };
};

const captureSourceLabels: Record<CaptureSource, string> = {
  tree: "木を調べて発見",
  "fixed-banana": "裏庭のバナナトラップ",
  "fixed-light": "裏庭のライトトラップ",
  "player-banana": "自分で仕掛けたバナナトラップ",
};

export const getCaptureSourceLabel = (source: CaptureSource): string => captureSourceLabels[source];

export const getSpecimenLocationLabel = (specimen: Specimen): string =>
  locationById[specimen.locationId]?.name ?? "村のどこか";

export const getSpecimenTreeLabel = (specimen: Specimen): string => {
  const tree = specimen.treeId ? treeById[specimen.treeId] : undefined;
  return tree?.label ?? "村の木のそば";
};

export const getSpecimenPointLabel = (specimen: Specimen): string => {
  if (specimen.captureSource === "player-banana") {
    return "自分で仕掛けたバナナトラップ";
  }
  const tree = specimen.treeId ? treeById[specimen.treeId] : undefined;
  const point = tree?.inspectionPoints.find((candidate) => candidate.id === specimen.inspectionPointId);
  return point?.label ?? "見つけた場所の詳しい記録はありません";
};

export const getSpecimenDiscoveryLabel = (specimen: Specimen): string => {
  const tree = specimen.treeId ? treeById[specimen.treeId] : undefined;
  if (!tree) return "村の木のそば";
  const point = getSpecimenPointLabel(specimen);
  return `${tree.label}・${point}`;
};

export const getRankingStatusLabel = (specimen: Specimen): string => {
  if (!specimen.rankingEligible) return "図鑑・採集記録のみ";
  if (specimen.captureSource === "player-banana") {
    return "自分で仕掛けた通常トラップ・将来のランキング対象";
  }
  if (specimen.captureSource === "fixed-banana" || specimen.captureSource === "fixed-light") {
    return "通常トラップ・将来のランキング対象";
  }
  return "自然出現・将来のランキング対象";
};
