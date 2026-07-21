import { describe, expect, it } from "vitest";
import type { GameState, Specimen } from "../types/game";
import {
  compareSpecimensLargest,
  compareSpecimensNewest,
  getBestDifference,
  getCaptureSourceLabel,
  getFavoriteSpecimens,
  getRankingStatusLabel,
  getSpeciesBestSize,
  getSpeciesSpecimens,
  getSpecimenPointLabel,
  getSpecimenTreeLabel,
  normalizeFavoriteSpecimenIds,
} from "./collection";
import { createInitialGame } from "./engine";

const specimen = ({ id, ...overrides }: Partial<Specimen> & Pick<Specimen, "id">): Specimen => ({
  id,
  insectId: "japanese-rhino",
  sizeMm: 70,
  day: 1,
  caughtAtMinutes: 600,
  locationId: "oak-forest",
  spotId: "oak-tree-1",
  treeId: "oak-tree-1",
  inspectionPointId: "oak-tree-1:sap",
  rankingEligible: true,
  captureSource: "tree",
  ...overrides,
});

describe("specimen collection", () => {
  it("sorts newest by day, time, then deterministic ASCII id without mutating input", () => {
    const input = [
      specimen({ id: "b", day: 2, caughtAtMinutes: 700 }),
      specimen({ id: "a", day: 2, caughtAtMinutes: 700 }),
      specimen({ id: "new-day", day: 3, caughtAtMinutes: 360 }),
      specimen({ id: "old-time", day: 2, caughtAtMinutes: 600 }),
    ];
    const before = [...input];
    expect([...input].sort(compareSpecimensNewest).map((item) => item.id))
      .toEqual(["new-day", "a", "b", "old-time"]);
    expect(input).toEqual(before);
  });

  it("sorts largest by size and then the newest ordering", () => {
    const input = [
      specimen({ id: "small", sizeMm: 60, day: 9 }),
      specimen({ id: "older-large", sizeMm: 72, day: 1 }),
      specimen({ id: "newer-large", sizeMm: 72, day: 2 }),
    ];
    expect([...input].sort(compareSpecimensLargest).map((item) => item.id))
      .toEqual(["newer-large", "older-large", "small"]);
  });

  it("filters one species and returns self-best differences in tenths", () => {
    const specimens = [
      specimen({ id: "best-a", sizeMm: 70.2 }),
      specimen({ id: "best-b", sizeMm: 70.2, day: 2 }),
      specimen({ id: "other", sizeMm: 69.9 }),
      specimen({ id: "stag", insectId: "saw-stag", sizeMm: 74 }),
    ];
    expect(getSpeciesSpecimens(specimens, "japanese-rhino", "largest").map((item) => item.id))
      .toEqual(["best-b", "best-a", "other"]);
    const best = getSpeciesBestSize(specimens, "japanese-rhino");
    expect(best).toBe(70.2);
    expect(getBestDifference(specimens[0], best)).toBe(0);
    expect(getBestDifference(specimens[2], best)).toBe(0.3);
  });

  it("shows favorites in most-recently-registered order and never mutates saved arrays", () => {
    const specimens = [specimen({ id: "one" }), specimen({ id: "two" }), specimen({ id: "three" })];
    const state: GameState = {
      ...createInitialGame("favorite-order"),
      specimens,
      favoriteSpecimenIds: ["two", "one", "three"],
    };
    const idsBefore = [...state.favoriteSpecimenIds];
    const specimensBefore = [...state.specimens];
    expect(getFavoriteSpecimens(state).map((item) => item.id)).toEqual(["three", "one", "two"]);
    expect(state.favoriteSpecimenIds).toEqual(idsBefore);
    expect(state.specimens).toEqual(specimensBefore);
  });

  it("normalizes duplicate and missing favorite references while preserving first-seen order", () => {
    const specimens = [specimen({ id: "one" }), specimen({ id: "two" })];
    expect(normalizeFavoriteSpecimenIds(["two", "missing", "two", "one"], specimens))
      .toEqual({ ids: ["two", "one"], repaired: true });
    expect(normalizeFavoriteSpecimenIds(["two", "one"], specimens))
      .toEqual({ ids: ["two", "one"], repaired: false });
  });

  it("restores all capture-source and ranking labels without relying on an active trap", () => {
    expect(getCaptureSourceLabel("tree")).toBe("木を調べて発見");
    expect(getCaptureSourceLabel("fixed-banana")).toBe("裏庭のバナナトラップ");
    expect(getCaptureSourceLabel("fixed-light")).toBe("裏庭のライトトラップ");
    expect(getCaptureSourceLabel("player-banana")).toBe("自分で仕掛けたバナナトラップ");
    expect(getRankingStatusLabel(specimen({ id: "fixed", captureSource: "fixed-banana" })))
      .toBe("通常トラップ・将来のランキング対象");
    expect(getRankingStatusLabel(specimen({ id: "assisted", rankingEligible: false })))
      .toBe("図鑑・採集記録のみ");

    const playerCatch = specimen({
      id: "player",
      captureSource: "player-banana",
      inspectionPointId: "oak-tree-1:player-banana-trap",
    });
    expect(getSpecimenTreeLabel(playerCatch)).toBe("木1");
    expect(getSpecimenPointLabel(playerCatch)).toBe("自分で仕掛けたバナナトラップ");
  });

  it("keeps old specimens when their tree or inspection point no longer exists", () => {
    const removedTree = specimen({ id: "removed-tree", treeId: "removed", inspectionPointId: "gone" });
    const removedPoint = specimen({ id: "removed-point", inspectionPointId: "gone" });
    expect(getSpecimenTreeLabel(removedTree)).toBe("村の木のそば");
    expect(getSpecimenPointLabel(removedTree)).toBe("見つけた場所の詳しい記録はありません");
    expect(getSpecimenPointLabel(removedPoint)).toBe("見つけた場所の詳しい記録はありません");
  });
});
