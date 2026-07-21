import { describe, expect, it } from "vitest";
import { fieldById } from "../data/fields";
import { treeById } from "../data/trees";
import type { GameState } from "../types/game";
import { getTimePeriod } from "./clock";
import { finalizeObservationJournal, startDailyObservation } from "./daily";
import { createInitialGame, gameReducer } from "./engine";
import { loadGame, saveGame, type StorageLike } from "./save";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const atTree = (state: GameState, treeId: string, timeMinutes = state.timeMinutes): GameState => {
  const tree = treeById[treeId];
  const field = fieldById[tree.fieldId];
  const locationId = field.locationId!;
  return {
    ...state,
    timeMinutes,
    phase: timeMinutes >= 1080 ? "evening" : "day",
    locationId,
    field: {
      ...state.field,
      fieldId: tree.fieldId,
      x: tree.x,
      y: tree.y + 30,
      facing: "up",
      lastSafeX: tree.x,
      lastSafeY: tree.y + 30,
      discoveredFieldIds: [...new Set([...state.field.discoveredFieldIds, tree.fieldId])],
    },
    visitCounters: { ...state.visitCounters, [locationId]: 1 },
    exploration: {
      locationId,
      visitIndex: 1,
      period: getTimePeriod(timeMinutes),
      searchedSpotIds: [],
    },
  };
};

const dayTwoAtTree = (seed: string, treeId = "oak-tree-1", timeMinutes = 360): GameState => {
  const initial = createInitialGame(seed);
  const dayTwo = startDailyObservation({
    ...initial,
    day: 2,
    timeMinutes,
    playerTrapKit: { unlocked: true, nextSequence: 1 },
    flags: { ...initial.flags, fieldTutorialSeen: true, playerTrapTutorialSeen: true },
  }, 2);
  return atTree(dayTwo, treeId, timeMinutes);
};

const acknowledge = (state: GameState): GameState =>
  state.pendingOutcome ? gameReducer(state, { type: "ACKNOWLEDGE_OUTCOME" }) : state;

const startNextDay = (state: GameState): GameState => {
  const ended = finalizeObservationJournal({
    ...state,
    phase: "day-ended",
    timeMinutes: 1200,
    activeInspectionSessionId: undefined,
    activePlayerTrapInspectionId: undefined,
    pendingBoundaryEvent: undefined,
    pendingOutcome: undefined,
  });
  return gameReducer(ended, { type: "START_NEXT_DAY" });
};

const installedOvernight = (seed: string, treeId = "oak-tree-1"): GameState => {
  let state = dayTwoAtTree(seed, treeId);
  state = gameReducer(state, { type: "INSTALL_PLAYER_TRAP", treeId });
  state = acknowledge(state);
  state = startNextDay(state);
  return atTree(state, treeId);
};

