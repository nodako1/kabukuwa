import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GameState, Specimen } from "../types/game";
import { createInitialGame } from "../game/engine";
import { FavoriteSpecimenList, SpeciesIndex, SpeciesSpecimenList, SpecimenDetail } from "./SpecimenCollection";

const makeSpecimens = (count: number): Specimen[] => Array.from({ length: count }, (_, index) => ({
  id: `bulk-${String(index).padStart(3, "0")}`,
  insectId: "japanese-rhino",
  sizeMm: 60 + (index % 101) / 10,
  day: 1 + Math.floor(index / 20),
  caughtAtMinutes: 360 + (index % 50) * 5,
  locationId: "oak-forest",
  spotId: "oak-tree-1",
  treeId: "oak-tree-1",
  inspectionPointId: "oak-tree-1:sap",
  rankingEligible: true,
  captureSource: "tree",
}));

const stateWith = (specimens: Specimen[], favorites: string[] = []): GameState => ({
  ...createInitialGame("collection-render"),
  specimens,
  favoriteSpecimenIds: favorites,
});

describe("specimen collection rendering", () => {
  it("renders only the first 30 cards for a 500-specimen species", () => {
    const state = stateWith(makeSpecimens(500));
    const markup = renderToStaticMarkup(
      <SpeciesSpecimenList
        state={state}
        insectId="japanese-rhino"
        onBack={() => undefined}
        onOpenSpecimen={() => undefined}
      />,
    );
    expect(markup.match(/data-collection-focus="specimen-/g)).toHaveLength(30);
    expect(markup).toContain("さらに30匹見る");
    expect(markup).toContain("500匹の思い出");
  });

  it("keeps undiscovered species names and counts out of the rendered index", () => {
    const markup = renderToStaticMarkup(
      <SpeciesIndex state={createInitialGame("unknown-index")} onOpenSpecies={() => undefined} />,
    );
    expect(markup).not.toContain("カブトムシ</strong>");
    expect(markup).not.toContain("オオクワガタ</strong>");
    expect(markup).toContain("まだ見つけていない");
  });

  it("caps the initial favorite list and exposes explicit favorite state in detail", () => {
    const specimens = makeSpecimens(31);
    const state = stateWith(specimens, specimens.map((specimen) => specimen.id));
    const favoritesMarkup = renderToStaticMarkup(
      <FavoriteSpecimenList state={state} onOpenSpecimen={() => undefined} />,
    );
    expect(favoritesMarkup.match(/data-collection-focus="specimen-/g)).toHaveLength(30);
    expect(favoritesMarkup).toContain("さらに30匹見る");

    const detailMarkup = renderToStaticMarkup(
      <SpecimenDetail
        state={state}
        specimen={specimens[0]}
        dispatch={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(detailMarkup).toContain('aria-pressed="true"');
    expect(detailMarkup).toContain("とっておきから外す");
  });
});
