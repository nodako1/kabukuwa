import { describe, expect, it } from "vitest";
import { fieldById } from "../data/fields";
import { locationById } from "../data/locations";
import { legacySpotToTreeId, treeById, trees } from "../data/trees";
import type { GameState } from "../types/game";
import { createInitialGame, gameReducer } from "./engine";
import { generateInspectionSession, getInspectionSessionId } from "./inspection";

const stateForTree = (
  treeId: string,
  seed: string,
  options: { boosted?: boolean; visitIndex?: number; timeMinutes?: number } = {},
): GameState => {
  const tree = treeById[treeId];
  const field = fieldById[tree.fieldId];
  const locationId = field.locationId!;
  const timeMinutes = options.timeMinutes ?? 600;
  return {
    ...createInitialGame(seed),
    timeMinutes,
    locationId,
    field: {
      fieldId: tree.fieldId,
      x: tree.x,
      y: tree.y + 70,
      facing: "up",
      lastSafeX: tree.x,
      lastSafeY: tree.y + 70,
      discoveredFieldIds: [tree.fieldId],
    },
    visitCounters: { [locationId]: options.visitIndex ?? 1 },
    exploration: {
      locationId,
      visitIndex: options.visitIndex ?? 1,
      period: timeMinutes < 600 ? "morning" : timeMinutes < 960 ? "day" : "evening",
      searchedSpotIds: [],
    },
    buffs: {
      appearanceBoostUntil: options.boosted ? timeMinutes + 60 : 0,
      nextBoostExtensionMinutes: 0,
    },
  };
};

