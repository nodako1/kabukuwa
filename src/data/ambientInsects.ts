import type { AmbientInsectId } from "../types/game";

export interface AmbientInsectDefinition {
  id: AmbientInsectId;
  label: string;
  shortLabel: string;
}

export const ambientInsects: AmbientInsectDefinition[] = [
  { id: "green-bottle", label: "カナブン", shortLabel: "カナブン" },
  { id: "black-bottle", label: "クロカナブン", shortLabel: "クロカナブン" },
  { id: "butterfly", label: "チョウ", shortLabel: "チョウ" },
  { id: "moth", label: "ガ", shortLabel: "ガ" },
  { id: "ant", label: "アリ", shortLabel: "アリ" },
  { id: "gnat", label: "羽虫", shortLabel: "羽虫" },
  { id: "pillbug", label: "落ち葉の小さな虫", shortLabel: "小さな虫" },
];

export const ambientInsectById = Object.fromEntries(
  ambientInsects.map((insect) => [insect.id, insect]),
) as Record<AmbientInsectId, AmbientInsectDefinition>;
