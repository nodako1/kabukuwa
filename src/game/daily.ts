import { ambientInsectById } from "../data/ambientInsects";
import {
  dailyNatureById,
  dailyNatures,
  observationThemeById,
  observationThemes,
  rumorIdFor,
} from "../data/dailyContent";
import { fieldById } from "../data/fields";
import { insectById } from "../data/insects";
import { locationById } from "../data/locations";
import { npcs } from "../data/npcs";
import { treeById } from "../data/trees";
import type {
  AmbientInsectId,
  DailyNatureId,
  DailyPlan,
  FieldId,
  GameState,
  HotspotDefinition,
  InspectionSceneKind,
  NpcId,
  ObservationJournalEntry,
  ObservationProgress,
  ObservationThemeId,
  TimePeriod,
  TreeInspectionSession,
} from "../types/game";
import { DAY_END } from "./clock";
import { deterministicRoll } from "./rng";

export const MAIN_LOOP_FIELD_IDS: FieldId[] = [
  "grandma-house",
  "paddy-road",
  "shrine",
  "bamboo-grove",
  "school",
  "oak-forest",
  "mixed-forest",
  "forest-road",
];

interface DailyPlanContext {
  rngVersion: number;
  worldSeed: string;
  day: number;
  secretRouteUnlocked: boolean;
  timeMinutes?: number;
}

interface GeneratePlanOptions {
  migrationFallback?: boolean;
}

const unique = <T,>(items: readonly T[]): T[] => [...new Set(items)];

const scheduleMatchesDay = (days: "all" | "odd" | "even" | undefined, day: number) =>
  days === undefined || days === "all" || (days === "odd" ? day % 2 === 1 : day % 2 === 0);

const choose = <T,>(items: readonly T[], ...key: Array<string | number>): T =>
  items[Math.min(items.length - 1, Math.floor(deterministicRoll(...key) * items.length))];

const reachableNpcIds = (context: DailyPlanContext): NpcId[] => {
  const remainingDayStartsAt = context.timeMinutes ?? 360;
  const available = npcs.filter((npc) => npc.schedules.some((schedule) =>
    scheduleMatchesDay(schedule.days, context.day) &&
    (schedule.locationId !== "secret-forest" || context.secretRouteUnlocked) &&
    Math.max(schedule.startMinutes, remainingDayStartsAt) < Math.min(schedule.endMinutes, DAY_END),
  )).map((npc) => npc.id);
  return unique(available.length > 0 ? available : ["grandma"]);
};

const feasibleThemeIds = (
  natureId: DailyNatureId,
  context: DailyPlanContext,
  options: GeneratePlanOptions,
): ObservationThemeId[] => {
  if (options.migrationFallback) return ["inspect-three-trees"];
  const themes = observationThemes.map((theme) => theme.id).filter((themeId) =>
    themeId !== "check-a-trap" || natureId === "sweet-breeze" || natureId === "moths-at-light",
  );
  if ((context.timeMinutes ?? 360) >= 960) {
    return themes.filter((themeId) =>
      !["walk-the-loop", "visit-two-woods", "inspect-three-trees"].includes(themeId),
    );
  }
  return themes;
};