describe("tree inspection plans", () => {
  it("maps every legacy collection hotspot to exactly one tree", () => {
    const hotspotIds = Object.values(locationById).flatMap((location) => location.hotspots.map((spot) => spot.id));
    expect(trees).toHaveLength(hotspotIds.length);
    expect(new Set(trees.map((tree) => tree.id)).size).toBe(trees.length);
    for (const id of hotspotIds) {
      expect(legacySpotToTreeId[id]).toBe(id);
      expect(treeById[id].inspectionPoints.length).toBeGreaterThanOrEqual(1);
      expect(treeById[id].inspectionPoints.length).toBeLessThanOrEqual(3);
    }
  });

  it("returns a deeply identical plan for the same seed, day, visit, period, and tree", () => {
    const state = stateForTree("mixed-tree-3", "deep-repeat");
    expect(generateInspectionSession(state, treeById["mixed-tree-3"])).toEqual(
      generateInspectionSession(structuredClone(state), treeById["mixed-tree-3"]),
    );
  });

  it("changes the session identity after a field revisit", () => {
    const first = stateForTree("mixed-tree-1", "visit", { visitIndex: 1 });
    const second = stateForTree("mixed-tree-1", "visit", { visitIndex: 2 });
    expect(getInspectionSessionId(first, treeById["mixed-tree-1"])).not.toBe(
      getInspectionSessionId(second, treeById["mixed-tree-1"]),
    );
  });

  it("places at most one catchable insect across all points", () => {
    for (let index = 0; index < 500; index += 1) {
      const plan = generateInspectionSession(
        stateForTree("oak-tree-3", `one-${index}`),
        treeById["oak-tree-3"],
      );
      expect(plan?.catchableEncounter ? 1 : 0).toBeLessThanOrEqual(1);
    }
  });

  it("uses the saved trap state as the source of truth", () => {
    const tree = treeById["backyard-light"];
    const installed = stateForTree(tree.id, "installed-trap", { timeMinutes: 1095 });
    expect(generateInspectionSession(installed, tree)).not.toBeNull();
    const removed = {
      ...installed,
      trapStates: {
        ...installed.trapStates,
        [tree.id]: { kind: "light" as const, installed: false },
      },
    };
    expect(generateInspectionSession(removed, tree)).toBeNull();
  });

  it("produces both clue-without-catch and catch-without-clue outcomes", () => {
    let clueWithoutCatch = false;
    let catchWithoutClue = false;
    for (let index = 0; index < 20000 && !(clueWithoutCatch && catchWithoutClue); index += 1) {
      const plan = generateInspectionSession(
        stateForTree("oak-tree-1", `clue-${index}`),
        treeById["oak-tree-1"],
      )!;
      if (plan.clueVisible && !plan.catchableEncounter) clueWithoutCatch = true;
      if (!plan.clueVisible && plan.catchableEncounter) catchWithoutClue = true;
    }
    expect(clueWithoutCatch).toBe(true);
    expect(catchWithoutClue).toBe(true);
  });

  it("keeps normal encounters identical and marks only ad-added encounters ineligible", () => {
    let sawBoostOnly = false;
    for (let index = 0; index < 4000; index += 1) {
      const normal = generateInspectionSession(
        stateForTree("oak-tree-1", `boost-${index}`),
        treeById["oak-tree-1"],
      )!;
      const boosted = generateInspectionSession(
        stateForTree("oak-tree-1", `boost-${index}`, { boosted: true }),
        treeById["oak-tree-1"],
      )!;
      if (normal.catchableEncounter) {
        expect(boosted.catchableEncounter).toMatchObject({
          insectId: normal.catchableEncounter.insectId,
          sizeMm: normal.catchableEncounter.sizeMm,
          pointId: normal.catchableEncounter.pointId,
          rankingEligible: true,
        });
      } else if (boosted.catchableEncounter) {
        sawBoostOnly = true;
        expect(boosted.catchableEncounter.rankingEligible).toBe(false);
      }
    }
    expect(sawBoostOnly).toBe(true);
  });

  it("persists a discovered clue plan and reuses it after an ad reward", () => {
    let state: GameState | undefined;
    for (let index = 0; index < 5000 && !state; index += 1) {
      const candidate = stateForTree("oak-tree-1", `snapshot-${index}`);
      if (generateInspectionSession(candidate, treeById["oak-tree-1"])?.clueVisible) state = candidate;
    }
    expect(state).toBeDefined();
    const tree = treeById["oak-tree-1"];
    state = gameReducer(state!, {
      type: "DISCOVER_TREE_CLUE",
      treeId: tree.id,
      x: tree.x,
      y: tree.y + 70,
      facing: "up",
    });
    const sessionId = getInspectionSessionId(state, tree);
    const preview = structuredClone(state.inspectionSessions[sessionId]);
    state = gameReducer(state, { type: "APPLY_AD_REWARD", reward: "appearance" });
    state = gameReducer(state, { type: "ACKNOWLEDGE_OUTCOME" });
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: tree.id });
    expect(state.inspectionSessions[sessionId].catchableEncounter).toEqual(preview.catchableEncounter);
    expect(state.inspectionSessions[sessionId].ambientByPointId).toEqual(preview.ambientByPointId);
  });

  it("discovers a clue at 220px but not beyond the configured radius", () => {
    let base: GameState | undefined;
    for (let index = 0; index < 5000 && !base; index += 1) {
      const candidate = stateForTree("oak-tree-1", `radius-${index}`);
      if (generateInspectionSession(candidate, treeById["oak-tree-1"])?.clueVisible) base = candidate;
    }
    const tree = treeById["oak-tree-1"];
    const tooFar = gameReducer(base!, {
      type: "DISCOVER_TREE_CLUE",
      treeId: tree.id,
      x: tree.x + 220.1,
      y: tree.y,
      facing: "right",
    });
    expect(tooFar.discoveredClueSessionIds).toHaveLength(0);
    const exact = gameReducer(base!, {
      type: "DISCOVER_TREE_CLUE",
      treeId: tree.id,
      x: tree.x + 220,
      y: tree.y,
      facing: "right",
    });
    expect(exact.discoveredClueSessionIds).toHaveLength(1);
  });
});