describe("player trap engine", () => {
  it("installs one trap for ten minutes and records the placement once", () => {
    let state = dayTwoAtTree("install-once");
    state = gameReducer(state, { type: "INSTALL_PLAYER_TRAP", treeId: "oak-tree-1" });
    const trap = state.playerTrapKit.activeTrap!;
    expect(state.timeMinutes).toBe(370);
    expect(trap.phase).toBe("waiting");
    expect(trap.readyDay).toBe(3);
    expect(state.playerTrapKit.nextSequence).toBe(2);
    expect(state.observationProgressByDay["2"].placedPlayerTrapIds).toEqual([trap.id]);

    state = acknowledge(state);
    const duplicate = gameReducer(state, { type: "INSTALL_PLAYER_TRAP", treeId: "oak-tree-1" });
    expect(duplicate.timeMinutes).toBe(370);
    expect(duplicate.playerTrapKit.nextSequence).toBe(2);
  });

  it("removes a waiting trap locally for five minutes and allows a new sequence", () => {
    let state = dayTwoAtTree("remove-waiting");
    state = acknowledge(gameReducer(state, { type: "INSTALL_PLAYER_TRAP", treeId: "oak-tree-1" }));
    const firstId = state.playerTrapKit.activeTrap!.id;
    state = gameReducer(state, { type: "REMOVE_WAITING_PLAYER_TRAP", trapId: firstId });
    expect(state.timeMinutes).toBe(375);
    expect(state.playerTrapKit.activeTrap).toBeUndefined();
    state = acknowledge(state);
    state = gameReducer(state, { type: "INSTALL_PLAYER_TRAP", treeId: "oak-tree-1" });
    expect(state.playerTrapKit.activeTrap?.id).not.toBe(firstId);
    expect(state.playerTrapKit.nextSequence).toBe(3);
  });

  it("becomes ready the next morning, opens once for fifteen minutes, and resumes for free", () => {
    let state = installedOvernight("open-resume");
    const trap = state.playerTrapKit.activeTrap!;
    expect(trap.phase).toBe("ready");
    expect(trap.outcomePlan).toBeDefined();

    state = gameReducer(state, { type: "OPEN_PLAYER_TRAP_INSPECTION", trapId: trap.id });
    expect(state.timeMinutes).toBe(375);
    expect(state.activePlayerTrapInspectionId).toBe(trap.id);
    expect(state.playerTrapKit.activeTrap?.phase).toBe("opened");
    expect(state.observationProgressByDay["3"].checkedPlayerTrapIds).toEqual([trap.id]);
    const savedPlan = state.playerTrapKit.activeTrap?.outcomePlan;

    state = gameReducer(state, { type: "CLOSE_PLAYER_TRAP_INSPECTION", trapId: trap.id });
    state = gameReducer(state, { type: "OPEN_PLAYER_TRAP_INSPECTION", trapId: trap.id });
    expect(state.timeMinutes).toBe(375);
    expect(state.playerTrapKit.activeTrap?.outcomePlan).toEqual(savedPlan);
    expect(state.observationProgressByDay["3"].checkedPlayerTrapIds).toEqual([trap.id]);
  });

  it("records an opened trap as a fresh observation when it is revisited on a later day", () => {
    let state = installedOvernight("opened-next-day");
    const trapId = state.playerTrapKit.activeTrap!.id;
    state = gameReducer(state, { type: "OPEN_PLAYER_TRAP_INSPECTION", trapId });
    state = gameReducer(state, { type: "CLOSE_PLAYER_TRAP_INSPECTION", trapId });
    state = {
      ...state,
      dailyPlansByDay: {
        ...state.dailyPlansByDay,
        "4": {
          day: 4,
          natureId: "sweet-breeze",
          themeId: "check-player-trap",
          rumorNpcId: "grandma",
          rumorId: "grandma:sweet-breeze",
        },
      },
    };
    state = atTree(startNextDay(state), "oak-tree-1");

    expect(state.playerTrapKit.activeTrap?.phase).toBe("opened");
    expect(state.observationProgressByDay["4"].checkedPlayerTrapIds).toEqual([]);
    const timeBeforeReopening = state.timeMinutes;
    state = gameReducer(state, { type: "OPEN_PLAYER_TRAP_INSPECTION", trapId });

    expect(state.timeMinutes).toBe(timeBeforeReopening);
    expect(state.observationProgressByDay["4"].checkedPlayerTrapIds).toEqual([trapId]);
    expect(state.observationProgressByDay["4"].completed).toBe(true);
    expect(state.observationProgressByDay["4"].ambientInsectIds.length).toBeGreaterThan(0);
  });

  it("keeps a saved next-day plan and uses its nature to resolve the waiting trap", () => {
    let state = dayTwoAtTree("saved-next-plan");
    state = acknowledge(gameReducer(state, { type: "INSTALL_PLAYER_TRAP", treeId: "oak-tree-1" }));
    const savedPlan = {
      day: 3,
      natureId: "sweet-breeze" as const,
      themeId: "check-player-trap" as const,
      rumorNpcId: "grandma" as const,
      rumorId: "grandma:sweet-breeze",
    };
    state = { ...state, dailyPlansByDay: { ...state.dailyPlansByDay, "3": savedPlan } };
    state = startNextDay(state);
    expect(state.dailyPlansByDay["3"]).toEqual(savedPlan);
    expect(state.playerTrapKit.activeTrap?.outcomePlan?.resolvedNatureId).toBe("sweet-breeze");
  });

  it("can leave a ready result for days and records a later catch on the actual catch day", () => {
    let state: GameState | undefined;
    for (let index = 0; index < 200; index += 1) {
      const candidate = installedOvernight(`late-catch-${index}`);
      if (candidate.playerTrapKit.activeTrap?.outcomePlan?.encounter) {
        state = candidate;
        break;
      }
    }
    expect(state).toBeDefined();
    const dayThreePlan = state!.playerTrapKit.activeTrap!.outcomePlan;
    state = startNextDay(state!);
    expect(state.day).toBe(4);
    expect(state.playerTrapKit.activeTrap?.phase).toBe("ready");
    expect(state.playerTrapKit.activeTrap?.outcomePlan).toEqual(dayThreePlan);
    state = atTree(state, "oak-tree-1");
    const trap = state.playerTrapKit.activeTrap!;
    const encounter = trap.outcomePlan!.encounter!;
    state = gameReducer(state, { type: "OPEN_PLAYER_TRAP_INSPECTION", trapId: trap.id });
    state = gameReducer(state, { type: "CATCH_PLAYER_TRAP_ENCOUNTER", trapId: trap.id, encounterId: encounter.id });
    expect(state.specimens.at(-1)).toMatchObject({ day: 4, caughtAtMinutes: 375 });
    expect(state.observationProgressByDay["4"].capturedSpecimenIds).toContain(encounter.id);
  });

  it("captures at most once with player-banana source and recovers the reusable kit", () => {
    let state: GameState | undefined;
    for (let index = 0; index < 200; index += 1) {
      const candidate = installedOvernight(`catch-player-${index}`);
      if (candidate.playerTrapKit.activeTrap?.outcomePlan?.encounter) {
        state = candidate;
        break;
      }
    }
    expect(state).toBeDefined();
    const trap = state!.playerTrapKit.activeTrap!;
    const encounter = trap.outcomePlan!.encounter!;
    state = gameReducer(state!, { type: "OPEN_PLAYER_TRAP_INSPECTION", trapId: trap.id });
    state = gameReducer(state, { type: "CATCH_PLAYER_TRAP_ENCOUNTER", trapId: trap.id, encounterId: encounter.id });
    expect(state.specimens.filter((specimen) => specimen.id === encounter.id)).toHaveLength(1);
    expect(state.specimens.at(-1)).toMatchObject({
      captureSource: "player-banana",
      rankingEligible: true,
      day: 3,
    });
    state = acknowledge(state);
    const duplicate = gameReducer(state, { type: "CATCH_PLAYER_TRAP_ENCOUNTER", trapId: trap.id, encounterId: encounter.id });
    expect(duplicate.specimens.filter((specimen) => specimen.id === encounter.id)).toHaveLength(1);
    state = gameReducer(duplicate, { type: "RECOVER_PLAYER_TRAP", trapId: trap.id });
    expect(state.playerTrapKit.activeTrap).toBeUndefined();
    expect(state.activePlayerTrapInspectionId).toBeUndefined();
  });

  it("keeps a captured encounter idempotent after save, reload, and outcome acknowledgement", () => {
    let state: GameState | undefined;
    for (let index = 0; index < 200; index += 1) {
      const candidate = installedOvernight(`reload-catch-${index}`);
      if (candidate.playerTrapKit.activeTrap?.outcomePlan?.encounter) {
        state = candidate;
        break;
      }
    }
    expect(state).toBeDefined();
    const trap = state!.playerTrapKit.activeTrap!;
    const encounter = trap.outcomePlan!.encounter!;
    state = gameReducer(state!, { type: "OPEN_PLAYER_TRAP_INSPECTION", trapId: trap.id });
    state = gameReducer(state, {
      type: "CATCH_PLAYER_TRAP_ENCOUNTER",
      trapId: trap.id,
      encounterId: encounter.id,
    });
    const storage = new MemoryStorage();
    saveGame(state, storage);
    state = loadGame(storage)!;
    state = acknowledge(state);
    const beforeDuplicate = state;
    state = gameReducer(state, {
      type: "CATCH_PLAYER_TRAP_ENCOUNTER",
      trapId: trap.id,
      encounterId: encounter.id,
    });

    expect(state).toBe(beforeDuplicate);
    expect(state.specimens.filter((specimen) => specimen.id === encounter.id)).toHaveLength(1);
  });

  it("ignores mismatched and stale trap commands without changing state", () => {
    let waiting = dayTwoAtTree("stale-waiting");
    waiting = acknowledge(gameReducer(waiting, { type: "INSTALL_PLAYER_TRAP", treeId: "oak-tree-1" }));
    const waitingId = waiting.playerTrapKit.activeTrap!.id;
    expect(gameReducer(waiting, { type: "REMOVE_WAITING_PLAYER_TRAP", trapId: `${waitingId}:wrong` }))
      .toBe(waiting);
    const removed = acknowledge(gameReducer(waiting, { type: "REMOVE_WAITING_PLAYER_TRAP", trapId: waitingId }));
    expect(gameReducer(removed, { type: "REMOVE_WAITING_PLAYER_TRAP", trapId: waitingId })).toBe(removed);

    let opened = installedOvernight("stale-opened");
    const trap = opened.playerTrapKit.activeTrap!;
    expect(gameReducer(opened, { type: "OPEN_PLAYER_TRAP_INSPECTION", trapId: `${trap.id}:wrong` }))
      .toBe(opened);
    opened = gameReducer(opened, { type: "OPEN_PLAYER_TRAP_INSPECTION", trapId: trap.id });
    expect(gameReducer(opened, { type: "CLOSE_PLAYER_TRAP_INSPECTION", trapId: `${trap.id}:wrong` }))
      .toBe(opened);
    expect(gameReducer(opened, { type: "RECOVER_PLAYER_TRAP", trapId: `${trap.id}:wrong` }))
      .toBe(opened);
    if (trap.outcomePlan?.encounter) {
      expect(gameReducer(opened, {
        type: "CATCH_PLAYER_TRAP_ENCOUNTER",
        trapId: trap.id,
        encounterId: `${trap.outcomePlan.encounter.id}:wrong`,
      })).toBe(opened);
    }
    const closed = gameReducer(opened, { type: "CLOSE_PLAYER_TRAP_INSPECTION", trapId: trap.id });
    expect(gameReducer(closed, { type: "CLOSE_PLAYER_TRAP_INSPECTION", trapId: trap.id })).toBe(closed);
  });

  it("commits a 17:55 installation before the one-time pickup", () => {
    let state = dayTwoAtTree("install-boundary", "oak-tree-1", 1075);
    state = {
      ...state,
      dailyPlansByDay: {
        ...state.dailyPlansByDay,
        "2": { ...state.dailyPlansByDay["2"], themeId: "set-player-trap" },
      },
    };
    state = gameReducer(state, { type: "INSTALL_PLAYER_TRAP", treeId: "oak-tree-1" });
    expect(state.timeMinutes).toBe(1080);
    expect(state.phase).toBe("pickup");
    expect(state.playerTrapKit.activeTrap?.phase).toBe("waiting");
    expect(state.observationProgressByDay["2"].completedAtMinutes).toBe(1080);
    state = acknowledge(state);
    state = gameReducer(state, { type: "COMPLETE_PICKUP" });
    expect(state.timeMinutes).toBe(1095);
    expect(state.locationId).toBe("grandma-house");
  });

  it("defers the 17:55 pickup until a ready close-up is closed", () => {
    let state = installedOvernight("open-boundary");
    state = atTree(state, "oak-tree-1", 1075);
    state = {
      ...state,
      dailyPlansByDay: {
        ...state.dailyPlansByDay,
        "3": { ...state.dailyPlansByDay["3"], themeId: "check-player-trap" },
      },
    };
    const trap = state.playerTrapKit.activeTrap!;
    state = gameReducer(state, { type: "OPEN_PLAYER_TRAP_INSPECTION", trapId: trap.id });
    expect(state.timeMinutes).toBe(1080);
    expect(state.phase).toBe("day");
    expect(state.pendingBoundaryEvent).toBe("pickup");
    expect(state.activePlayerTrapInspectionId).toBe(trap.id);
    expect(state.observationProgressByDay["3"].completedAtMinutes).toBe(1080);
    state = gameReducer(state, { type: "CLOSE_PLAYER_TRAP_INSPECTION", trapId: trap.id });
    expect(state.phase).toBe("pickup");
    expect(state.pendingBoundaryEvent).toBeUndefined();
    expect(state.playerTrapKit.activeTrap?.phase).toBe("opened");
    const closed = state;
    state = gameReducer(state, { type: "CLOSE_PLAYER_TRAP_INSPECTION", trapId: trap.id });
    expect(state).toBe(closed);
    state = gameReducer(state, { type: "COMPLETE_PICKUP" });
    expect(state.phase).toBe("evening");
    expect(gameReducer(state, { type: "COMPLETE_PICKUP" })).toBe(state);
  });

  it("applies a deferred pickup once when recovery is resent", () => {
    let state = atTree(installedOvernight("recover-boundary"), "oak-tree-1", 1075);
    const trap = state.playerTrapKit.activeTrap!;
    state = gameReducer(state, { type: "OPEN_PLAYER_TRAP_INSPECTION", trapId: trap.id });
    state = gameReducer(state, { type: "RECOVER_PLAYER_TRAP", trapId: trap.id });
    expect(state.phase).toBe("pickup");
    expect(state.playerTrapKit.activeTrap).toBeUndefined();
    const recovered = state;
    state = gameReducer(state, { type: "RECOVER_PLAYER_TRAP", trapId: trap.id });
    expect(state).toBe(recovered);
  });

  it("rejects remote and mismatched trap commands without changing time", () => {
    const state = dayTwoAtTree("reject-remote");
    const remote = gameReducer(state, { type: "INSTALL_PLAYER_TRAP", treeId: "shrine-tree-1" });
    expect(remote).toBe(state);
    const locked = gameReducer({ ...state, playerTrapKit: { unlocked: false, nextSequence: 1 } }, {
      type: "INSTALL_PLAYER_TRAP",
      treeId: "oak-tree-1",
    });
    expect(locked.timeMinutes).toBe(state.timeMinutes);
    expect(locked.playerTrapKit.activeTrap).toBeUndefined();
  });
});