export const generateDailyPlan = (
  context: DailyPlanContext,
  plansByDay: Record<string, DailyPlan> = {},
  options: GeneratePlanOptions = {},
): DailyPlan => {
  const previous = [plansByDay[String(context.day - 1)], plansByDay[String(context.day - 2)]]
    .filter((plan): plan is DailyPlan => Boolean(plan));
  const previousNatureIds = new Set(previous.map((plan) => plan.natureId));
  const natureCandidates = dailyNatures.map((nature) => nature.id)
    .filter((natureId) => !previousNatureIds.has(natureId));
  const natureId = choose(
    natureCandidates.length > 0 ? natureCandidates : dailyNatures.map((nature) => nature.id),
    context.rngVersion,
    context.worldSeed,
    context.day,
    "daily-plan",
    "nature",
  );

  const previousThemeIds = new Set(previous.map((plan) => plan.themeId));
  const feasible = feasibleThemeIds(natureId, context, options);
  const themeCandidates = feasible.filter((themeId) => !previousThemeIds.has(themeId));
  const availableThemes = themeCandidates.length > 0
    ? themeCandidates
    : feasible.length > 0
      ? feasible
      : ["inspect-three-trees" as const];
  const weightedThemes = availableThemes.flatMap((themeId) =>
    natureId === "still-summer" && themeId === "trust-your-eyes"
      ? [themeId, themeId, themeId]
      : [themeId],
  );
  const themeId = choose<ObservationThemeId>(
    weightedThemes,
    context.rngVersion,
    context.worldSeed,
    context.day,
    "daily-plan",
    "theme",
  );

  const npcCandidates = reachableNpcIds(context);
  const rumorNpcId = choose<NpcId>(
    npcCandidates.length > 0 ? npcCandidates : ["grandma"],
    context.rngVersion,
    context.worldSeed,
    context.day,
    "daily-plan",
    "rumor-npc",
  );
  return {
    day: context.day,
    natureId,
    themeId,
    rumorNpcId,
    rumorId: rumorIdFor(rumorNpcId, natureId),
  };
};

export const createObservationProgress = (
  day: number,
  visitedFieldIds: FieldId[] = [],
): ObservationProgress => ({
  day,
  inspectedTreeIds: [],
  examinedPointIds: [],
  visitedFieldIds: unique(visitedFieldIds),
  talkedNpcIds: [],
  ambientInsectIds: [],
  capturedSpecimenIds: [],
  inspectedWithoutClueTreeIds: [],
  checkedTrapTreeIds: [],
  completed: false,
});

export const getCurrentDailyPlan = (state: GameState): DailyPlan =>
  state.dailyPlansByDay[String(state.day)];

export const getCurrentObservationProgress = (state: GameState): ObservationProgress =>
  state.observationProgressByDay[String(state.day)] ?? createObservationProgress(state.day);

const hasCompletedTree = (state: GameState, progress: ObservationProgress): boolean =>
  Object.values(state.inspectionSessions).some((session) => {
    if (session.day !== state.day || !session.committed || !progress.inspectedTreeIds.includes(session.treeId)) {
      return false;
    }
    const tree = treeById[session.treeId];
    return Boolean(tree) && tree.inspectionPoints
      .filter((point) => !point.activePeriods || point.activePeriods.includes(session.period))
      .every((point) => progress.examinedPointIds.includes(point.id));
  });

const hasHighAndLow = (progress: ObservationProgress): boolean =>
  progress.inspectedTreeIds.some((treeId) => {
    const tree = treeById[treeId];
    if (!tree) return false;
    const seen = tree.inspectionPoints.filter((point) => progress.examinedPointIds.includes(point.id));
    return seen.some((point) => point.sceneKind === "root") &&
      seen.some((point) => point.sceneKind !== "root");
  });

export const isObservationThemeComplete = (
  state: GameState,
  progress = getCurrentObservationProgress(state),
): boolean => {
  const plan = getCurrentDailyPlan(state);
  if (!plan) return false;
  switch (plan.themeId) {
    case "inspect-three-trees":
      return progress.inspectedTreeIds.length >= 3;
    case "look-high-and-low":
      return hasHighAndLow(progress);
    case "trust-your-eyes":
      return progress.inspectedWithoutClueTreeIds.length >= 1;
    case "visit-two-woods":
      return progress.visitedFieldIds.includes("mixed-forest") && progress.visitedFieldIds.includes("oak-forest");
    case "listen-to-someone":
      return progress.talkedNpcIds.length >= 1;
    case "check-a-trap":
      return progress.checkedTrapTreeIds.length >= 1;
    case "complete-one-tree":
      return hasCompletedTree(state, progress);
    case "walk-the-loop":
      return MAIN_LOOP_FIELD_IDS.every((fieldId) => progress.visitedFieldIds.includes(fieldId));
  }
};

const updateProgress = (
  state: GameState,
  updater: (progress: ObservationProgress) => ObservationProgress,
  completedAtMinutes = state.timeMinutes,
): GameState => {
  const key = String(state.day);
  const current = getCurrentObservationProgress(state);
  const changed = updater(current);
  const completed = current.completed || isObservationThemeComplete(state, changed);
  const next = completed === changed.completed
    ? changed
    : {
        ...changed,
        completed: true,
        completedAtMinutes: current.completedAtMinutes ?? Math.min(1200, completedAtMinutes),
      };
  if (next === current) return state;
  return {
    ...state,
    observationProgressByDay: { ...state.observationProgressByDay, [key]: next },
  };
};

