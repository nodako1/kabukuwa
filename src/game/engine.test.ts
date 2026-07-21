import { describe, expect, it } from "vitest";
import { fieldById, getSpawnPoint } from "../data/fields";
import { insects } from "../data/insects";
import { treeById } from "../data/trees";
import type { FieldId, GameCommand, GameState } from "../types/game";
import { PLAYER_RADIUS } from "./field";
import { createInitialGame, gameReducer } from "./engine";
import { getInspectionSessionId } from "./inspection";
import { isFieldExitAvailable, isLocationAvailable, rollEncounter } from "./rules";

const playerFieldAt = (fieldId: FieldId, x?: number, y?: number): GameState["field"] => {
  const point = getSpawnPoint(fieldId);
  return {
    fieldId,
    x: x ?? point.x,
    y: y ?? point.y,
    facing: point.facing,
    lastSafeX: x ?? point.x,
    lastSafeY: y ?? point.y,
    discoveredFieldIds: [fieldId],
  };
};

const stateAt = (overrides: Partial<GameState>): GameState => {
  const initial = createInitialGame("test-summer");
  const fieldId = overrides.field?.fieldId ?? overrides.locationId ?? initial.field.fieldId;
  return { ...initial, ...overrides, field: overrides.field ?? playerFieldAt(fieldId) };
};

const edgeCommand = (
  state: GameState,
  exitId: string,
  token = `${state.field.fieldId}:${exitId}:${state.revision}`,
): Extract<GameCommand, { type: "TRAVEL_EDGE" }> => {
  const field = fieldById[state.field.fieldId];
  const exit = field.exits.find((candidate) => candidate.id === exitId)!;
  const coordinate = (exit.rangeStart + exit.rangeEnd) / 2;
  const x = exit.side === "left"
    ? PLAYER_RADIUS
    : exit.side === "right"
      ? field.width - PLAYER_RADIUS
      : coordinate;
  const y = exit.side === "top"
    ? PLAYER_RADIUS
    : exit.side === "bottom"
      ? field.height - PLAYER_RADIUS
      : coordinate;
  const facing = exit.side === "top" ? "up" : exit.side === "bottom" ? "down" : exit.side;
  return { type: "TRAVEL_EDGE", exitId, x, y, facing, transitionToken: token };
};

const travel = (state: GameState, exitId: string, token?: string): GameState =>
  gameReducer(state, edgeCommand(state, exitId, token));

const atTree = (
  treeId: string,
  overrides: Partial<GameState> = {},
): GameState => {
  const tree = treeById[treeId];
  const field = fieldById[tree.fieldId];
  const locationId = field.locationId!;
  const base = stateAt({
    locationId,
    field: playerFieldAt(tree.fieldId, tree.x, tree.y + 70),
    visitCounters: { [locationId]: 1 },
    exploration: {
      locationId,
      visitIndex: 1,
      period: "day",
      searchedSpotIds: [],
    },
  });
  return { ...base, ...overrides, field: overrides.field ?? base.field };
};

