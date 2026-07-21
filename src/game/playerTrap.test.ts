import { describe, expect, it } from "vitest";
import { trees, treeById } from "../data/trees";
import type { PlayerTrapState } from "../types/game";
import { createInitialGame } from "./engine";
import {
  generatePlayerTrapOutcome,
  getPlayerTrapPresenceRoll,
  getPlayerTrapProbabilities,
  playerTrapId,
  resolvePlayerTrapForDay,
  treeIdFromPlayerTrapId,
} from "./playerTrap";

const waitingTrap = (treeId = "oak-tree-1", sequence = 1, installedDay = 1): PlayerTrapState => ({
  id: playerTrapId(sequence, treeId, installedDay),
  kind: "banana",
  sequence,
  treeId,
  installedDay,
  installedAtMinutes: 600,
  readyDay: installedDay + 1,
  phase: "waiting",
});

describe("player banana trap rules", () => {
  it("marks exactly the seven specified trees as compatible", () => {
    expect(trees.filter((tree) => tree.playerTrapSlot === "banana").map((tree) => tree.id).sort()).toEqual([
      "mixed-tree-1",
      "mixed-tree-3",
      "oak-tree-1",
      "oak-tree-3",
      "school-tree-2",
      "shrine-tree-1",
      "shrine-tree-3",
    ]);
  });

  it("creates the same saved outcome for the same world key regardless of ads", () => {
    const trap = waitingTrap();
    const base = createInitialGame("trap-deterministic");
    const boosted = {
      ...base,
      buffs: { appearanceBoostUntil: 9999, nextBoostExtensionMinutes: 90 },
      flags: { ...base.flags, extraHintDay: 2 },
    };
    expect(generatePlayerTrapOutcome(base, trap, "sweet-breeze"))
      .toEqual(generatePlayerTrapOutcome(boosted, trap, "sweet-breeze"));
  });

  it("uses one monotonic presence roll and never exceeds the 0.72 cap", () => {
    const tree = treeById["oak-tree-1"];
    const normal = getPlayerTrapProbabilities(tree, "still-summer");
    const sweet = getPlayerTrapProbabilities(tree, "sweet-breeze");
    expect(normal.baseChance).toBeLessThanOrEqual(normal.natureChance);
    expect(normal.natureChance).toBeLessThanOrEqual(normal.playerTrapChance);
    expect(sweet.baseChance).toBeLessThanOrEqual(sweet.natureChance);
    expect(sweet.natureChance).toBeLessThanOrEqual(sweet.playerTrapChance);
    expect(sweet.playerTrapChance).toBeLessThanOrEqual(0.72);
  });

  it("does not change species, size, or position for an encounter already present at base odds", () => {
    const trap = waitingTrap();
    let state = createInitialGame("base-tier-0");
    const threshold = getPlayerTrapProbabilities(treeById[trap.treeId], "still-summer").baseChance;
    for (let index = 0; index < 500; index += 1) {
      const candidate = createInitialGame(`base-tier-${index}`);
      if (getPlayerTrapPresenceRoll(candidate, trap) < threshold) {
        state = candidate;
        break;
      }
    }
    const normal = generatePlayerTrapOutcome(state, trap, "still-summer");
    const sweet = generatePlayerTrapOutcome(state, trap, "sweet-breeze");
    expect(normal.presenceTier).toBe("base");
    expect(sweet.presenceTier).toBe("base");
    expect(sweet.encounter).toEqual(normal.encounter);
  });

  it("generates two to six ambient insects, at most one catchable, and no atlas outside the backyard", () => {
    for (let index = 0; index < 120; index += 1) {
      const state = createInitialGame(`trap-pool-${index}`);
      const plan = generatePlayerTrapOutcome(state, waitingTrap(), "sweet-breeze");
      expect(plan.ambientPlacements.length).toBeGreaterThanOrEqual(2);
      expect(plan.ambientPlacements.length).toBeLessThanOrEqual(6);
      expect(plan.encounter?.insectId).not.toBe("atlas-beetle");
    }
  });

  it("resolves waiting once from the saved daily nature and leaves ready results unchanged", () => {
    const trap = waitingTrap();
    const initial = createInitialGame("trap-resolve-once");
    const state = {
      ...initial,
      day: 2,
      dailyPlansByDay: {
        ...initial.dailyPlansByDay,
        "2": { day: 2, natureId: "sweet-breeze" as const, themeId: "inspect-three-trees" as const, rumorNpcId: "grandma" as const, rumorId: "grandma:sweet-breeze" },
      },
      playerTrapKit: { unlocked: true, nextSequence: 2, activeTrap: trap },
    };
    const resolved = resolvePlayerTrapForDay(state, 2);
    expect(resolved.playerTrapKit.activeTrap?.phase).toBe("ready");
    expect(resolved.playerTrapKit.activeTrap?.outcomePlan?.resolvedNatureId).toBe("sweet-breeze");
    expect(resolvePlayerTrapForDay(resolved, 4).playerTrapKit.activeTrap)
      .toEqual(resolved.playerTrapKit.activeTrap);
  });

  it("keeps stable trap IDs reversible for observation journals", () => {
    const id = playerTrapId(12, "mixed-tree-3", 8);
    expect(treeIdFromPlayerTrapId(id)).toBe("mixed-tree-3");
  });
});