export const recordFieldVisit = (state: GameState, fieldId: FieldId, atMinutes: number): GameState =>
  updateProgress(state, (progress) => progress.visitedFieldIds.includes(fieldId)
    ? progress
    : { ...progress, visitedFieldIds: [...progress.visitedFieldIds, fieldId] }, atMinutes);

const ambientIdsForPoint = (
  session: TreeInspectionSession,
  pointId: string,
): AmbientInsectId[] => unique((session.ambientByPointId[pointId] ?? []).map((placement) => placement.insectId));

const recordPoint = (
  progress: ObservationProgress,
  session: TreeInspectionSession,
  pointId: string,
): ObservationProgress => ({
  ...progress,
  examinedPointIds: progress.examinedPointIds.includes(pointId)
    ? progress.examinedPointIds
    : [...progress.examinedPointIds, pointId],
  ambientInsectIds: unique([...progress.ambientInsectIds, ...ambientIdsForPoint(session, pointId)]),
});

export const recordInspectionStarted = (
  state: GameState,
  session: TreeInspectionSession,
  clueWasDiscovered: boolean,
): GameState => updateProgress(state, (progress) => {
  let next = recordPoint(progress, session, session.currentPointId);
  next = {
    ...next,
    inspectedTreeIds: next.inspectedTreeIds.includes(session.treeId)
      ? next.inspectedTreeIds
      : [...next.inspectedTreeIds, session.treeId],
    inspectedWithoutClueTreeIds: clueWasDiscovered || next.inspectedWithoutClueTreeIds.includes(session.treeId)
      ? next.inspectedWithoutClueTreeIds
      : [...next.inspectedWithoutClueTreeIds, session.treeId],
    checkedTrapTreeIds:
      session.startedAtMinutes >= 1080 && treeById[session.treeId]?.trapKind &&
      !next.checkedTrapTreeIds.includes(session.treeId)
        ? [...next.checkedTrapTreeIds, session.treeId]
        : next.checkedTrapTreeIds,
  };
  return next;
}, session.resolvedAtMinutes);

export const recordInspectionPoint = (
  state: GameState,
  session: TreeInspectionSession,
  pointId: string,
): GameState => updateProgress(state, (progress) => recordPoint(progress, session, pointId));

export const recordNpcTalk = (state: GameState, npcId: NpcId, atMinutes: number): GameState =>
  updateProgress(state, (progress) => progress.talkedNpcIds.includes(npcId)
    ? progress
    : { ...progress, talkedNpcIds: [...progress.talkedNpcIds, npcId] }, atMinutes);

export const recordSpecimenCapture = (state: GameState, specimenId: string): GameState =>
  updateProgress(state, (progress) => progress.capturedSpecimenIds.includes(specimenId)
    ? progress
    : { ...progress, capturedSpecimenIds: [...progress.capturedSpecimenIds, specimenId] });

export const naturePresenceMultiplier = (
  state: GameState,
  hotspot: HotspotDefinition,
  period: TimePeriod,
): number => {
  const natureId = getCurrentDailyPlan(state)?.natureId;
  if (!natureId) return 1;
  if (natureId === "lively-sap") {
    const tree = treeById[hotspot.id];
    return tree?.inspectionPoints.some((point) =>
      point.sceneKind === "sap" && (!point.activePeriods || point.activePeriods.includes(period)),
    ) ? 1.15 : 1;
  }
  if (
    natureId === "forest-evening" &&
    period === "evening" &&
    (state.locationId === "mixed-forest" || state.locationId === "oak-forest")
  ) return 1.15;
  if (natureId === "sweet-breeze" && period === "night" && hotspot.kind === "banana-trap") return 1.2;
  return 1;
};

