import { describe, expect, it } from "vitest";
import { fieldById, getSpawnPoint } from "../data/fields";
import { locationById } from "../data/locations";
import { treeById } from "../data/trees";
import type {
  DailyNatureId,
  DailyPlan,
  GameState,
  ObservationThemeId,
} from "../types/game";
import {
  finalizeObservationJournal,
  generateDailyPlan,
  getObservationProgressText,
  naturePresenceMultiplier,
} from "./daily";
import { createInitialGame, gameReducer } from "./engine";
import { rollEncounter } from "./rules";

const withDailyPlan = (
  state: GameState,
  values: { natureId?: DailyNatureId; themeId?: ObservationThemeId; rumorNpcId?: DailyPlan["rumorNpcId"] },
): GameState => {
  const current = state.dailyPlansByDay[String(state.day)];
  const plan: DailyPlan = {
    ...current,
    ...values,
    rumorId: `${values.rumorNpcId ?? current.rumorNpcId}:${values.natureId ?? current.natureId}`,
  };
  return {
    ...state,
    dailyPlansByDay: { ...state.dailyPlansByDay, [String(state.day)]: plan },
  };
};

const stateAtTree = (
  treeId: string,
  seed: string,
  options: { natureId?: DailyNatureId; boosted?: boolean; timeMinutes?: number } = {},
): GameState => {
  const tree = treeById[treeId];
  const field = fieldById[tree.fieldId];
  const locationId = field.locationId!;
  const timeMinutes = options.timeMinutes ?? 600;
  const period = timeMinutes < 600 ? "morning" : timeMinutes < 960 ? "day" : timeMinutes < 1080 ? "evening" : "night";
  const base: GameState = {
    ...createInitialGame(seed),
    timeMinutes,
    phase: timeMinutes >= 1080 ? "evening" : "day",
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
    visitCounters: { [locationId]: 1 },
    exploration: {
      locationId,
      visitIndex: 1,
      period,
      searchedSpotIds: [],
    },
    buffs: {
      appearanceBoostUntil: options.boosted ? timeMinutes + 60 : 0,
      nextBoostExtensionMinutes: 0,
    },
  };
  return withDailyPlan(base, { natureId: options.natureId ?? "still-summer" });
};

