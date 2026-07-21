import { describe, expect, it } from "vitest";
import { treeById } from "../data/trees";
import type { GameState } from "../types/game";
import { startDailyObservation } from "./daily";
import { createInitialGame, gameReducer } from "./engine";
import {
  BACKUP_KEY,
  LEGACY_MIGRATION_BACKUP_KEY,
  MIGRATION_BACKUP_KEY,
  SAVE_KEY,
  VERSION5_MIGRATION_BACKUP_KEY,
  VERSION4_MIGRATION_BACKUP_KEY,
  consumeSaveRepairNotice,
  deleteSave,
  gameStateSchema,
  loadGame,
  saveGame,
  version2GameStateSchema,
  version3GameStateSchema,
  version4GameStateSchema,
  version5GameStateStructureSchema,
  type Version4GameState,
  type Version5GameState,
  type StorageLike,
} from "./save";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const asVersion2 = (state: GameState) => {
  const {
    inspectionSessions: _sessions,
    activeInspectionSessionId: _active,
    discoveredClueSessionIds: _clues,
    caughtEncounterIds: _caught,
    trapStates: _traps,
    pendingBoundaryEvent: _boundary,
    dailyPlansByDay: _plans,
    observationProgressByDay: _progress,
    observationJournalByDay: _journal,
    heardRumorDays: _rumors,
    morningBriefSeenDays: _briefs,
    favoriteSpecimenIds: _favorites,
    ...legacy
  } = state;
  const { lastTransitionToken: _token, ...field } = legacy.field;
  return {
    ...legacy,
    schemaVersion: 2 as const,
    contentVersion: 2 as const,
    field,
  };
};

const asVersion3 = (state: GameState) => {
  const {
    dailyPlansByDay: _plans,
    observationProgressByDay: _progress,
    observationJournalByDay: _journal,
    heardRumorDays: _rumors,
    morningBriefSeenDays: _briefs,
    favoriteSpecimenIds: _favorites,
    ...legacy
  } = state;
  return { ...legacy, schemaVersion: 3 as const, contentVersion: 3 as const };
};

const writeVersion2 = (storage: StorageLike, state: ReturnType<typeof asVersion2>) => {
  storage.setItem(SAVE_KEY, JSON.stringify({
    schemaVersion: 2,
    savedAt: new Date().toISOString(),
    state,
  }));
};

const asVersion4 = (state: GameState): Version4GameState => {
  const {
    playerTrapKit: _kit,
    activePlayerTrapInspectionId: _activePlayerTrap,
    favoriteSpecimenIds: _favorites,
    ...withoutTrap
  } = state;
  const { playerTrapTutorialSeen: _playerTrapTutorial, ...flags } = withoutTrap.flags;
  const specimens = withoutTrap.specimens.map(({ captureSource: _source, ...specimen }) => specimen);
  const pendingOutcome = withoutTrap.pendingOutcome?.type === "caught"
    ? {
        ...withoutTrap.pendingOutcome,
        specimen: (({ captureSource: _source, ...specimen }) => specimen)(withoutTrap.pendingOutcome.specimen),
      }
    : withoutTrap.pendingOutcome;
  const observationProgressByDay = Object.fromEntries(Object.entries(withoutTrap.observationProgressByDay)
    .map(([day, progress]) => {
      const { placedPlayerTrapIds: _placed, checkedPlayerTrapIds: _checked, ...legacy } = progress;
      return [day, legacy];
    }));
  const observationJournalByDay = Object.fromEntries(Object.entries(withoutTrap.observationJournalByDay)
    .map(([day, journal]) => {
      const { placedPlayerTrapIds: _placed, checkedPlayerTrapIds: _checked, ...legacy } = journal;
      return [day, legacy];
    }));
  return {
    ...withoutTrap,
    schemaVersion: 4,
    contentVersion: 4,
    flags,
    specimens,
    pendingOutcome,
    observationProgressByDay,
    observationJournalByDay,
  } as Version4GameState;
};

const asVersion5 = (state: GameState): Version5GameState => {
  const { favoriteSpecimenIds: _favorites, ...legacy } = state;
  return {
    ...legacy,
    schemaVersion: 5,
    contentVersion: 5,
  } as Version5GameState;
};

const writeVersion5 = (storage: StorageLike, state: Version5GameState): string => {
  const raw = JSON.stringify({ schemaVersion: 5, savedAt: new Date().toISOString(), state });
  storage.setItem(SAVE_KEY, raw);
  return raw;
};

const writeVersion4 = (storage: StorageLike, state: Version4GameState): string => {
  const raw = JSON.stringify({ schemaVersion: 4, savedAt: new Date().toISOString(), state });
  storage.setItem(SAVE_KEY, raw);
  return raw;
};