export const ambientNatureBonus = (
  state: GameState,
  sceneKind: InspectionSceneKind,
  period: TimePeriod,
): number => {
  const natureId = getCurrentDailyPlan(state)?.natureId;
  if (natureId === "lively-sap" && sceneKind === "sap") return 2;
  if (natureId === "sweet-breeze" && sceneKind === "banana-trap" && period === "night") return 2;
  if (natureId === "moths-at-light" && sceneKind === "light-trap" && period === "night") return 3;
  return 0;
};

export const inspectionPointNatureWeight = (
  state: GameState,
  sceneKind: InspectionSceneKind,
  period: TimePeriod,
): number =>
  getCurrentDailyPlan(state)?.natureId === "quiet-roots" && period === "day" && sceneKind === "root"
    ? 1.8
    : 1;

export const getObservationProgressText = (state: GameState): string => {
  const plan = getCurrentDailyPlan(state);
  const progress = getCurrentObservationProgress(state);
  if (!plan) return "自由に観察しよう";
  if (progress.completed) return "できた！ 観察スタンプ獲得";
  switch (plan.themeId) {
    case "inspect-three-trees": return `${Math.min(3, progress.inspectedTreeIds.length)} / 3本`;
    case "look-high-and-low": return hasHighAndLow(progress) ? "2 / 2か所" : `${progress.examinedPointIds.length > 0 ? 1 : 0} / 2か所`;
    case "trust-your-eyes": return `${Math.min(1, progress.inspectedWithoutClueTreeIds.length)} / 1本`;
    case "visit-two-woods": return `${["mixed-forest", "oak-forest"].filter((id) => progress.visitedFieldIds.includes(id as FieldId)).length} / 2か所`;
    case "listen-to-someone": return `${Math.min(1, progress.talkedNpcIds.length)} / 1人`;
    case "check-a-trap": return `${Math.min(1, progress.checkedTrapTreeIds.length)} / 1か所`;
    case "complete-one-tree": return "1本をすみずみまで";
    case "walk-the-loop": return `${MAIN_LOOP_FIELD_IDS.filter((id) => progress.visitedFieldIds.includes(id)).length} / 8か所`;
  }
};

const buildDiaryLines = (
  state: GameState,
  progress: ObservationProgress,
  capturedSpecimenIds: string[],
): string[] => {
  const plan = getCurrentDailyPlan(state);
  const first = plan
    ? dailyNatureById[plan.natureId].diaryLead
    : "今日は夏の村を歩いた。";
  const captures = state.specimens.filter((specimen) => capturedSpecimenIds.includes(specimen.id));
  if (captures.length > 0) {
    const last = captures[captures.length - 1];
    const discovery = progress.inspectedTreeIds.length > 0
      ? `${locationById[last.locationId].name}で${progress.inspectedTreeIds.length}本の木を覗き、${insectById[last.insectId].name}を見つけた。`
      : `${locationById[last.locationId].name}で${insectById[last.insectId].name}を見つけた。`;
    return [
      first,
      discovery,
    ];
  }
  if (progress.ambientInsectIds.length > 0) {
    const ambient = ambientInsectById[progress.ambientInsectIds[0]];
    return [
      first,
      `虫影は捕まえられなかったけれど、${ambient.label}のようすをじっくり見た。`,
    ];
  }
  if (progress.inspectedTreeIds.length > 0) {
    return [first, `${progress.inspectedTreeIds.length}本の木を覗いた。何もいない静けさも、今日の発見だった。`];
  }
  if (progress.visitedFieldIds.length > 1) {
    const latest = fieldById[progress.visitedFieldIds.at(-1)!];
    return [first, `${latest.name}まで歩き、夏の音や匂いを覚えて帰った。`];
  }
  return [first, "今日は自由に過ごした。何もしない時間も夏休みの思い出。"];
};