describe("game engine", () => {
  it("starts Version 3 at grandma's house at 6:00", () => {
    const state = createInitialGame("fixed");
    expect(state.schemaVersion).toBe(3);
    expect(state.timeMinutes).toBe(360);
    expect(state.locationId).toBe("grandma-house");
    expect(state.field.fieldId).toBe("grandma-house");
    expect(Object.keys(state.trapStates)).toEqual(expect.arrayContaining(["backyard-banana", "backyard-light"]));
  });

  it("walks the complete clockwise loop and returns home in 40 minutes", () => {
    let state = createInitialGame("clockwise");
    const route: Array<[FieldId, string]> = [
      ["grandma-house", "to-paddy"],
      ["paddy-road", "to-shrine"],
      ["shrine", "to-bamboo"],
      ["bamboo-grove", "to-school"],
      ["school", "to-oak"],
      ["oak-forest", "to-mixed"],
      ["mixed-forest", "to-road"],
      ["forest-road", "to-house"],
    ];
    for (const [fieldId, exitId] of route) {
      expect(state.field.fieldId).toBe(fieldId);
      state = travel(state, exitId);
    }
    expect(state.field.fieldId).toBe("grandma-house");
    expect(state.timeMinutes).toBe(400);
  });

  it("walks the complete counterclockwise loop and returns home in 40 minutes", () => {
    let state = createInitialGame("counterclockwise");
    for (const exitId of ["to-forest", "to-mixed", "to-oak", "to-school", "to-bamboo", "to-shrine", "to-paddy", "to-house"]) {
      state = travel(state, exitId);
    }
    expect(state.field.fieldId).toBe("grandma-house");
    expect(state.timeMinutes).toBe(400);
  });

  it("treats a repeated transition token as an idempotent no-op", () => {
    const initial = createInitialGame("token");
    const command = edgeCommand(initial, "to-paddy", "same-token");
    const arrived = gameReducer(initial, command);
    expect(arrived.field.fieldId).toBe("paddy-road");
    expect(gameReducer(arrived, command)).toBe(arrived);
  });

  it("does not travel from outside an exit opening or while facing inward", () => {
    const state = createInitialGame("bad-edge");
    const wrongRange = { ...edgeCommand(state, "to-paddy"), y: 100 };
    expect(gameReducer(state, wrongRange)).toBe(state);
    const wrongFacing = { ...edgeCommand(state, "to-paddy"), facing: "left" as const };
    expect(gameReducer(state, wrongFacing)).toBe(state);
  });

  it("opens one deterministic inspection session and charges only once", () => {
    const before = atTree("mixed-tree-1", { timeMinutes: 600 });
    const opened = gameReducer(before, { type: "OPEN_TREE_INSPECTION", treeId: "mixed-tree-1" });
    expect(opened.timeMinutes).toBe(615);
    expect(opened.activeInspectionSessionId).toBeTruthy();
    const sessionId = opened.activeInspectionSessionId!;
    const session = opened.inspectionSessions[sessionId];
    const tree = treeById[session.treeId];
    for (const point of tree.inspectionPoints) {
      const changed = gameReducer(opened, { type: "VIEW_INSPECTION_POINT", pointId: point.id });
      expect(changed.timeMinutes).toBe(615);
    }
    const closed = gameReducer(opened, { type: "CLOSE_TREE_INSPECTION" });
    const moved = {
      ...closed,
      field: {
        ...closed.field,
        x: closed.field.x + 12,
        facing: "left" as const,
      },
    };
    const reopened = gameReducer(moved, { type: "OPEN_TREE_INSPECTION", treeId: "mixed-tree-1" });
    expect(reopened.timeMinutes).toBe(615);
    expect(reopened.activeInspectionSessionId).toBe(sessionId);
    const closedAgain = gameReducer(reopened, { type: "CLOSE_TREE_INSPECTION" });
    expect(closedAgain.field.x).toBe(moved.field.x);
    expect(closedAgain.field.facing).toBe("left");
  });

  it("keeps the plan unchanged when points are viewed", () => {
    let state = atTree("oak-tree-3", { timeMinutes: 600, worldSeed: "same-plan" });
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: "oak-tree-3" });
    const sessionId = state.activeInspectionSessionId!;
    const original = structuredClone(state.inspectionSessions[sessionId]);
    for (const point of treeById["oak-tree-3"].inspectionPoints.slice(1)) {
      state = gameReducer(state, { type: "VIEW_INSPECTION_POINT", pointId: point.id });
    }
    expect(state.inspectionSessions[sessionId].catchableEncounter).toEqual(original.catchableEncounter);
    expect(state.inspectionSessions[sessionId].ambientByPointId).toEqual(original.ambientByPointId);
    expect(state.inspectionSessions[sessionId].clueVisible).toBe(original.clueVisible);
  });

  it("does not unlock a later point before its prerequisite", () => {
    let state = atTree("mixed-tree-3", { timeMinutes: 600 });
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: "mixed-tree-3" });
    const sessionId = state.activeInspectionSessionId!;
    const root = treeById["mixed-tree-3"].inspectionPoints.at(-1)!;
    const blocked = gameReducer(state, { type: "VIEW_INSPECTION_POINT", pointId: root.id });
    expect(blocked).toBe(state);
    const crack = treeById["mixed-tree-3"].inspectionPoints[1];
    state = gameReducer(state, { type: "VIEW_INSPECTION_POINT", pointId: crack.id });
    state = gameReducer(state, { type: "VIEW_INSPECTION_POINT", pointId: root.id });
    expect(state.inspectionSessions[sessionId].currentPointId).toBe(root.id);
  });

  it("records one specimen even when the same encounter is submitted twice", () => {
    let opened: GameState | undefined;
    for (let index = 0; index < 3000 && !opened; index += 1) {
      const candidate = atTree("oak-tree-1", { timeMinutes: 600, worldSeed: `catch-${index}` });
      const next = gameReducer(candidate, { type: "OPEN_TREE_INSPECTION", treeId: "oak-tree-1" });
      if (next.inspectionSessions[next.activeInspectionSessionId!].catchableEncounter) opened = next;
    }
    expect(opened).toBeDefined();
    let state = opened!;
    const session = state.inspectionSessions[state.activeInspectionSessionId!];
    const encounter = session.catchableEncounter!;
    for (const point of treeById[session.treeId].inspectionPoints) {
      state = gameReducer(state, { type: "VIEW_INSPECTION_POINT", pointId: point.id });
      if (point.id === encounter.pointId) break;
    }
    state = gameReducer(state, { type: "CATCH_INSPECTION_ENCOUNTER", encounterId: encounter.id });
    expect(state.specimens).toHaveLength(1);
    expect(state.specimens[0].treeId).toBe(session.treeId);
    expect(state.specimens[0].inspectionPointId).toBe(encounter.pointId);
    state = gameReducer(state, { type: "ACKNOWLEDGE_OUTCOME" });
    state = gameReducer(state, { type: "CATCH_INSPECTION_ENCOUNTER", encounterId: encounter.id });
    expect(state.specimens).toHaveLength(1);
  });

  it("defers the 18:00 pickup until a remote close-up is closed", () => {
    let state = atTree("oak-tree-3", {
      timeMinutes: 1075,
      exploration: {
        locationId: "oak-forest",
        visitIndex: 1,
        period: "evening",
        searchedSpotIds: [],
      },
    });
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: "oak-tree-3" });
    expect(state.timeMinutes).toBe(1080);
    expect(state.phase).toBe("day");
    expect(state.pendingBoundaryEvent).toBe("pickup");
    const secondPoint = treeById["oak-tree-3"].inspectionPoints[1];
    state = gameReducer(state, { type: "VIEW_INSPECTION_POINT", pointId: secondPoint.id });
    expect(state.inspectionSessions[state.activeInspectionSessionId!].currentPointId).toBe(secondPoint.id);
    state = gameReducer(state, { type: "CLOSE_TREE_INSPECTION" });
    expect(state.phase).toBe("pickup");
    expect(state.activeInspectionSessionId).toBeUndefined();
  });

  it("defers the 20:00 summary until a backyard close-up is closed", () => {
    let state = atTree("backyard-banana", {
      timeMinutes: 1190,
      phase: "evening",
      exploration: {
        locationId: "backyard",
        visitIndex: 1,
        period: "night",
        searchedSpotIds: [],
      },
    });
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: "backyard-banana" });
    expect(state.timeMinutes).toBe(1200);
    expect(state.phase).toBe("evening");
    expect(state.pendingBoundaryEvent).toBe("day-ended");
    state = gameReducer(state, { type: "CLOSE_TREE_INSPECTION" });
    expect(state.phase).toBe("day-ended");
  });

  it("uses a new session after the time period changes", () => {
    let state = atTree("backyard-tree-1", {
      timeMinutes: 585,
      exploration: {
        locationId: "backyard",
        visitIndex: 1,
        period: "morning",
        searchedSpotIds: [],
      },
    });
    const morningId = getInspectionSessionId(state, treeById["backyard-tree-1"]);
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: "backyard-tree-1" });
    state = gameReducer(state, { type: "CLOSE_TREE_INSPECTION" });
    expect(state.timeMinutes).toBe(600);
    const dayId = getInspectionSessionId(state, treeById["backyard-tree-1"]);
    expect(dayId).not.toBe(morningId);
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: "backyard-tree-1" });
    expect(state.activeInspectionSessionId).toBe(dayId);
    expect(state.timeMinutes).toBe(615);
  });

  it("unlocks the secret route after the shrine keeper's third conversation", () => {
    let state = stateAt({
      locationId: "shrine",
      field: playerFieldAt("shrine", 690, 470),
    });
    for (let index = 0; index < 3; index += 1) {
      state = gameReducer(state, { type: "TALK", npcId: "shrine-keeper" });
      if (index < 2) state = gameReducer(state, { type: "ACKNOWLEDGE_OUTCOME" });
    }
    expect(state.flags.secretRouteUnlocked).toBe(true);
    const atFour = { ...state, timeMinutes: 960, pendingOutcome: undefined };
    expect(isLocationAvailable(atFour, "secret-forest").available).toBe(true);
  });

  it("closes remote loop exits after 18:00 but keeps the backyard edge open", () => {
    const evening = stateAt({ timeMinutes: 1095, phase: "evening" });
    const field = fieldById["grandma-house"];
    expect(isFieldExitAvailable(evening, field.exits.find((exit) => exit.id === "to-paddy")!).available).toBe(false);
    expect(isFieldExitAvailable(evening, field.exits.find((exit) => exit.id === "to-forest")!).available).toBe(false);
    expect(isFieldExitAvailable(evening, field.exits.find((exit) => exit.id === "to-backyard")!).available).toBe(true);
  });

  it("keeps a non-zero daytime rate for the giant stag", () => {
    const giantStag = insects.find((insect) => insect.id === "giant-stag");
    expect(giantStag?.appearances.find((rule) => rule.periods.includes("day"))?.chance).toBe(0.005);
  });

  it("repeats an encounter for the same seed and visit", () => {
    const state = atTree("oak-tree-1", { worldSeed: "repeatable", timeMinutes: 600 });
    const hotspot = { id: "oak-tree-1", label: "木1", kind: "tree" as const, x: 0, y: 0 };
    expect(rollEncounter(state, hotspot)).toEqual(rollEncounter(structuredClone(state), hotspot));
  });

  it("never lets an appearance boost alter an existing encounter's species or size", () => {
    const hotspot = { id: "oak-tree-1", label: "木1", kind: "tree" as const, x: 0, y: 0 };
    let pair: [ReturnType<typeof rollEncounter>, ReturnType<typeof rollEncounter>] | null = null;
    for (let index = 0; index < 10000 && !pair; index += 1) {
      const base = atTree("oak-tree-1", { worldSeed: `size-${index}`, timeMinutes: 600 });
      const normal = rollEncounter(base, hotspot);
      const boosted = rollEncounter({ ...base, buffs: { ...base.buffs, appearanceBoostUntil: 720 } }, hotspot);
      if (normal && boosted) pair = [normal, boosted];
    }
    expect(pair).not.toBeNull();
    expect(pair?.[0]?.insectId).toBe(pair?.[1]?.insectId);
    expect(pair?.[0]?.sizeMm).toBe(pair?.[1]?.sizeMm);
    expect(pair?.[1]?.boostAssisted).toBe(false);
  });

  it("blocks unrelated gameplay commands while a close-up is active", () => {
    let state = atTree("mixed-tree-1", { timeMinutes: 600 });
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: "mixed-tree-1" });
    expect(gameReducer(state, { type: "REST", minutes: 30 })).toBe(state);
    expect(gameReducer(state, { type: "TALK", npcId: "professor" })).toBe(state);
  });

  it("ends the day and preserves the collection into the next day", () => {
    const state = stateAt({ timeMinutes: 1185, phase: "evening", locationId: "backyard", field: playerFieldAt("backyard") });
    const ended = gameReducer(state, { type: "REST", minutes: 30 });
    const next = gameReducer(ended, { type: "START_NEXT_DAY" });
    expect(ended.phase).toBe("day-ended");
    expect(next.day).toBe(2);
    expect(next.timeMinutes).toBe(360);
    expect(next.inspectionSessions).toEqual({});
  });
});
