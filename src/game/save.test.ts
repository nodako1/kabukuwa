import { describe, expect, it } from "vitest";
import { getSpawnPoint } from "../data/fields";
import { createInitialGame, gameReducer } from "./engine";
import { BACKUP_KEY, SAVE_KEY, gameStateSchema, loadGame, saveGame, type StorageLike } from "./save";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("local save", () => {
  it("restores the selected tree so play resumes at the same spot", () => {
    const storage = new MemoryStorage();
    let state = createInitialGame("save-test");
    state = gameReducer(state, { type: "MOVE", locationId: "backyard" });
    state = gameReducer(state, { type: "FOCUS_SPOT", spotId: "backyard-tree-2" });
    saveGame(state, storage);

    const restored = loadGame(storage);
    expect(restored?.locationId).toBe("backyard");
    expect(restored?.field.fieldId).toBe("backyard");
    expect(restored?.exploration?.focusedSpotId).toBe("backyard-tree-2");
    expect(restored?.worldSeed).toBe("save-test");
  });

  it("falls back to the previous valid backup when the current save is corrupt", () => {
    const storage = new MemoryStorage();
    const first = createInitialGame("backup-test");
    saveGame(first, storage);
    saveGame({ ...first, day: 2, revision: 1 }, storage);

    expect(storage.getItem(BACKUP_KEY)).not.toBeNull();
    storage.setItem(SAVE_KEY, "not-json");
    expect(loadGame(storage)?.day).toBe(1);
  });

  it("rejects a remote daytime state at or after 18:00", () => {
    const point = getSpawnPoint("oak-forest");
    const invalid = {
      ...createInitialGame("invalid-time"),
      timeMinutes: 1080,
      phase: "day" as const,
      locationId: "oak-forest" as const,
      field: {
        ...createInitialGame("invalid-time").field,
        fieldId: "oak-forest" as const,
        x: point.x,
        y: point.y,
        lastSafeX: point.x,
        lastSafeY: point.y,
      },
    };
    expect(gameStateSchema.safeParse(invalid).success).toBe(false);
  });

  it("restores an exact safe position from a Version 2 save", () => {
    const storage = new MemoryStorage();
    let state = createInitialGame("position-test");
    state = gameReducer(state, { type: "SYNC_PLAYER_POSITION", x: 600, y: 720, facing: "right" });
    saveGame(state, storage);

    const restored = loadGame(storage);
    expect(restored?.field.x).toBe(600);
    expect(restored?.field.y).toBe(720);
    expect(restored?.field.facing).toBe("right");
  });

  it("repairs an unsafe saved position using the last safe position", () => {
    const storage = new MemoryStorage();
    const initial = createInitialGame("repair-test");
    saveGame({
      ...initial,
      field: { ...initial.field, x: 800, y: 400 },
    }, storage);

    const restored = loadGame(storage);
    expect(restored?.field.x).toBe(initial.field.lastSafeX);
    expect(restored?.field.y).toBe(initial.field.lastSafeY);
  });

  it("migrates Version 1 progress and the focused tree into Version 2", () => {
    const storage = new MemoryStorage();
    let state = createInitialGame("legacy-test");
    state = gameReducer(state, { type: "MOVE", locationId: "backyard" });
    state = gameReducer(state, { type: "FOCUS_SPOT", spotId: "backyard-tree-2" });
    state = {
      ...state,
      visitCounters: { ...state.visitCounters, shrine: 2 },
      npcTalkCounts: { grandma: 2 },
      metNpcIds: ["grandma"],
    };
    const { field: _field, flags, ...withoutField } = state;
    const { fieldTutorialSeen: _tutorial, ...legacyFlags } = flags;
    const legacyState = {
      ...withoutField,
      schemaVersion: 1,
      contentVersion: 1,
      flags: legacyFlags,
    };
    storage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      state: legacyState,
    }));

    const restored = loadGame(storage);
    expect(restored?.schemaVersion).toBe(2);
    expect(restored?.field.fieldId).toBe("backyard");
    expect(restored?.field.x).toBe(700);
    expect(restored?.field.y).toBe(358);
    expect(restored?.field.discoveredFieldIds).toEqual(
      expect.arrayContaining(["grandma-house", "backyard", "shrine"]),
    );
    expect(restored?.npcTalkCounts.grandma).toBe(2);
    expect(restored?.flags.fieldTutorialSeen).toBe(false);
  });

  it("falls back to backup when a structurally valid Version 1 state is impossible", () => {
    const storage = new MemoryStorage();
    const valid = createInitialGame("semantic-backup");
    saveGame(valid, storage);
    const validRaw = storage.getItem(SAVE_KEY)!;
    storage.setItem(BACKUP_KEY, validRaw);

    const { field: _field, flags, ...withoutField } = valid;
    const { fieldTutorialSeen: _tutorial, ...legacyFlags } = flags;
    storage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      state: {
        ...withoutField,
        schemaVersion: 1,
        contentVersion: 1,
        timeMinutes: 1095,
        phase: "evening",
        locationId: "oak-forest",
        flags: legacyFlags,
      },
    }));

    expect(loadGame(storage)?.worldSeed).toBe("semantic-backup");
    expect(loadGame(storage)?.field.fieldId).toBe("grandma-house");
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