export const finalizeObservationJournal = (state: GameState): GameState => {
  const key = String(state.day);
  if (state.observationJournalByDay[key]) return state;
  const plan = getCurrentDailyPlan(state);
  const progress = getCurrentObservationProgress(state);
  if (!plan) return state;
  const today = state.specimens.filter((specimen) => specimen.day === state.day);
  const capturedSpecimenIds = unique([
    ...progress.capturedSpecimenIds,
    ...today.map((specimen) => specimen.id),
  ]);
  const largest = today.reduce<(typeof today)[number] | undefined>((best, specimen) =>
    !best || specimen.sizeMm > best.sizeMm ? specimen : best, undefined);
  const firstCatchInsectIds = unique(today
    .filter((specimen) => !state.specimens.some((other) =>
      other.day < state.day && other.insectId === specimen.insectId,
    ))
    .map((specimen) => specimen.insectId));
  const heardRumor = state.heardRumorDays.includes(state.day);
  const entry: ObservationJournalEntry = {
    day: state.day,
    natureId: plan.natureId,
    themeId: plan.themeId,
    themeCompleted: progress.completed,
    rumorNpcId: heardRumor ? plan.rumorNpcId : undefined,
    rumorId: heardRumor ? plan.rumorId : undefined,
    inspectedTreeIds: [...progress.inspectedTreeIds],
    examinedPointIds: [...progress.examinedPointIds],
    visitedFieldIds: [...progress.visitedFieldIds],
    talkedNpcIds: [...progress.talkedNpcIds],
    ambientInsectIds: [...progress.ambientInsectIds],
    capturedSpecimenIds,
    largestSpecimenId: largest?.id,
    firstCatchInsectIds,
    stampId: progress.completed ? `stamp:${plan.themeId}` : undefined,
    diaryLines: buildDiaryLines(state, progress, capturedSpecimenIds),
  };
  return {
    ...state,
    observationJournalByDay: { ...state.observationJournalByDay, [key]: entry },
  };
};

export const startDailyObservation = (state: GameState, day: number): GameState => {
  const plan = generateDailyPlan({
    rngVersion: state.rngVersion,
    worldSeed: state.worldSeed,
    day,
    secretRouteUnlocked: state.flags.secretRouteUnlocked,
    timeMinutes: 360,
  }, state.dailyPlansByDay);
  return {
    ...state,
    dailyPlansByDay: { ...state.dailyPlansByDay, [String(day)]: plan },
    observationProgressByDay: {
      ...state.observationProgressByDay,
      [String(day)]: createObservationProgress(day, ["grandma-house"]),
    },
  };
};

export const createInitialDailyRecords = (
  rngVersion: number,
  worldSeed: string,
): Pick<GameState,
  "dailyPlansByDay" |
  "observationProgressByDay" |
  "observationJournalByDay" |
  "heardRumorDays" |
  "morningBriefSeenDays"
> => {
  const plan = generateDailyPlan({
    rngVersion,
    worldSeed,
    day: 1,
    secretRouteUnlocked: false,
    timeMinutes: 360,
  });
  return {
    dailyPlansByDay: { "1": plan },
    observationProgressByDay: { "1": createObservationProgress(1, ["grandma-house"]) },
    observationJournalByDay: {},
    heardRumorDays: [],
    morningBriefSeenDays: [],
  };
};

export const migrateDailyRecords = (
  state: Omit<GameState,
    "schemaVersion" |
    "contentVersion" |
    "dailyPlansByDay" |
    "observationProgressByDay" |
    "observationJournalByDay" |
    "heardRumorDays" |
    "morningBriefSeenDays"
  >,
): Pick<GameState,
  "dailyPlansByDay" |
  "observationProgressByDay" |
  "observationJournalByDay" |
  "heardRumorDays" |
  "morningBriefSeenDays"
> => {
  const plan = generateDailyPlan({
    rngVersion: state.rngVersion,
    worldSeed: state.worldSeed,
    day: state.day,
    secretRouteUnlocked: state.flags.secretRouteUnlocked,
    timeMinutes: state.timeMinutes,
  }, {}, { migrationFallback: true });
  return {
    dailyPlansByDay: { [String(state.day)]: plan },
    observationProgressByDay: {
      [String(state.day)]: createObservationProgress(state.day, [state.field.fieldId]),
    },
    observationJournalByDay: {},
    heardRumorDays: [],
    morningBriefSeenDays: state.timeMinutes === 360 && state.phase === "day" ? [] : [state.day],
  };
};

export const currentThemeLabel = (state: GameState): string => {
  const plan = getCurrentDailyPlan(state);
  return plan ? observationThemeById[plan.themeId].shortLabel : "自由に観察";
};