describe("local save", () => {
  it("round-trips an active close-up and deferred pickup in Version 4", () => {
    const storage = new MemoryStorage();
    const tree = treeById["oak-tree-1"];
    let state: GameState = {
      ...createInitialGame("active-save"),
      timeMinutes: 1075,
      locationId: "oak-forest",
      field: {
        fieldId: "oak-forest",
        x: tree.x,
        y: tree.y + 70,
        facing: "up",
        lastSafeX: tree.x,
        lastSafeY: tree.y + 70,
        discoveredFieldIds: ["grandma-house", "oak-forest"],
      },
      visitCounters: { "oak-forest": 1 },
      exploration: {
        locationId: "oak-forest",
        visitIndex: 1,
        period: "evening",
        searchedSpotIds: [],
      },
    };
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: tree.id });
    expect(state.pendingBoundaryEvent).toBe("pickup");
    saveGame(state, storage);
    const restored = loadGame(storage);
    expect(restored?.activeInspectionSessionId).toBe(state.activeInspectionSessionId);
    expect(restored?.pendingBoundaryEvent).toBe("pickup");
    expect(restored?.inspectionSessions).toEqual(state.inspectionSessions);

    const closed = gameReducer(restored!, { type: "CLOSE_TREE_INSPECTION" });
    expect(closed.phase).toBe("pickup");
    expect(closed.activeInspectionSessionId).toBeUndefined();
    expect(closed.exploration?.period).toBe("night");
    expect(gameStateSchema.safeParse(closed).success).toBe(true);
    saveGame(closed, storage);
    const closedRestored = loadGame(storage)!;
    expect(closedRestored.phase).toBe("pickup");
    expect(closedRestored.activeInspectionSessionId).toBeUndefined();
    expect(gameReducer(closedRestored, { type: "COMPLETE_PICKUP" }).phase).toBe("evening");
  });

  it("round-trips every current-day observation record in Version 4", () => {
    const storage = new MemoryStorage();
    const initial = createInitialGame("daily-round-trip");
    const state: GameState = {
      ...initial,
      heardRumorDays: [1],
      morningBriefSeenDays: [1],
      observationProgressByDay: {
        "1": {
          ...initial.observationProgressByDay["1"],
          inspectedTreeIds: ["oak-tree-1"],
          examinedPointIds: ["oak-tree-1:sap"],
          visitedFieldIds: ["grandma-house", "oak-forest"],
          talkedNpcIds: ["grandma"],
          ambientInsectIds: ["ant"],
        },
      },
    };
    saveGame(state, storage);
    const restored = loadGame(storage)!;
    expect(restored.dailyPlansByDay).toEqual(state.dailyPlansByDay);
    expect(restored.observationProgressByDay).toEqual(state.observationProgressByDay);
    expect(restored.heardRumorDays).toEqual([1]);
    expect(restored.morningBriefSeenDays).toEqual([1]);
  });

  it("migrates Version 4 through Version 5 into Version 6 without changing saved daily history", () => {
    const storage = new MemoryStorage();
    let current = createInitialGame("v4-to-v5-complete");
    current = startDailyObservation({
      ...current,
      day: 2,
      playerTrapKit: { unlocked: false, nextSequence: 1 },
    }, 2);
    current = startDailyObservation({ ...current, day: 3 }, 3);
    const specimen = {
      id: "fixed-banana-catch",
      insectId: "japanese-rhino" as const,
      sizeMm: 70.1,
      day: 2,
      caughtAtMinutes: 1110,
      locationId: "backyard" as const,
      spotId: "backyard-banana",
      treeId: "backyard-banana",
      inspectionPointId: "backyard-banana:banana-trap",
      rankingEligible: true,
      captureSource: "fixed-banana" as const,
    };
    current = {
      ...current,
      day: 3,
      specimens: [specimen],
      pendingOutcome: { type: "caught", specimen, isPersonalBest: true, isFirstCatch: true },
      heardRumorDays: [1, 2],
      morningBriefSeenDays: [1, 2],
    };
    const version4 = asVersion4(current);
    expect(version4GameStateSchema.safeParse(version4).success).toBe(true);
    const raw = writeVersion4(storage, version4);

    const restored = loadGame(storage)!;
    expect(restored.schemaVersion).toBe(6);
    expect(restored.favoriteSpecimenIds).toEqual([]);
    expect(restored.dailyPlansByDay).toEqual(current.dailyPlansByDay);
    expect(restored.specimens[0].captureSource).toBe("fixed-banana");
    expect(restored.pendingOutcome?.type === "caught" && restored.pendingOutcome.specimen.captureSource)
      .toBe("fixed-banana");
    expect(restored.playerTrapKit).toEqual({ unlocked: true, nextSequence: 1 });
    expect(restored.flags.playerTrapTutorialSeen).toBe(false);
    expect(Object.values(restored.observationProgressByDay).every((progress) =>
      progress.placedPlayerTrapIds.length === 0 && progress.checkedPlayerTrapIds.length === 0)).toBe(true);
    expect(storage.getItem(MIGRATION_BACKUP_KEY)).toBe(raw);
  });

  it("keeps the player trap locked when a first-day Version 4 save migrates", () => {
    const storage = new MemoryStorage();
    writeVersion4(storage, asVersion4(createInitialGame("v4-day-one")));
    expect(loadGame(storage)?.playerTrapKit).toEqual({ unlocked: false, nextSequence: 1 });
  });

  it("migrates Version 5 into Version 6 with all existing state intact and an empty favorite list", () => {
    const storage = new MemoryStorage();
    const base = createInitialGame("v5-to-v6-complete");
    const specimen = {
      id: "v5-catch",
      insectId: "miyama-stag" as const,
      sizeMm: 72.3,
      day: 1,
      caughtAtMinutes: 615,
      locationId: "oak-forest" as const,
      spotId: "oak-tree-1",
      treeId: "oak-tree-1",
      inspectionPointId: "oak-tree-1:sap",
      rankingEligible: true,
      captureSource: "tree" as const,
    };
    const current: GameState = {
      ...base,
      specimens: [specimen],
      favoriteSpecimenIds: [specimen.id],
      metNpcIds: ["grandma"],
      pendingOutcome: { type: "caught", specimen, isPersonalBest: true, isFirstCatch: true },
    };
    const version5 = asVersion5(current);
    expect(version5GameStateStructureSchema.safeParse(version5).success).toBe(true);
    const raw = writeVersion5(storage, version5);
    storage.setItem(MIGRATION_BACKUP_KEY, "keep-original-pre-v5");

    const restored = loadGame(storage)!;
    expect(restored).toEqual({
      ...version5,
      schemaVersion: 6,
      contentVersion: 6,
      favoriteSpecimenIds: [],
    });
    expect(storage.getItem(VERSION5_MIGRATION_BACKUP_KEY)).toBe(raw);
    expect(storage.getItem(MIGRATION_BACKUP_KEY)).toBe("keep-original-pre-v5");
  });

  it("preserves the first pre-v6 migration backup across repeated loads", () => {
    const storage = new MemoryStorage();
    const firstRaw = writeVersion5(storage, asVersion5(createInitialGame("first-v5-original")));
    expect(loadGame(storage)?.worldSeed).toBe("first-v5-original");
    expect(storage.getItem(VERSION5_MIGRATION_BACKUP_KEY)).toBe(firstRaw);

    writeVersion5(storage, asVersion5(createInitialGame("later-v5-copy")));
    expect(loadGame(storage)?.worldSeed).toBe("later-v5-copy");
    expect(storage.getItem(VERSION5_MIGRATION_BACKUP_KEY)).toBe(firstRaw);
  });

  it("migrates a Version 5 close-up with a caught result and deferred pickup intact", () => {
    const storage = new MemoryStorage();
    const tree = treeById["oak-tree-1"];
    let state: GameState = {
      ...createInitialGame("v5-active-closeup"),
      timeMinutes: 1075,
      locationId: "oak-forest",
      field: {
        fieldId: "oak-forest",
        x: tree.x,
        y: tree.y + 70,
        facing: "up",
        lastSafeX: tree.x,
        lastSafeY: tree.y + 70,
        discoveredFieldIds: ["grandma-house", "oak-forest"],
      },
      visitCounters: { "oak-forest": 1 },
      exploration: { locationId: "oak-forest", visitIndex: 1, period: "evening", searchedSpotIds: [] },
    };
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: tree.id });
    const specimen = {
      id: "v5-pending-catch",
      insectId: "japanese-rhino" as const,
      sizeMm: 69.8,
      day: 1,
      caughtAtMinutes: 1080,
      locationId: "oak-forest" as const,
      spotId: tree.id,
      treeId: tree.id,
      inspectionPointId: tree.primaryPointId,
      rankingEligible: true,
      captureSource: "tree" as const,
    };
    state = {
      ...state,
      specimens: [specimen],
      pendingOutcome: { type: "caught", specimen, isPersonalBest: true, isFirstCatch: true },
    };
    writeVersion5(storage, asVersion5(state));

    const restored = loadGame(storage)!;
    expect(restored.activeInspectionSessionId).toBe(state.activeInspectionSessionId);
    expect(restored.pendingBoundaryEvent).toBe("pickup");
    expect(restored.pendingOutcome).toEqual(state.pendingOutcome);
    expect(restored.specimens).toEqual([specimen]);
    expect(restored.favoriteSpecimenIds).toEqual([]);
  });

  it("keeps a favorite through the 20:00 deferred journal boundary and the next day", () => {
    const storage = new MemoryStorage();
    const tree = treeById["backyard-tree-1"];
    let state: GameState = {
      ...createInitialGame("favorite-day-boundary"),
      timeMinutes: 1185,
      phase: "evening",
      locationId: "backyard",
      field: {
        fieldId: "backyard",
        x: tree.x,
        y: tree.y + 70,
        facing: "up",
        lastSafeX: tree.x,
        lastSafeY: tree.y + 70,
        discoveredFieldIds: ["grandma-house", "backyard"],
      },
      visitCounters: { backyard: 1 },
      exploration: { locationId: "backyard", visitIndex: 1, period: "night", searchedSpotIds: [] },
    };
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: tree.id });
    expect(state.pendingBoundaryEvent).toBe("day-ended");
    const caught = {
      id: "day-boundary-favorite",
      insectId: "saw-stag" as const,
      sizeMm: 62.1,
      day: 1,
      caughtAtMinutes: 1200,
      locationId: "backyard" as const,
      spotId: tree.id,
      treeId: tree.id,
      inspectionPointId: tree.primaryPointId,
      rankingEligible: true,
      captureSource: "tree" as const,
    };
    state = {
      ...state,
      specimens: [caught],
      pendingOutcome: { type: "caught", specimen: caught, isPersonalBest: true, isFirstCatch: true },
      observationProgressByDay: {
        ...state.observationProgressByDay,
        "1": { ...state.observationProgressByDay["1"], capturedSpecimenIds: [caught.id] },
      },
    };
    state = gameReducer(state, { type: "SET_SPECIMEN_FAVORITE", specimenId: caught.id, favorite: true });
    saveGame(state, storage);

    let restored = loadGame(storage)!;
    expect(restored.favoriteSpecimenIds).toEqual([caught.id]);
    restored = gameReducer(restored, { type: "ACKNOWLEDGE_OUTCOME" });
    restored = gameReducer(restored, { type: "CLOSE_TREE_INSPECTION" });
    expect(restored.phase).toBe("day-ended");
    expect(restored.observationJournalByDay["1"].capturedSpecimenIds).toEqual([caught.id]);
    expect(Object.keys(restored.observationJournalByDay)).toHaveLength(1);

    const nextDay = gameReducer(restored, { type: "START_NEXT_DAY" });
    expect(nextDay.day).toBe(2);
    expect(nextDay.favoriteSpecimenIds).toEqual([caught.id]);
  });

  it("migrates an opened player trap, caught result, and deferred pickup from Version 5", () => {
    const storage = new MemoryStorage();
    const base = createInitialGame("active-player-trap-save");
    const trap = {
      id: "player-trap:1:oak-tree-1:day-1",
      kind: "banana" as const,
      sequence: 1,
      treeId: "oak-tree-1",
      installedDay: 1,
      installedAtMinutes: 900,
      readyDay: 2,
      phase: "opened" as const,
      openedAtMinutes: 1075,
      outcomePlan: {
        planVersion: 1 as const,
        resolvedDay: 2,
        resolvedNatureId: "still-summer" as const,
        presenceTier: "none" as const,
        ambientPlacements: [
          { id: "a", insectId: "ant" as const, x: .3, y: .4, motion: "crawl" as const },
          { id: "b", insectId: "green-bottle" as const, x: .6, y: .5, motion: "still" as const },
        ],
      },
    };
    const caught = {
      id: "player-trap-pending-catch",
      insectId: "japanese-rhino" as const,
      sizeMm: 70.4,
      day: 2,
      caughtAtMinutes: 1080,
      locationId: "oak-forest" as const,
      spotId: trap.id,
      treeId: trap.treeId,
      inspectionPointId: `${trap.treeId}:player-banana-trap`,
      rankingEligible: true,
      captureSource: "player-banana" as const,
    };
    const state: GameState = {
      ...base,
      day: 2,
      timeMinutes: 1080,
      phase: "day",
      locationId: "oak-forest",
      field: {
        ...base.field,
        fieldId: "oak-forest",
        x: treeById["oak-tree-1"].x,
        y: treeById["oak-tree-1"].y + 30,
        lastSafeX: treeById["oak-tree-1"].x,
        lastSafeY: treeById["oak-tree-1"].y + 30,
        discoveredFieldIds: ["grandma-house", "oak-forest"],
      },
      visitCounters: { "oak-forest": 1 },
      exploration: { locationId: "oak-forest", visitIndex: 1, period: "evening", searchedSpotIds: [] },
      playerTrapKit: { unlocked: true, nextSequence: 2, activeTrap: trap },
      activePlayerTrapInspectionId: trap.id,
      pendingBoundaryEvent: "pickup",
      specimens: [caught],
      pendingOutcome: { type: "caught", specimen: caught, isPersonalBest: true, isFirstCatch: true },
      dailyPlansByDay: {
        ...base.dailyPlansByDay,
        "2": { day: 2, natureId: "still-summer", themeId: "check-player-trap", rumorNpcId: "grandma", rumorId: "grandma:still-summer" },
      },
      observationProgressByDay: {
        ...base.observationProgressByDay,
        "2": { ...base.observationProgressByDay["1"], day: 2, checkedPlayerTrapIds: [trap.id] },
      },
    };
    const raw = writeVersion5(storage, asVersion5(state));
    let restored = loadGame(storage)!;
    expect(restored.activePlayerTrapInspectionId).toBe(trap.id);
    expect(restored.pendingBoundaryEvent).toBe("pickup");
    expect(restored.playerTrapKit.activeTrap).toEqual(trap);
    expect(restored.pendingOutcome).toEqual(state.pendingOutcome);
    expect(storage.getItem(VERSION5_MIGRATION_BACKUP_KEY)).toBe(raw);

    restored = gameReducer(restored, { type: "ACKNOWLEDGE_OUTCOME" });
    const closed = gameReducer(restored, { type: "CLOSE_PLAYER_TRAP_INSPECTION", trapId: trap.id });
    expect(closed.phase).toBe("pickup");
    expect(closed.activePlayerTrapInspectionId).toBeUndefined();
    expect(closed.exploration?.period).toBe("night");
    expect(gameStateSchema.safeParse(closed).success).toBe(true);
    saveGame(closed, storage);
    const closedRestored = loadGame(storage)!;
    expect(closedRestored.phase).toBe("pickup");
    expect(closedRestored.activePlayerTrapInspectionId).toBeUndefined();
    expect(gameReducer(closedRestored, { type: "COMPLETE_PICKUP" }).phase).toBe("evening");
  });

  it("repairs a removed compatible tree while migrating a Version 5 save", () => {
    const storage = new MemoryStorage();
    const initial = createInitialGame("repair-player-trap-tree");
    const invalid: GameState = {
      ...initial,
      playerTrapKit: {
        unlocked: true,
        nextSequence: 2,
        activeTrap: {
          id: "player-trap:1:removed-tree:day-1",
          kind: "banana",
          sequence: 1,
          treeId: "removed-tree",
          installedDay: 1,
          installedAtMinutes: 700,
          readyDay: 2,
          phase: "waiting",
        },
      },
      metNpcIds: ["grandma"],
    };
    writeVersion5(storage, asVersion5(invalid));
    const restored = loadGame(storage)!;
    expect(restored.worldSeed).toBe(initial.worldSeed);
    expect(restored.metNpcIds).toEqual(["grandma"]);
    expect(restored.playerTrapKit.activeTrap).toBeUndefined();
    expect(restored.pendingOutcome).toMatchObject({ type: "notice", title: "仕掛けを手元へ戻しました" });
  });

  it("does not overwrite the original pre-v5 backup during later Version 5 content repair", () => {
    const storage = new MemoryStorage();
    const originalPreV5 = "original-version-4-envelope";
    storage.setItem(MIGRATION_BACKUP_KEY, originalPreV5);
    const initial = createInitialGame("preserve-pre-v5-backup");
    const repairable: GameState = {
      ...initial,
      playerTrapKit: {
        unlocked: true,
        nextSequence: 2,
        activeTrap: {
          id: "player-trap:1:removed-tree:day-1",
          kind: "banana",
          sequence: 1,
          treeId: "removed-tree",
          installedDay: 1,
          installedAtMinutes: 700,
          readyDay: 2,
          phase: "waiting",
        },
      },
    };
    writeVersion5(storage, asVersion5(repairable));

    expect(loadGame(storage)?.playerTrapKit.activeTrap).toBeUndefined();
    expect(storage.getItem(MIGRATION_BACKUP_KEY)).toBe(originalPreV5);
  });

  it("does not overwrite an existing pre-v5 backup during a repeated Version 4 migration", () => {
    const storage = new MemoryStorage();
    storage.setItem(MIGRATION_BACKUP_KEY, "first-version-4-original");
    writeVersion4(storage, asVersion4(createInitialGame("later-version-4")));
    expect(loadGame(storage)?.worldSeed).toBe("later-version-4");
    expect(storage.getItem(MIGRATION_BACKUP_KEY)).toBe("first-version-4-original");
  });

  it("repairs only duplicate and missing favorite references before strict validation", () => {
    consumeSaveRepairNotice();
    const storage = new MemoryStorage();
    const base = createInitialGame("repair-favorite-refs");
    const first = {
      id: "first-favorite",
      insectId: "japanese-rhino" as const,
      sizeMm: 68.2,
      day: 1,
      caughtAtMinutes: 600,
      locationId: "oak-forest" as const,
      spotId: "oak-tree-1",
      treeId: "oak-tree-1",
      inspectionPointId: "oak-tree-1:sap",
      rankingEligible: true,
      captureSource: "tree" as const,
    };
    const second = { ...first, id: "second-favorite", sizeMm: 69.4 };
    const pendingOutcome = { type: "caught" as const, specimen: second, isPersonalBest: true };
    const repairable: GameState = {
      ...base,
      specimens: [first, second],
      favoriteSpecimenIds: [second.id, "missing", second.id, first.id],
      pendingOutcome,
      metNpcIds: ["grandma"],
    };
    const backup = createInitialGame("must-not-roll-back");
    storage.setItem(BACKUP_KEY, JSON.stringify({ schemaVersion: 6, savedAt: new Date().toISOString(), state: backup }));
    storage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: 6, savedAt: new Date().toISOString(), state: repairable }));

    const restored = loadGame(storage)!;
    expect(restored.worldSeed).toBe("repair-favorite-refs");
    expect(restored.favoriteSpecimenIds).toEqual([second.id, first.id]);
    expect(restored.specimens).toEqual([first, second]);
    expect(restored.pendingOutcome).toEqual(pendingOutcome);
    expect(restored.metNpcIds).toEqual(["grandma"]);
    expect(consumeSaveRepairNotice()).toContain("とっておき参照");
    expect(consumeSaveRepairNotice()).toBeNull();
  });

  it("rejects duplicate specimen identities instead of silently repairing them", () => {
    const storage = new MemoryStorage();
    const valid = createInitialGame("duplicate-id-backup");
    storage.setItem(BACKUP_KEY, JSON.stringify({ schemaVersion: 6, savedAt: new Date().toISOString(), state: valid }));
    const specimen = {
      id: "duplicate",
      insectId: "saw-stag" as const,
      sizeMm: 60,
      day: 1,
      caughtAtMinutes: 600,
      locationId: "mixed-forest" as const,
      spotId: "mixed-tree-1",
      treeId: "mixed-tree-1",
      inspectionPointId: "mixed-tree-1:sap",
      rankingEligible: true,
      captureSource: "tree" as const,
    };
    const invalid: GameState = {
      ...createInitialGame("duplicate-id-current"),
      specimens: [specimen, { ...specimen, sizeMm: 61 }],
    };
    storage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: 6, savedAt: new Date().toISOString(), state: invalid }));
    expect(loadGame(storage)?.worldSeed).toBe("duplicate-id-backup");
  });

  it("rejects invalid player trap phase and duplicate observation IDs", () => {
    const initial = createInitialGame("invalid-player-trap-semantic");
    const invalidWaiting: GameState = {
      ...initial,
      playerTrapKit: {
        unlocked: true,
        nextSequence: 2,
        activeTrap: {
          id: "player-trap:1:oak-tree-1:day-1",
          kind: "banana",
          sequence: 1,
          treeId: "oak-tree-1",
          installedDay: 1,
          installedAtMinutes: 700,
          readyDay: 2,
          phase: "waiting",
          outcomePlan: {
            planVersion: 1,
            resolvedDay: 2,
            resolvedNatureId: "still-summer",
            presenceTier: "none",
            ambientPlacements: [
              { id: "a", insectId: "ant", x: .3, y: .4, motion: "crawl" },
              { id: "b", insectId: "gnat", x: .5, y: .6, motion: "flutter" },
            ],
          },
        },
      },
    };
    expect(gameStateSchema.safeParse(invalidWaiting).success).toBe(false);
    expect(gameStateSchema.safeParse({
      ...initial,
      observationProgressByDay: {
        "1": { ...initial.observationProgressByDay["1"], placedPlayerTrapIds: ["same", "same"] },
      },
    }).success).toBe(false);
  });

  it("falls back to the previous valid backup when the current save is corrupt", () => {
    const storage = new MemoryStorage();
    const first = createInitialGame("backup-test");
    saveGame(first, storage);
    saveGame({ ...first, day: 2, revision: 1 }, storage);
    storage.setItem(SAVE_KEY, "not-json");
    expect(loadGame(storage)?.day).toBe(1);
  });

  it("does not replace a valid backup with corrupt current data during autosave", () => {
    const storage = new MemoryStorage();
    const validBackup = JSON.stringify({
      schemaVersion: 6,
      savedAt: new Date().toISOString(),
      state: createInitialGame("protected-backup"),
    });
    storage.setItem(BACKUP_KEY, validBackup);
    storage.setItem(SAVE_KEY, "broken-current");
    saveGame(createInitialGame("new-current"), storage);
    expect(storage.getItem(BACKUP_KEY)).toBe(validBackup);
    expect(loadGame(storage)?.worldSeed).toBe("new-current");
  });

  it("returns a migrated Version 5 save even if the optional pre-v6 backup key cannot be read", () => {
    const memory = new MemoryStorage();
    const raw = writeVersion5(memory, asVersion5(createInitialGame("backup-read-blocked")));
    const storage: StorageLike = {
      getItem: (key) => {
        if (key === VERSION5_MIGRATION_BACKUP_KEY) throw new Error("blocked optional key");
        if (key === SAVE_KEY) return raw;
        return null;
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(loadGame(storage)?.worldSeed).toBe("backup-read-blocked");
  });

  it("rejects a remote daytime state at or after 18:00 without a deferred inspection", () => {
    const invalid = {
      ...createInitialGame("invalid-time"),
      timeMinutes: 1080,
      phase: "day" as const,
      locationId: "oak-forest" as const,
      field: {
        ...createInitialGame("invalid-time").field,
        fieldId: "oak-forest" as const,
      },
    };
    expect(gameStateSchema.safeParse(invalid).success).toBe(false);
  });

  it("restores an exact safe position", () => {
    const storage = new MemoryStorage();
    let state = createInitialGame("position-test");
    state = gameReducer(state, { type: "SYNC_PLAYER_POSITION", x: 600, y: 720, facing: "right" });
    saveGame(state, storage);
    expect(loadGame(storage)?.field).toMatchObject({ x: 600, y: 720, facing: "right" });
  });

  it("repairs an unsafe position to a nearby safe point instead of abandoning the field", () => {
    const storage = new MemoryStorage();
    const initial = createInitialGame("repair-test");
    saveGame({
      ...initial,
      field: { ...initial.field, x: 800, y: 400, lastSafeX: 800, lastSafeY: 400 },
    }, storage);
    const restored = loadGame(storage)!;
    expect(restored.field.fieldId).toBe("grandma-house");
    expect(restored.field.x).not.toBe(800);
    expect(restored.field).not.toMatchObject({ x: 570, y: 710 });
  });

  it("migrates a full Version 2 save without losing collection, NPC, buff, secret, or position data", () => {
    const storage = new MemoryStorage();
    const tree = treeById["oak-tree-1"];
    const current: GameState = {
      ...createInitialGame("v2-full"),
      day: 3,
      timeMinutes: 600,
      locationId: "oak-forest",
      field: {
        fieldId: "oak-forest",
        x: tree.x,
        y: tree.y + 70,
        facing: "left",
        lastSafeX: tree.x,
        lastSafeY: tree.y + 70,
        discoveredFieldIds: ["grandma-house", "shrine", "oak-forest"],
      },
      visitCounters: { shrine: 2, "oak-forest": 4 },
      exploration: {
        locationId: "oak-forest",
        visitIndex: 4,
        period: "day",
        focusedSpotId: tree.id,
        searchedSpotIds: [tree.id, tree.id, "removed-spot"],
      },
      specimens: [{
        id: "old-catch",
        insectId: "giant-stag",
        sizeMm: 71.2,
        day: 2,
        caughtAtMinutes: 720,
        locationId: "oak-forest",
        spotId: tree.id,
        rankingEligible: false,
        captureSource: "tree",
      }],
      npcTalkCounts: { grandma: 2, "shrine-keeper": 3 },
      metNpcIds: ["grandma", "shrine-keeper"],
      flags: {
        secretRouteUnlocked: true,
        pickupCompletedDay: 2,
        extraHintDay: 3,
        fieldTutorialSeen: true,
        playerTrapTutorialSeen: false,
      },
      buffs: { appearanceBoostUntil: 660, nextBoostExtensionMinutes: 30 },
    };
    const version2 = asVersion2(current);
    expect(version2GameStateSchema.safeParse(version2).success).toBe(true);
    writeVersion2(storage, version2);
    const restored = loadGame(storage)!;
    expect(restored.schemaVersion).toBe(6);
    expect(restored.worldSeed).toBe("v2-full");
    expect(restored.specimens[0]).toMatchObject({
      id: "old-catch",
      rankingEligible: false,
      treeId: tree.id,
      inspectionPointId: tree.primaryPointId,
    });
    expect(restored.npcTalkCounts).toEqual(current.npcTalkCounts);
    expect(restored.metNpcIds).toEqual(current.metNpcIds);
    expect(restored.buffs).toEqual(current.buffs);
    expect(restored.flags.secretRouteUnlocked).toBe(true);
    expect(restored.field.fieldId).toBe("oak-forest");
    expect(restored.field.facing).toBe("left");
    expect(restored.exploration?.searchedSpotIds).toEqual([tree.id, "removed-spot"]);
    expect(Object.values(restored.inspectionSessions)).toHaveLength(1);
    expect(Object.values(restored.inspectionSessions)[0].examinedPointIds).toEqual([tree.primaryPointId]);
    expect(storage.getItem(MIGRATION_BACKUP_KEY)).toBe(storage.getItem(SAVE_KEY));
  });

  it("does not charge another 15 minutes for a migrated searched tree", () => {
    const storage = new MemoryStorage();
    const tree = treeById["mixed-tree-1"];
    const current: GameState = {
      ...createInitialGame("migrated-session"),
      timeMinutes: 600,
      locationId: "mixed-forest",
      field: {
        fieldId: "mixed-forest",
        x: tree.x,
        y: tree.y + 70,
        facing: "up",
        lastSafeX: tree.x,
        lastSafeY: tree.y + 70,
        discoveredFieldIds: ["mixed-forest"],
      },
      visitCounters: { "mixed-forest": 1 },
      exploration: {
        locationId: "mixed-forest",
        visitIndex: 1,
        period: "day",
        searchedSpotIds: [tree.id],
      },
    };
    writeVersion2(storage, asVersion2(current));
    const restored = loadGame(storage)!;
    const reopened = gameReducer(restored, { type: "OPEN_TREE_INSPECTION", treeId: tree.id });
    expect(reopened.timeMinutes).toBe(600);
  });

  it("migrates Version 1 progress through Version 2 into Version 6", () => {
    const storage = new MemoryStorage();
    const current = createInitialGame("legacy-test");
    const version2 = asVersion2({
      ...current,
      visitCounters: { shrine: 2 },
      npcTalkCounts: { grandma: 2 },
      metNpcIds: ["grandma"],
    });
    const { field: _field, flags, ...withoutField } = version2;
    const { fieldTutorialSeen: _tutorial, ...legacyFlags } = flags;
    storage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      state: { ...withoutField, schemaVersion: 1, contentVersion: 1, flags: legacyFlags },
    }));
    const restored = loadGame(storage)!;
    expect(restored.schemaVersion).toBe(6);
    expect(restored.npcTalkCounts.grandma).toBe(2);
    expect(restored.field.discoveredFieldIds).toEqual(expect.arrayContaining(["grandma-house", "shrine"]));
  });

  it("migrates a Version 2 backup when the current save is corrupt", () => {
    const storage = new MemoryStorage();
    const version2 = asVersion2(createInitialGame("backup-v2"));
    storage.setItem(BACKUP_KEY, JSON.stringify({ schemaVersion: 2, savedAt: new Date().toISOString(), state: version2 }));
    storage.setItem(SAVE_KEY, "broken");
    expect(loadGame(storage)?.worldSeed).toBe("backup-v2");
  });

  it("migrates Version 3 into Version 6 without inferring earlier observation progress", () => {
    const storage = new MemoryStorage();
    const tree = treeById["oak-tree-1"];
    let state: GameState = {
      ...createInitialGame("v3-to-v4"),
      timeMinutes: 1075,
      locationId: "oak-forest",
      field: {
        fieldId: "oak-forest",
        x: tree.x,
        y: tree.y + 70,
        facing: "up",
        lastSafeX: tree.x,
        lastSafeY: tree.y + 70,
        discoveredFieldIds: ["grandma-house", "oak-forest"],
      },
      visitCounters: { "oak-forest": 1 },
      exploration: {
        locationId: "oak-forest",
        visitIndex: 1,
        period: "evening",
        searchedSpotIds: [],
      },
      flags: {
        ...createInitialGame("v3-to-v4").flags,
        secretRouteUnlocked: true,
        fieldTutorialSeen: true,
      },
      specimens: [{
        id: "legacy-today",
        insectId: "saw-stag",
        sizeMm: 62.4,
        day: 1,
        caughtAtMinutes: 900,
        locationId: "mixed-forest",
        spotId: "mixed-tree-1",
        treeId: "mixed-tree-1",
        inspectionPointId: "mixed-tree-1:sap",
        rankingEligible: true,
        captureSource: "tree",
      }],
    };
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: tree.id });
    expect(state.pendingBoundaryEvent).toBe("pickup");
    const version3 = asVersion3(state);
    expect(version3GameStateSchema.safeParse(version3).success).toBe(true);
    const raw = JSON.stringify({ schemaVersion: 3, savedAt: new Date().toISOString(), state: version3 });
    storage.setItem(SAVE_KEY, raw);

    const restored = loadGame(storage)!;
    expect(restored.schemaVersion).toBe(6);
    expect(restored.activeInspectionSessionId).toBe(state.activeInspectionSessionId);
    expect(restored.pendingBoundaryEvent).toBe("pickup");
    expect(restored.flags.secretRouteUnlocked).toBe(true);
    expect(restored.specimens).toEqual(state.specimens);
    expect(restored.observationProgressByDay["1"].inspectedTreeIds).toEqual([]);
    expect(restored.dailyPlansByDay["1"].themeId).toBe("inspect-three-trees");
    expect(restored.morningBriefSeenDays).toEqual([1]);
    expect(storage.getItem(MIGRATION_BACKUP_KEY)).toBe(raw);
  });

  it("falls back to backup when a Version 3 session references an unknown point", () => {
    const storage = new MemoryStorage();
    const valid = createInitialGame("semantic-backup");
    saveGame(valid, storage);
    const validRaw = storage.getItem(SAVE_KEY)!;
    storage.setItem(BACKUP_KEY, validRaw);
    const broken = {
      ...valid,
      inspectionSessions: {
        broken: {
          id: "broken",
          treeId: "oak-tree-1",
          committed: true,
          day: 1,
          visitIndex: 1,
          period: "day",
          startedAtMinutes: 600,
          resolvedAtMinutes: 615,
          currentPointId: "missing-point",
          examinedPointIds: [],
          ambientByPointId: {},
          clueVisible: false,
          returnPosition: { x: 600, y: 700, facing: "up" },
        },
      },
    };
    storage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: 3, savedAt: new Date().toISOString(), state: broken }));
    expect(loadGame(storage)?.worldSeed).toBe("semantic-backup");
  });

  it("falls back from an invalid Version 4 save with a prematurely finalized journal", () => {
    const storage = new MemoryStorage();
    const valid = createInitialGame("valid-v4-backup");
    saveGame(valid, storage);
    storage.setItem(BACKUP_KEY, storage.getItem(SAVE_KEY)!);

    let ended = createInitialGame("invalid-early-journal");
    ended = { ...ended, timeMinutes: 1185, phase: "evening" };
    ended = gameReducer(ended, { type: "REST", minutes: 30 });
    const broken: GameState = {
      ...createInitialGame("invalid-early-journal"),
      observationJournalByDay: ended.observationJournalByDay,
    };
    storage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: 4,
      savedAt: new Date().toISOString(),
      state: broken,
    }));

    expect(loadGame(storage)?.worldSeed).toBe("valid-v4-backup");
  });

  it("deletes current and every migration backup", () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, "current");
    storage.setItem(BACKUP_KEY, "backup");
    storage.setItem(VERSION5_MIGRATION_BACKUP_KEY, "pre-v6");
    storage.setItem(MIGRATION_BACKUP_KEY, "pre-v4");
    storage.setItem(VERSION4_MIGRATION_BACKUP_KEY, "older-pre-v4");
    storage.setItem(LEGACY_MIGRATION_BACKUP_KEY, "pre-v3");
    deleteSave(storage);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(storage.getItem(BACKUP_KEY)).toBeNull();
    expect(storage.getItem(VERSION5_MIGRATION_BACKUP_KEY)).toBeNull();
    expect(storage.getItem(MIGRATION_BACKUP_KEY)).toBeNull();
    expect(storage.getItem(VERSION4_MIGRATION_BACKUP_KEY)).toBeNull();
    expect(storage.getItem(LEGACY_MIGRATION_BACKUP_KEY)).toBeNull();
  });

  it("keeps running when browser storage throws", () => {
    const throwingStorage: StorageLike = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("full"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(() => saveGame(createInitialGame("no-storage"), throwingStorage)).not.toThrow();
    expect(loadGame(throwingStorage)).toBeNull();
  });
});
