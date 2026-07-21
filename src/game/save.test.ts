import { describe, expect, it } from "vitest";
import { treeById } from "../data/trees";
import type { GameState } from "../types/game";
import { createInitialGame, gameReducer } from "./engine";
import {
  BACKUP_KEY,
  LEGACY_MIGRATION_BACKUP_KEY,
  MIGRATION_BACKUP_KEY,
  SAVE_KEY,
  deleteSave,
  gameStateSchema,
  loadGame,
  saveGame,
  version2GameStateSchema,
  version3GameStateSchema,
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

  it("falls back to the previous valid backup when the current save is corrupt", () => {
    const storage = new MemoryStorage();
    const first = createInitialGame("backup-test");
    saveGame(first, storage);
    saveGame({ ...first, day: 2, revision: 1 }, storage);
    storage.setItem(SAVE_KEY, "not-json");
    expect(loadGame(storage)?.day).toBe(1);
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
      }],
      npcTalkCounts: { grandma: 2, "shrine-keeper": 3 },
      metNpcIds: ["grandma", "shrine-keeper"],
      flags: {
        secretRouteUnlocked: true,
        pickupCompletedDay: 2,
        extraHintDay: 3,
        fieldTutorialSeen: true,
      },
      buffs: { appearanceBoostUntil: 660, nextBoostExtensionMinutes: 30 },
    };
    const version2 = asVersion2(current);
    expect(version2GameStateSchema.safeParse(version2).success).toBe(true);
    writeVersion2(storage, version2);
    const restored = loadGame(storage)!;
    expect(restored.schemaVersion).toBe(4);
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

  it("migrates Version 1 progress through Version 2 into Version 4", () => {
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
    expect(restored.schemaVersion).toBe(4);
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

  it("migrates Version 3 into Version 4 without inferring earlier observation progress", () => {
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
      }],
    };
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: tree.id });
    expect(state.pendingBoundaryEvent).toBe("pickup");
    const version3 = asVersion3(state);
    expect(version3GameStateSchema.safeParse(version3).success).toBe(true);
    const raw = JSON.stringify({ schemaVersion: 3, savedAt: new Date().toISOString(), state: version3 });
    storage.setItem(SAVE_KEY, raw);

    const restored = loadGame(storage)!;
    expect(restored.schemaVersion).toBe(4);
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

  it("deletes both current and legacy migration backups", () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, "current");
    storage.setItem(BACKUP_KEY, "backup");
    storage.setItem(MIGRATION_BACKUP_KEY, "pre-v4");
    storage.setItem(LEGACY_MIGRATION_BACKUP_KEY, "pre-v3");
    deleteSave(storage);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(storage.getItem(BACKUP_KEY)).toBeNull();
    expect(storage.getItem(MIGRATION_BACKUP_KEY)).toBeNull();
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