describe("daily nature and observation", () => {
  it("generates the same plan for the same seed and avoids the previous two days", () => {
    const context = { rngVersion: 1, worldSeed: "daily-repeat", secretRouteUnlocked: false };
    const first = generateDailyPlan({ ...context, day: 1 });
    expect(generateDailyPlan({ ...context, day: 1 })).toEqual(first);

    const plans: Record<string, DailyPlan> = {};
    for (let day = 1; day <= 12; day += 1) {
      const plan = generateDailyPlan({ ...context, day }, plans);
      expect(plan.natureId).not.toBe(plans[String(day - 1)]?.natureId);
      expect(plan.natureId).not.toBe(plans[String(day - 2)]?.natureId);
      expect(plan.themeId).not.toBe(plans[String(day - 1)]?.themeId);
      expect(plan.themeId).not.toBe(plans[String(day - 2)]?.themeId);
      plans[String(day)] = plan;
    }
  });

  it("only selects NPCs who can still be met that day and falls back to grandma after schedules end", () => {
    for (let index = 0; index < 40; index += 1) {
      const latePlan = generateDailyPlan({
        rngVersion: 1,
        worldSeed: `late-rumor-${index}`,
        day: index % 2 === 0 ? 2 : 3,
        secretRouteUnlocked: true,
        timeMinutes: 1080,
      });
      expect(latePlan.rumorNpcId).toBe("grandma");
    }

    const afterAllSchedules = generateDailyPlan({
      rngVersion: 1,
      worldSeed: "rumor-fallback",
      day: 2,
      secretRouteUnlocked: true,
      timeMinutes: 1200,
    });
    expect(afterAllSchedules.rumorNpcId).toBe("grandma");
  });

  it("biases still-summer plans toward trust-your-eyes with triple weighting", () => {
    let stillSummerPlans = 0;
    let stillSummerTrustPlans = 0;
    let otherPlans = 0;
    let otherTrustPlans = 0;

    for (let index = 0; index < 6000; index += 1) {
      const plan = generateDailyPlan({
        rngVersion: 1,
        worldSeed: `still-summer-bias-${index}`,
        day: 1,
        secretRouteUnlocked: false,
        timeMinutes: 360,
      });
      if (plan.natureId === "still-summer") {
        stillSummerPlans += 1;
        if (plan.themeId === "trust-your-eyes") stillSummerTrustPlans += 1;
      } else {
        otherPlans += 1;
        if (plan.themeId === "trust-your-eyes") otherTrustPlans += 1;
      }
    }

    const stillSummerShare = stillSummerTrustPlans / stillSummerPlans;
    const otherNatureShare = otherTrustPlans / otherPlans;
    expect(stillSummerPlans).toBeGreaterThan(800);
    expect(stillSummerShare).toBeGreaterThan(otherNatureShare * 2);
  });

  it("keeps nature multipliers at or below 1.2 and targets sap-capable trees", () => {
    const lively = stateAtTree("oak-tree-1", "nature-cap", { natureId: "lively-sap" });
    const hotspot = locationById["oak-forest"].hotspots.find((spot) => spot.id === "oak-tree-1")!;
    expect(naturePresenceMultiplier(lively, hotspot, "day")).toBe(1.15);
    expect(naturePresenceMultiplier(lively, hotspot, "day")).toBeLessThanOrEqual(1.2);
    const quiet = withDailyPlan(lively, { natureId: "quiet-roots" });
    expect(naturePresenceMultiplier(quiet, hotspot, "day")).toBe(1);
  });

  it("uses monotonic base, nature, and ad thresholds without changing species or size", () => {
    const hotspot = locationById["oak-forest"].hotspots.find((spot) => spot.id === "oak-tree-1")!;
    let naturalAdded = false;
    let adAdded = false;
    let preserved = false;
    for (let index = 0; index < 12000 && !(naturalAdded && adAdded && preserved); index += 1) {
      const seed = `layers-${index}`;
      const baseState = stateAtTree("oak-tree-1", seed, { natureId: "still-summer" });
      const naturalState = stateAtTree("oak-tree-1", seed, { natureId: "lively-sap" });
      const adState = stateAtTree("oak-tree-1", seed, { natureId: "lively-sap", boosted: true });
      const base = rollEncounter(baseState, hotspot);
      const natural = rollEncounter(naturalState, hotspot);
      const ad = rollEncounter(adState, hotspot);
      if (base && natural && ad) {
        preserved = true;
        expect(natural).toMatchObject({ insectId: base.insectId, sizeMm: base.sizeMm, boostAssisted: false });
        expect(ad).toMatchObject({ insectId: base.insectId, sizeMm: base.sizeMm, boostAssisted: false });
      }
      if (!base && natural) {
        naturalAdded = true;
        expect(natural.boostAssisted).toBe(false);
      }
      if (!natural && ad) {
        adAdded = true;
        expect(ad.boostAssisted).toBe(true);
      }
    }
    expect({ naturalAdded, adAdded, preserved }).toEqual({ naturalAdded: true, adAdded: true, preserved: true });
  });

  it("records a tree and its points once and completes the high-and-low theme", () => {
    let state = withDailyPlan(stateAtTree("oak-tree-1", "progress-once"), { themeId: "look-high-and-low" });
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: "oak-tree-1" });
    const root = treeById["oak-tree-1"].inspectionPoints.find((point) => point.sceneKind === "root")!;
    state = gameReducer(state, { type: "VIEW_INSPECTION_POINT", pointId: root.id });
    const progress = state.observationProgressByDay["1"];
    expect(progress.inspectedTreeIds).toEqual(["oak-tree-1"]);
    expect(progress.examinedPointIds).toHaveLength(2);
    expect(progress.completed).toBe(true);
    expect(getObservationProgressText(state)).toContain("スタンプ");

    state = gameReducer(state, { type: "CLOSE_TREE_INSPECTION" });
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: "oak-tree-1" });
    expect(state.observationProgressByDay["1"].inspectedTreeIds).toEqual(["oak-tree-1"]);
    expect(state.observationProgressByDay["1"].examinedPointIds).toHaveLength(2);
  });

  it("adds the daily rumor only to the rumor NPC's first conversation", () => {
    let state = withDailyPlan(createInitialGame("rumor-once"), {
      themeId: "listen-to-someone",
      rumorNpcId: "grandma",
      natureId: "still-summer",
    });
    state = {
      ...state,
      field: { ...state.field, x: 700, y: 740, lastSafeX: 700, lastSafeY: 740 },
    };
    state = gameReducer(state, { type: "TALK", npcId: "grandma" });
    expect(state.pendingOutcome?.type).toBe("dialogue");
    expect(state.pendingOutcome?.type === "dialogue" ? state.pendingOutcome.text : "").toContain("今日の噂");
    expect(state.npcTalkCounts.grandma).toBe(1);
    expect(state.heardRumorDays).toEqual([1]);
    expect(state.observationProgressByDay["1"].completed).toBe(true);

    state = gameReducer(state, { type: "ACKNOWLEDGE_OUTCOME" });
    state = gameReducer(state, { type: "TALK", npcId: "grandma" });
    expect(state.pendingOutcome?.type === "dialogue" ? state.pendingOutcome.text : "").not.toContain("今日の噂");
    expect(state.npcTalkCounts.grandma).toBe(2);
    expect(state.heardRumorDays).toEqual([1]);
  });

  it("waits to finalize the journal until a 19:45 backyard close-up is closed", () => {
    let state = withDailyPlan(stateAtTree("backyard-tree-1", "late-journal", {
      natureId: "moths-at-light",
      timeMinutes: 1185,
    }), { themeId: "look-high-and-low" });
    state = gameReducer(state, { type: "OPEN_TREE_INSPECTION", treeId: "backyard-tree-1" });
    expect(state.timeMinutes).toBe(1200);
    expect(state.pendingBoundaryEvent).toBe("day-ended");
    expect(state.observationJournalByDay["1"]).toBeUndefined();
    const root = treeById["backyard-tree-1"].inspectionPoints.find((point) => point.sceneKind === "root")!;
    state = gameReducer(state, { type: "VIEW_INSPECTION_POINT", pointId: root.id });
    state = gameReducer(state, { type: "CLOSE_TREE_INSPECTION" });
    const journal = state.observationJournalByDay["1"];
    expect(state.phase).toBe("day-ended");
    expect(journal.examinedPointIds).toContain(root.id);
    expect(journal.diaryLines.length).toBeGreaterThanOrEqual(1);
    expect(journal.themeCompleted).toBe(true);
  });

  it("starts the next day with a new fixed plan while preserving the previous journal", () => {
    let state = createInitialGame("next-day-plan");
    state = { ...state, timeMinutes: 1185, phase: "evening", locationId: "grandma-house", field: {
      ...state.field,
      ...getSpawnPoint("grandma-house"),
    } };
    state = gameReducer(state, { type: "REST", minutes: 30 });
    const firstPlan = state.dailyPlansByDay["1"];
    expect(state.observationJournalByDay["1"]).toBeDefined();
    state = gameReducer(state, { type: "START_NEXT_DAY" });
    expect(state.day).toBe(2);
    expect(state.dailyPlansByDay["1"]).toEqual(firstPlan);
    expect(state.dailyPlansByDay["2"]).toBeDefined();
    expect(state.observationJournalByDay["1"]).toBeDefined();
    expect(state.morningBriefSeenDays).not.toContain(2);
  });

  it("does not claim zero trees were inspected when a migrated-day capture is journaled", () => {
    const state: GameState = {
      ...createInitialGame("migrated-capture-diary"),
      specimens: [{
        id: "legacy-capture",
        insectId: "japanese-rhino",
        sizeMm: 72.4,
        day: 1,
        caughtAtMinutes: 720,
        locationId: "oak-forest",
        spotId: "oak-tree-1",
        treeId: "oak-tree-1",
        rankingEligible: true,
      }],
    };

    const journal = finalizeObservationJournal(state).observationJournalByDay["1"];
    expect(journal.diaryLines.join(" ")).toContain("クヌギ林でカブトムシを見つけた");
    expect(journal.diaryLines.join(" ")).not.toContain("0本の木");
  });
});
