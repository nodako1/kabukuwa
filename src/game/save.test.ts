import { describe, expect, it } from "vitest";
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
    const invalid = {
      ...createInitialGame("invalid-time"),
      timeMinutes: 1080,
      phase: "day" as const,
      locationId: "oak-forest" as const,
    };
    expect(gameStateSchema.safeParse(invalid).success).toBe(false);
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
