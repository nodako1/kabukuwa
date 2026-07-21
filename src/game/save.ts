import { z } from "zod";
import { fieldById, getSpawnPoint } from "../data/fields";
import { initialTrapStates, legacySpotToTreeId, treeById } from "../data/trees";
import type {
  CaptureSource,
  FieldId,
  GameState,
  LocationId,
  Outcome,
  Specimen,
  TreeInspectionSession,
} from "../types/game";
import { getTimePeriod } from "./clock";
import { getFieldCollisionRects, isPositionWalkable } from "./field";
import { commitInspectionSession, generateInspectionSession } from "./inspection";
import { isFieldExitAvailable } from "./rules";
import { finalizeObservationJournal, migrateDailyRecords } from "./daily";
import { normalizeFavoriteSpecimenIds } from "./collection";

export const SAVE_KEY = "kabukuwa.save.current";
export const BACKUP_KEY = "kabukuwa.save.backup";
export const VERSION5_MIGRATION_BACKUP_KEY = "kabukuwa.save.pre-v6";
export const MIGRATION_BACKUP_KEY = "kabukuwa.save.pre-v5";
export const VERSION4_MIGRATION_BACKUP_KEY = "kabukuwa.save.pre-v4";
export const LEGACY_MIGRATION_BACKUP_KEY = "kabukuwa.save.pre-v3";

let pendingSaveRepairNotice: string | null = null;
const knownValidRawByStorage = new WeakMap<StorageLike, string>();

export const consumeSaveRepairNotice = (): string | null => {
  const notice = pendingSaveRepairNotice;
  pendingSaveRepairNotice = null;
  return notice;
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const locationIds = [
  "grandma-house",
  "backyard",
  "shrine",
  "mixed-forest",
  "oak-forest",
  "bamboo-grove",
  "school",
  "secret-forest",
] as const;
const fieldIds = [...locationIds, "paddy-road", "forest-road", "secret-path"] as const;
const npcIds = ["grandma", "shrine-keeper", "professor", "rival", "candy-shopkeeper"] as const;
const insectIds = ["japanese-rhino", "saw-stag", "miyama-stag", "giant-stag", "atlas-beetle"] as const;
const periodIds = ["morning", "day", "evening", "night"] as const;
const ambientIds = ["green-bottle", "black-bottle", "butterfly", "moth", "ant", "gnat", "pillbug"] as const;
const dailyNatureIds = [
  "lively-sap",
  "quiet-roots",
  "forest-evening",
  "sweet-breeze",
  "moths-at-light",
  "still-summer",
] as const;
const version4ObservationThemeIds = [
  "inspect-three-trees",
  "look-high-and-low",
  "trust-your-eyes",
  "visit-two-woods",
  "listen-to-someone",
  "check-a-trap",
  "complete-one-tree",
  "walk-the-loop",
] as const;
const observationThemeIds = [
  ...version4ObservationThemeIds,
  "set-player-trap",
  "check-player-trap",
] as const;
const captureSourceIds = ["tree", "fixed-banana", "fixed-light", "player-banana"] as const;

const specimenSchema = z.object({
  id: z.string(),
  insectId: z.enum(insectIds),
  sizeMm: z.number(),
  day: z.number().int().positive(),
  caughtAtMinutes: z.number().int(),
  locationId: z.enum(locationIds),
  spotId: z.string(),
  treeId: z.string().optional(),
  inspectionPointId: z.string().optional(),
  rankingEligible: z.boolean(),
});

const currentSpecimenSchema = specimenSchema.extend({
  captureSource: z.enum(captureSourceIds),
});

const outcomeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("empty"), spotId: z.string(), text: z.string() }),
  z.object({
    type: z.literal("caught"),
    specimen: specimenSchema,
    isPersonalBest: z.boolean(),
    isFirstCatch: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("dialogue"),
    npcId: z.enum(npcIds),
    text: z.string(),
    unlockedSecretRoute: z.boolean(),
  }),
  z.object({ type: z.literal("notice"), title: z.string(), text: z.string() }),
]);

const currentOutcomeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("empty"), spotId: z.string(), text: z.string() }),
  z.object({
    type: z.literal("caught"),
    specimen: currentSpecimenSchema,
    isPersonalBest: z.boolean(),
    isFirstCatch: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("dialogue"),
    npcId: z.enum(npcIds),
    text: z.string(),
    unlockedSecretRoute: z.boolean(),
  }),
  z.object({ type: z.literal("notice"), title: z.string(), text: z.string() }),
]);

const explorationSchema = z.object({
  locationId: z.enum(locationIds),
  visitIndex: z.number().int().positive(),
  period: z.enum(periodIds),
  focusedSpotId: z.string().optional(),
  searchedSpotIds: z.array(z.string()),
});

const commonStateShape = {
  rngVersion: z.literal(1),
  worldSeed: z.string(),
  revision: z.number().int().nonnegative(),
  day: z.number().int().positive(),
  timeMinutes: z.number().int().min(360).max(1200),
  phase: z.enum(["day", "pickup", "evening", "day-ended"]),
  locationId: z.enum(locationIds),
  visitCounters: z.partialRecord(z.enum(locationIds), z.number().int().nonnegative()),
  exploration: explorationSchema.optional(),
  specimens: z.array(specimenSchema),
  npcTalkCounts: z.partialRecord(z.enum(npcIds), z.number().int().nonnegative()),
  metNpcIds: z.array(z.enum(npcIds)),
  buffs: z.object({
    appearanceBoostUntil: z.number().int().nonnegative(),
    nextBoostExtensionMinutes: z.number().int().nonnegative(),
  }),
  pendingOutcome: outcomeSchema.optional(),
};

const legacyFlagsSchema = z.object({
  secretRouteUnlocked: z.boolean(),
  pickupCompletedDay: z.number().int().nonnegative(),
  extraHintDay: z.number().int().nonnegative(),
});

const currentFlagsSchema = legacyFlagsSchema.extend({ fieldTutorialSeen: z.boolean() });
const version5FlagsSchema = currentFlagsSchema.extend({ playerTrapTutorialSeen: z.boolean() });

const playerFieldSchema = z.object({
  fieldId: z.enum(fieldIds),
  x: z.number().finite(),
  y: z.number().finite(),
  facing: z.enum(["up", "down", "left", "right"]),
  lastSafeX: z.number().finite(),
  lastSafeY: z.number().finite(),
  discoveredFieldIds: z.array(z.enum(fieldIds)),
  lastTransitionToken: z.string().optional(),
});

const legacyGameStateSchema = z.object({
  schemaVersion: z.literal(1),
  contentVersion: z.literal(1),
  ...commonStateShape,
  flags: legacyFlagsSchema,
});

export const version2GameStateSchema = z.object({
  schemaVersion: z.literal(2),
  contentVersion: z.literal(2),
  ...commonStateShape,
  field: playerFieldSchema.omit({ lastTransitionToken: true }),
  flags: currentFlagsSchema,
});

const ambientPlacementSchema = z.object({
  id: z.string(),
  insectId: z.enum(ambientIds),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  motion: z.enum(["still", "crawl", "flutter"]),
});

const inspectionSessionSchema = z.object({
  id: z.string(),
  treeId: z.string(),
  committed: z.boolean(),
  day: z.number().int().positive(),
  visitIndex: z.number().int().positive(),
  period: z.enum(periodIds),
  startedAtMinutes: z.number().int().min(360).max(1200),
  resolvedAtMinutes: z.number().int().min(360).max(1200),
  currentPointId: z.string(),
  examinedPointIds: z.array(z.string()),
  catchableEncounter: z.object({
    id: z.string(),
    pointId: z.string(),
    insectId: z.enum(insectIds),
    sizeMm: z.number(),
    rankingEligible: z.boolean(),
    caught: z.boolean(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }).optional(),
  ambientByPointId: z.record(z.string(), z.array(ambientPlacementSchema)),
  clueVisible: z.boolean(),
  returnPosition: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    facing: z.enum(["up", "down", "left", "right"]),
  }),
});

const dailyPlanSchema = z.object({
  day: z.number().int().positive(),
  natureId: z.enum(dailyNatureIds),
  themeId: z.enum(version4ObservationThemeIds),
  rumorNpcId: z.enum(npcIds),
  rumorId: z.string(),
});

const currentDailyPlanSchema = dailyPlanSchema.extend({
  themeId: z.enum(observationThemeIds),
});

const observationProgressSchema = z.object({
  day: z.number().int().positive(),
  inspectedTreeIds: z.array(z.string()),
  examinedPointIds: z.array(z.string()),
  visitedFieldIds: z.array(z.enum(fieldIds)),
  talkedNpcIds: z.array(z.enum(npcIds)),
  ambientInsectIds: z.array(z.enum(ambientIds)),
  capturedSpecimenIds: z.array(z.string()),
  inspectedWithoutClueTreeIds: z.array(z.string()),
  checkedTrapTreeIds: z.array(z.string()),
  completed: z.boolean(),
  completedAtMinutes: z.number().int().min(360).max(1200).optional(),
});

const observationJournalSchema = z.object({
  day: z.number().int().positive(),
  natureId: z.enum(dailyNatureIds),
  themeId: z.enum(observationThemeIds),
  themeCompleted: z.boolean(),
  rumorNpcId: z.enum(npcIds).optional(),
  rumorId: z.string().optional(),
  inspectedTreeIds: z.array(z.string()),
  examinedPointIds: z.array(z.string()),
  visitedFieldIds: z.array(z.enum(fieldIds)),
  talkedNpcIds: z.array(z.enum(npcIds)),
  ambientInsectIds: z.array(z.enum(ambientIds)),
  capturedSpecimenIds: z.array(z.string()),
  largestSpecimenId: z.string().optional(),
  firstCatchInsectIds: z.array(z.enum(insectIds)),
  stampId: z.string().optional(),
  diaryLines: z.array(z.string()).min(1),
});

const currentObservationProgressSchema = observationProgressSchema.extend({
  placedPlayerTrapIds: z.array(z.string()),
  checkedPlayerTrapIds: z.array(z.string()),
});

const currentObservationJournalSchema = observationJournalSchema.extend({
  placedPlayerTrapIds: z.array(z.string()),
  checkedPlayerTrapIds: z.array(z.string()),
});

const semanticRefinement = (state: GameState, context: z.RefinementCtx) => {
  const field = fieldById[state.field.fieldId];
  const isHome = state.field.fieldId === "grandma-house" || state.field.fieldId === "backyard";
  const invalid = (message: string) => context.addIssue({ code: "custom", message });
  const activeSession = state.activeInspectionSessionId
    ? state.inspectionSessions[state.activeInspectionSessionId]
    : undefined;
  const activePlayerTrapInspectionId = state.activePlayerTrapInspectionId;
  const activeInspectionCount = Number(Boolean(activeSession)) + Number(Boolean(activePlayerTrapInspectionId));

  if (field.locationId && field.locationId !== state.locationId) invalid("location must match the current collection field");
  if (state.activeInspectionSessionId && (!activeSession || !activeSession.committed)) {
    invalid("active inspection must reference a committed session");
  }
  if (activeSession) {
    const activeTree = treeById[activeSession.treeId];
    if (!activeTree || activeTree.fieldId !== state.field.fieldId || activeSession.day !== state.day) {
      invalid("active inspection must belong to the current field and day");
    }
  }
  if (state.pendingBoundaryEvent && activeInspectionCount !== 1) {
    invalid("a deferred boundary requires exactly one active inspection");
  }
  if (
    state.phase === "day" &&
    !(state.timeMinutes < 1080 || (
      state.timeMinutes === 1080 &&
      state.pendingBoundaryEvent === "pickup" &&
      activeInspectionCount === 1
    ))
  ) invalid("day phase must end before 18:00 unless inspection pickup is deferred");
  if (state.phase === "pickup" && (state.timeMinutes !== 1080 || isHome || activeInspectionCount > 0)) {
    invalid("pickup phase must be at 18:00 in a remote field");
  }
  if (
    state.phase === "evening" &&
    !(
      (state.timeMinutes >= 1080 && state.timeMinutes < 1200 && isHome) ||
      (state.timeMinutes === 1200 && isHome && state.pendingBoundaryEvent === "day-ended" && activeInspectionCount === 1)
    )
  ) invalid("evening phase must be at home, with only an active inspection allowed at 20:00");
  if (state.phase === "day-ended" && (state.timeMinutes !== 1200 || !isHome || activeInspectionCount > 0)) {
    invalid("day-ended phase must be at 20:00 at home");
  }
  if (state.exploration) {
    if (state.exploration.locationId !== state.locationId || field.locationId !== state.locationId) {
      invalid("exploration location must match the current collection field");
    }
    if (!state.pendingBoundaryEvent && state.exploration.period !== getTimePeriod(state.timeMinutes)) {
      invalid("exploration period must match current time");
    }
  }
  for (const [id, session] of Object.entries(state.inspectionSessions)) {
    const tree = treeById[session.treeId];
    if (id !== session.id || !tree) {
      invalid("inspection session identity is invalid");
      continue;
    }
    const pointIds = new Set(tree.inspectionPoints.map((point) => point.id));
    if (!pointIds.has(session.currentPointId) || session.examinedPointIds.some((pointId) => !pointIds.has(pointId))) {
      invalid("inspection session references an unknown point");
    }
    if (session.catchableEncounter && !pointIds.has(session.catchableEncounter.pointId)) {
      invalid("inspection encounter references an unknown point");
    }
  }
};

export const version3GameStateSchema = z.object({
  schemaVersion: z.literal(3),
  contentVersion: z.literal(3),
  ...commonStateShape,
  field: playerFieldSchema,
  flags: currentFlagsSchema,
  inspectionSessions: z.record(z.string(), inspectionSessionSchema),
  activeInspectionSessionId: z.string().optional(),
  discoveredClueSessionIds: z.array(z.string()),
  caughtEncounterIds: z.array(z.string()),
  trapStates: z.record(z.string(), z.object({
    kind: z.enum(["banana", "light"]),
    installed: z.boolean(),
  })),
  pendingBoundaryEvent: z.enum(["pickup", "day-ended"]).optional(),
}).superRefine((state, context) => semanticRefinement(state as unknown as GameState, context));

const dailySemanticRefinement = (state: GameState, context: z.RefinementCtx) => {
  const invalid = (message: string) => context.addIssue({ code: "custom", message });
  const validateDayRecord = (
    records: Record<string, { day: number }>,
    label: string,
  ) => {
    for (const [key, value] of Object.entries(records)) {
      if (String(value.day) !== key || value.day > state.day) invalid(`${label} day key is invalid`);
    }
  };
  validateDayRecord(state.dailyPlansByDay, "daily plan");
  validateDayRecord(state.observationProgressByDay, "observation progress");
  validateDayRecord(state.observationJournalByDay, "observation journal");
  if (!state.dailyPlansByDay[String(state.day)]) invalid("current daily plan is required");
  if (!state.observationProgressByDay[String(state.day)]) invalid("current observation progress is required");
  if (state.phase !== "day-ended" && state.observationJournalByDay[String(state.day)]) {
    invalid("current observation journal cannot be finalized before day end");
  }
  if (state.phase === "day-ended" && !state.observationJournalByDay[String(state.day)]) {
    invalid("day-ended state requires a finalized observation journal");
  }
  for (const plan of Object.values(state.dailyPlansByDay)) {
    if (plan.rumorId !== `${plan.rumorNpcId}:${plan.natureId}`) {
      invalid("daily rumor identity is inconsistent");
    }
  }
  const specimenIds = new Set(state.specimens.map((specimen) => specimen.id));
  for (const progress of Object.values(state.observationProgressByDay)) {
    const arrays = [
      progress.inspectedTreeIds,
      progress.examinedPointIds,
      progress.visitedFieldIds,
      progress.talkedNpcIds,
      progress.ambientInsectIds,
      progress.capturedSpecimenIds,
      progress.inspectedWithoutClueTreeIds,
      progress.checkedTrapTreeIds,
    ];
    if (arrays.some((items) => new Set(items).size !== items.length)) {
      invalid("observation progress contains duplicate ids");
    }
    if (progress.capturedSpecimenIds.some((id) => !specimenIds.has(id))) {
      invalid("observation progress references an unknown specimen");
    }
  }
  for (const journal of Object.values(state.observationJournalByDay)) {
    const plan = state.dailyPlansByDay[String(journal.day)];
    if (journal.capturedSpecimenIds.some((id) => !specimenIds.has(id))) {
      invalid("observation journal references an unknown specimen");
    }
    if (journal.largestSpecimenId && !journal.capturedSpecimenIds.includes(journal.largestSpecimenId)) {
      invalid("observation journal largest specimen is inconsistent");
    }
    if (Boolean(journal.rumorNpcId) !== Boolean(journal.rumorId)) {
      invalid("observation journal rumor fields must be paired");
    }
    if (
      journal.rumorNpcId &&
      (!plan || journal.rumorNpcId !== plan.rumorNpcId || journal.rumorId !== plan.rumorId)
    ) {
      invalid("observation journal rumor identity is inconsistent");
    }
  }
  for (const [days, label] of [
    [state.heardRumorDays, "heard rumor days"],
    [state.morningBriefSeenDays, "morning brief days"],
  ] as const) {
    if (new Set(days).size !== days.length || days.some((day) => day > state.day)) {
      invalid(`${label} contains duplicate or future days`);
    }
  }
};

export const version4GameStateSchema = z.object({
  schemaVersion: z.literal(4),
  contentVersion: z.literal(4),
  ...commonStateShape,
  field: playerFieldSchema,
  flags: currentFlagsSchema,
  inspectionSessions: z.record(z.string(), inspectionSessionSchema),
  activeInspectionSessionId: z.string().optional(),
  discoveredClueSessionIds: z.array(z.string()),
  caughtEncounterIds: z.array(z.string()),
  trapStates: z.record(z.string(), z.object({
    kind: z.enum(["banana", "light"]),
    installed: z.boolean(),
  })),
  dailyPlansByDay: z.record(z.string(), dailyPlanSchema),
  observationProgressByDay: z.record(z.string(), observationProgressSchema),
  observationJournalByDay: z.record(z.string(), observationJournalSchema),
  heardRumorDays: z.array(z.number().int().positive()),
  morningBriefSeenDays: z.array(z.number().int().positive()),
  pendingBoundaryEvent: z.enum(["pickup", "day-ended"]).optional(),
}).superRefine((state, context) => {
  semanticRefinement(state as unknown as GameState, context);
  dailySemanticRefinement(state as unknown as GameState, context);
});

const playerTrapEncounterSchema = z.object({
  id: z.string(),
  insectId: z.enum(insectIds),
  sizeMm: z.number(),
  rankingEligible: z.literal(true),
  caught: z.boolean(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const playerTrapOutcomePlanSchema = z.object({
  planVersion: z.literal(1),
  resolvedDay: z.number().int().positive(),
  resolvedNatureId: z.enum(dailyNatureIds),
  presenceTier: z.enum(["none", "base", "daily-nature", "player-trap"]),
  encounter: playerTrapEncounterSchema.optional(),
  ambientPlacements: z.array(ambientPlacementSchema).min(2).max(6),
});

const playerTrapStateSchema = z.object({
  id: z.string(),
  kind: z.literal("banana"),
  sequence: z.number().int().positive(),
  treeId: z.string(),
  installedDay: z.number().int().positive(),
  installedAtMinutes: z.number().int().min(360).max(1200),
  readyDay: z.number().int().positive(),
  phase: z.enum(["waiting", "ready", "opened"]),
  openedAtMinutes: z.number().int().min(360).max(1200).optional(),
  outcomePlan: playerTrapOutcomePlanSchema.optional(),
});

const playerTrapKitSchema = z.object({
  unlocked: z.boolean(),
  nextSequence: z.number().int().positive(),
  activeTrap: playerTrapStateSchema.optional(),
});

export const version5GameStateStructureSchema = z.object({
  schemaVersion: z.literal(5),
  contentVersion: z.literal(5),
  ...commonStateShape,
  specimens: z.array(currentSpecimenSchema),
  pendingOutcome: currentOutcomeSchema.optional(),
  field: playerFieldSchema,
  flags: version5FlagsSchema,
  inspectionSessions: z.record(z.string(), inspectionSessionSchema),
  activeInspectionSessionId: z.string().optional(),
  discoveredClueSessionIds: z.array(z.string()),
  caughtEncounterIds: z.array(z.string()),
  trapStates: z.record(z.string(), z.object({
    kind: z.enum(["banana", "light"]),
    installed: z.boolean(),
  })),
  playerTrapKit: playerTrapKitSchema,
  activePlayerTrapInspectionId: z.string().optional(),
  dailyPlansByDay: z.record(z.string(), currentDailyPlanSchema),
  observationProgressByDay: z.record(z.string(), currentObservationProgressSchema),
  observationJournalByDay: z.record(z.string(), currentObservationJournalSchema),
  heardRumorDays: z.array(z.number().int().positive()),
  morningBriefSeenDays: z.array(z.number().int().positive()),
  pendingBoundaryEvent: z.enum(["pickup", "day-ended"]).optional(),
});

const playerTrapSemanticRefinement = (state: GameState, context: z.RefinementCtx) => {
  const invalid = (message: string) => context.addIssue({ code: "custom", message });
  const trap = state.playerTrapKit.activeTrap;
  if (!state.playerTrapKit.unlocked && trap) invalid("a locked player trap kit cannot have an active trap");
  if (state.activeInspectionSessionId && state.activePlayerTrapInspectionId) {
    invalid("tree and player trap inspections are mutually exclusive");
  }
  if (state.activePlayerTrapInspectionId && state.activePlayerTrapInspectionId !== trap?.id) {
    invalid("active player trap inspection must reference the active trap");
  }
  if (state.activePlayerTrapInspectionId && trap?.phase !== "opened") {
    invalid("active player trap inspection must reference an opened trap");
  }
  for (const records of [state.observationProgressByDay, state.observationJournalByDay]) {
    for (const record of Object.values(records)) {
      if (
        new Set(record.placedPlayerTrapIds).size !== record.placedPlayerTrapIds.length ||
        new Set(record.checkedPlayerTrapIds).size !== record.checkedPlayerTrapIds.length
      ) invalid("player trap observation ids must be unique");
    }
  }
  if (!trap) return;

  const tree = treeById[trap.treeId];
  if (!tree || tree.playerTrapSlot !== "banana") invalid("player trap references an unavailable tree");
  if (trap.readyDay !== trap.installedDay + 1) invalid("player trap ready day is inconsistent");
  if (state.playerTrapKit.nextSequence <= trap.sequence) invalid("player trap sequence is inconsistent");
  if (trap.phase === "waiting" && (trap.outcomePlan || trap.openedAtMinutes !== undefined)) {
    invalid("waiting player trap cannot have an outcome or opened time");
  }
  if (trap.phase === "ready" && (!trap.outcomePlan || trap.openedAtMinutes !== undefined)) {
    invalid("ready player trap requires only an outcome plan");
  }
  if (trap.phase === "opened" && (!trap.outcomePlan || trap.openedAtMinutes === undefined)) {
    invalid("opened player trap requires an outcome and opened time");
  }
  if (trap.outcomePlan && trap.outcomePlan.resolvedDay !== trap.readyDay) {
    invalid("player trap outcome day is inconsistent");
  }
  if (state.activePlayerTrapInspectionId && tree?.fieldId !== state.field.fieldId) {
    invalid("active player trap inspection must be in the current field");
  }
  const encounter = trap.outcomePlan?.encounter;
  if (encounter) {
    const specimenCount = state.specimens.filter((specimen) => specimen.id === encounter.id).length;
    if ((encounter.caught && specimenCount !== 1) || (!encounter.caught && specimenCount !== 0)) {
      invalid("player trap encounter capture state is inconsistent");
    }
  }

};

export const version5GameStateSchema = version5GameStateStructureSchema.superRefine((state, context) => {
  semanticRefinement(state as unknown as GameState, context);
  dailySemanticRefinement(state as unknown as GameState, context);
  playerTrapSemanticRefinement(state as unknown as GameState, context);
});

export const gameStateStructureSchema = version5GameStateStructureSchema.extend({
  schemaVersion: z.literal(6),
  contentVersion: z.literal(6),
  favoriteSpecimenIds: z.array(z.string()),
});

const favoriteSemanticRefinement = (state: GameState, context: z.RefinementCtx) => {
  const invalid = (message: string) => context.addIssue({ code: "custom", message });
  const specimenIds = state.specimens.map((specimen) => specimen.id);
  const uniqueSpecimenIds = new Set(specimenIds);
  if (uniqueSpecimenIds.size !== specimenIds.length) {
    invalid("specimen ids must be unique");
  }
  if (new Set(state.favoriteSpecimenIds).size !== state.favoriteSpecimenIds.length) {
    invalid("favorite specimen ids must be unique");
  }
  if (state.favoriteSpecimenIds.some((id) => !uniqueSpecimenIds.has(id))) {
    invalid("favorite specimen ids must reference existing specimens");
  }
};

export const gameStateSchema = gameStateStructureSchema.superRefine((state, context) => {
  semanticRefinement(state as GameState, context);
  dailySemanticRefinement(state as GameState, context);
  playerTrapSemanticRefinement(state as GameState, context);
  favoriteSemanticRefinement(state as GameState, context);
});

type LegacyGameState = z.infer<typeof legacyGameStateSchema>;
type Version2GameState = z.infer<typeof version2GameStateSchema>;
type Version3GameState = z.infer<typeof version3GameStateSchema>;
export type Version4GameState = z.infer<typeof version4GameStateSchema>;
export type Version5GameState = z.infer<typeof version5GameStateStructureSchema>;

const nearestSafePoint = (
  fieldId: FieldId,
  candidates: Array<{ x: number; y: number }>,
  closedExitIds: readonly string[] = [],
): { x: number; y: number } => {
  const field = fieldById[fieldId];
  const obstacles = getFieldCollisionRects(field, closedExitIds);
  for (const candidate of candidates) {
    if (isPositionWalkable(candidate, field, obstacles)) return candidate;
    for (let radius = 24; radius <= 360; radius += 24) {
      const offsets: Array<{ x: number; y: number }> = [];
      for (let offset = -radius; offset <= radius; offset += 24) {
        offsets.push(
          { x: candidate.x + offset, y: candidate.y - radius },
          { x: candidate.x + offset, y: candidate.y + radius },
          { x: candidate.x - radius, y: candidate.y + offset },
          { x: candidate.x + radius, y: candidate.y + offset },
        );
      }
      const safe = offsets
        .sort((left, right) => Math.hypot(left.x - candidate.x, left.y - candidate.y) - Math.hypot(right.x - candidate.x, right.y - candidate.y))
        .find((point) => isPositionWalkable(point, field, obstacles));
      if (safe) return safe;
    }
  }
  return getSpawnPoint(fieldId);
};

const migratedLegacyPosition = (legacy: LegacyGameState): { x: number; y: number } => {
  const field = fieldById[legacy.locationId as LocationId];
  const focused = legacy.exploration?.focusedSpotId;
  const hotspot = focused ? field.hotspots.find((candidate) => candidate.spotId === focused) : undefined;
  const candidate = hotspot ? { x: hotspot.x, y: hotspot.y + 88 } : getSpawnPoint(field.id);
  return nearestSafePoint(field.id, [candidate]);
};

export const migrateLegacyGameState = (legacy: LegacyGameState): Version2GameState => {
  const fieldId = legacy.locationId as FieldId;
  const position = migratedLegacyPosition(legacy);
  const discoveredFieldIds = Array.from(new Set<FieldId>([
    "grandma-house",
    ...Object.entries(legacy.visitCounters)
      .filter(([, count]) => (count ?? 0) > 0)
      .map(([locationId]) => locationId as LocationId),
    fieldId,
  ]));
  return {
    ...legacy,
    schemaVersion: 2,
    contentVersion: 2,
    field: {
      fieldId,
      x: position.x,
      y: position.y,
      facing: "up",
      lastSafeX: position.x,
      lastSafeY: position.y,
      discoveredFieldIds,
    },
    flags: { ...legacy.flags, fieldTutorialSeen: false },
  };
};

const repairPlayerPosition = <T,>(state: T): T => {
  const gameState = state as unknown as GameState;
  const field = fieldById[gameState.field.fieldId];
  const closedExitIds = field.exits
    .filter((exit) => !isFieldExitAvailable(gameState, exit).available)
    .map((exit) => exit.id);
  const repaired = nearestSafePoint(gameState.field.fieldId, [
    { x: gameState.field.x, y: gameState.field.y },
    { x: gameState.field.lastSafeX, y: gameState.field.lastSafeY },
  ], closedExitIds);
  const discoveredFieldIds = gameState.field.discoveredFieldIds.includes(gameState.field.fieldId)
    ? gameState.field.discoveredFieldIds
    : [...gameState.field.discoveredFieldIds, gameState.field.fieldId];
  if (
    repaired.x === gameState.field.x &&
    repaired.y === gameState.field.y &&
    repaired.x === gameState.field.lastSafeX &&
    repaired.y === gameState.field.lastSafeY &&
    discoveredFieldIds === gameState.field.discoveredFieldIds
  ) return state;
  return {
    ...gameState,
    field: {
      ...gameState.field,
      x: repaired.x,
      y: repaired.y,
      lastSafeX: repaired.x,
      lastSafeY: repaired.y,
      discoveredFieldIds,
    },
  } as T;
};

const captureSourceForLegacySpecimen = (
  specimen: { treeId?: string; spotId: string },
): CaptureSource => {
  const treeId = specimen.treeId ?? legacySpotToTreeId[specimen.spotId] ?? specimen.spotId;
  const trapKind = treeById[treeId]?.trapKind;
  if (trapKind === "banana") return "fixed-banana";
  if (trapKind === "light") return "fixed-light";
  return "tree";
};

const migrateSpecimen = <T extends { treeId?: string; spotId: string }>(specimen: T): T & Specimen => ({
  ...specimen,
  captureSource: captureSourceForLegacySpecimen(specimen),
}) as T & Specimen;

const migrateOutcome = (
  outcome: Version4GameState["pendingOutcome"],
): Outcome | undefined => outcome?.type === "caught"
  ? { ...outcome, specimen: migrateSpecimen(outcome.specimen) }
  : outcome as Outcome | undefined;

const migrateVersion4ToVersion5 = (legacy: Version4GameState): Version5GameState => repairPlayerPosition({
  ...legacy,
  schemaVersion: 5,
  contentVersion: 5,
  specimens: legacy.specimens.map(migrateSpecimen),
  pendingOutcome: migrateOutcome(legacy.pendingOutcome),
  flags: {
    ...legacy.flags,
    playerTrapTutorialSeen: false,
  },
  playerTrapKit: {
    unlocked: legacy.day >= 2,
    nextSequence: 1,
  },
  activePlayerTrapInspectionId: undefined,
  observationProgressByDay: Object.fromEntries(
    Object.entries(legacy.observationProgressByDay).map(([day, progress]) => [day, {
      ...progress,
      placedPlayerTrapIds: [],
      checkedPlayerTrapIds: [],
    }]),
  ),
  observationJournalByDay: Object.fromEntries(
    Object.entries(legacy.observationJournalByDay).map(([day, journal]) => [day, {
      ...journal,
      placedPlayerTrapIds: [],
      checkedPlayerTrapIds: [],
    }]),
  ),
} as unknown as Version5GameState);

export const migrateVersion5GameState = (legacy: Version5GameState): GameState => repairPlayerPosition({
  ...legacy,
  schemaVersion: 6,
  contentVersion: 6,
  favoriteSpecimenIds: [],
} as GameState);

export const migrateVersion4GameState = (legacy: Version4GameState): GameState =>
  migrateVersion5GameState(migrateVersion4ToVersion5(legacy));

export const migrateVersion2GameState = (legacy: Version2GameState): GameState => {
  const version3Like = {
    ...legacy,
    schemaVersion: 3,
    contentVersion: 3,
    field: { ...legacy.field },
    specimens: legacy.specimens.map((specimen) => {
      const treeId = legacySpotToTreeId[specimen.spotId];
      const tree = treeId ? treeById[treeId] : undefined;
      return {
        ...specimen,
        treeId,
        inspectionPointId: tree?.primaryPointId,
      };
    }),
    inspectionSessions: {},
    activeInspectionSessionId: undefined,
    discoveredClueSessionIds: [],
    caughtEncounterIds: [],
    trapStates: initialTrapStates(),
    pendingBoundaryEvent: undefined,
  };
  const version4Like = repairPlayerPosition({
    ...version3Like,
    schemaVersion: 4,
    contentVersion: 4,
    ...migrateDailyRecords(version3Like as unknown as Parameters<typeof migrateDailyRecords>[0]),
  } as unknown as Version4GameState);
  const base = migrateVersion4GameState(version4Like);

  if (!base.exploration) return base.phase === "day-ended" ? finalizeObservationJournal(base) : base;
  const uniqueSpotIds = [...new Set(base.exploration.searchedSpotIds)];
  const sessions: Record<string, TreeInspectionSession> = {};
  for (const spotId of uniqueSpotIds) {
    const treeId = legacySpotToTreeId[spotId];
    const tree = treeId ? treeById[treeId] : undefined;
    if (!tree || tree.fieldId !== base.field.fieldId) continue;
    const preview = generateInspectionSession(base, tree);
    if (!preview) continue;
    const committed = commitInspectionSession(preview, base);
    sessions[committed.id] = {
      ...committed,
      startedAtMinutes: Math.max(360, base.timeMinutes - 15),
      resolvedAtMinutes: base.timeMinutes,
      examinedPointIds: [tree.primaryPointId],
      catchableEncounter: undefined,
    };
  }
  const migrated: GameState = {
    ...base,
    exploration: { ...base.exploration, searchedSpotIds: uniqueSpotIds },
    inspectionSessions: sessions,
  };
  return migrated.phase === "day-ended" ? finalizeObservationJournal(migrated) : migrated;
};

export const migrateVersion3GameState = (legacy: Version3GameState): GameState => {
  const version4Like = repairPlayerPosition({
    ...legacy,
    schemaVersion: 4,
    contentVersion: 4,
    ...migrateDailyRecords(legacy as unknown as Parameters<typeof migrateDailyRecords>[0]),
  } as unknown as Version4GameState);
  const migrated = migrateVersion4GameState(version4Like);
  return migrated.phase === "day-ended" ? finalizeObservationJournal(migrated) : migrated;
};

const saveEnvelopeStructureSchema = z.object({
  schemaVersion: z.literal(6),
  savedAt: z.string(),
  state: gameStateStructureSchema,
});
const version5SaveEnvelopeStructureSchema = z.object({
  schemaVersion: z.literal(5),
  savedAt: z.string(),
  state: version5GameStateStructureSchema,
});
const version4SaveEnvelopeSchema = z.object({
  schemaVersion: z.literal(4),
  savedAt: z.string(),
  state: version4GameStateSchema,
});
const version3SaveEnvelopeSchema = z.object({
  schemaVersion: z.literal(3),
  savedAt: z.string(),
  state: version3GameStateSchema,
});
const version2SaveEnvelopeSchema = z.object({
  schemaVersion: z.literal(2),
  savedAt: z.string(),
  state: version2GameStateSchema,
});
const legacySaveEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  savedAt: z.string(),
  state: legacyGameStateSchema,
});

const browserStorage = (): StorageLike | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

interface ParsedState {
  state: GameState;
  migrationBackupKey?: typeof VERSION5_MIGRATION_BACKUP_KEY | typeof MIGRATION_BACKUP_KEY;
}

const repairPlayerTrapContent = (state: GameState): { state: GameState; repaired: boolean } => {
  const trap = state.playerTrapKit.activeTrap;
  if (!trap) return { state, repaired: false };
  const tree = treeById[trap.treeId];
  if (tree?.playerTrapSlot === "banana") return { state, repaired: false };

  let repaired: GameState = {
    ...state,
    activePlayerTrapInspectionId: undefined,
    playerTrapKit: { ...state.playerTrapKit, activeTrap: undefined },
    pendingOutcome: state.pendingOutcome ?? {
      type: "notice",
      title: "仕掛けを手元へ戻しました",
      text: "村の木の変化に合わせて、トラップセットを安全に回収しました。",
    },
  };
  if (repaired.pendingBoundaryEvent === "pickup") {
    repaired = {
      ...repaired,
      phase: "pickup",
      timeMinutes: 1080,
      pendingBoundaryEvent: undefined,
      exploration: repaired.exploration
        ? {
            ...repaired.exploration,
            period: getTimePeriod(1080),
            focusedSpotId: undefined,
            searchedSpotIds: [],
          }
        : undefined,
    };
  } else if (repaired.pendingBoundaryEvent === "day-ended") {
    repaired = finalizeObservationJournal({
      ...repaired,
      phase: "day-ended",
      timeMinutes: 1200,
      pendingBoundaryEvent: undefined,
      exploration: repaired.exploration
        ? {
            ...repaired.exploration,
            period: getTimePeriod(1200),
            focusedSpotId: undefined,
            searchedSpotIds: [],
          }
        : undefined,
    });
  }
  return { state: repaired, repaired: true };
};

const repairFavoriteReferences = (state: GameState): { state: GameState; repaired: boolean } => {
  const normalized = normalizeFavoriteSpecimenIds(state.favoriteSpecimenIds, state.specimens);
  if (!normalized.repaired) return { state, repaired: false };
  return {
    repaired: true,
    state: {
      ...state,
      favoriteSpecimenIds: normalized.ids,
    },
  };
};

const parseSavedState = (raw: string | null): ParsedState | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const current = saveEnvelopeStructureSchema.safeParse(parsed);
    if (current.success) {
      const contentRepair = repairPlayerTrapContent(current.data.state as GameState);
      const favoriteRepair = repairFavoriteReferences(contentRepair.state);
      const repaired = repairPlayerPosition(favoriteRepair.state);
      const checked = gameStateSchema.safeParse(repaired);
      if (checked.success && favoriteRepair.repaired) {
        pendingSaveRepairNotice = "見つからないとっておき参照だけを整え、捕まえた虫の記録はそのまま残しました。";
      }
      return checked.success
        ? { state: checked.data as GameState }
        : null;
    }
    const version5 = version5SaveEnvelopeStructureSchema.safeParse(parsed);
    if (version5.success) {
      const migrated = migrateVersion5GameState(version5.data.state as Version5GameState);
      const contentRepair = repairPlayerTrapContent(migrated);
      const checked = gameStateSchema.safeParse(repairPlayerPosition(contentRepair.state));
      return checked.success
        ? { state: checked.data as GameState, migrationBackupKey: VERSION5_MIGRATION_BACKUP_KEY }
        : null;
    }
    const version4 = version4SaveEnvelopeSchema.safeParse(parsed);
    if (version4.success) {
      const migrated = migrateVersion4GameState(version4.data.state);
      const checked = gameStateSchema.safeParse(migrated);
      return checked.success
        ? { state: checked.data as GameState, migrationBackupKey: MIGRATION_BACKUP_KEY }
        : null;
    }
    const version3 = version3SaveEnvelopeSchema.safeParse(parsed);
    if (version3.success) {
      const migrated = migrateVersion3GameState(version3.data.state);
      const checked = gameStateSchema.safeParse(migrated);
      return checked.success
        ? { state: repairPlayerPosition(checked.data as GameState), migrationBackupKey: MIGRATION_BACKUP_KEY }
        : null;
    }
    const version2 = version2SaveEnvelopeSchema.safeParse(parsed);
    if (version2.success) {
      const migrated = migrateVersion2GameState(version2.data.state);
      const checked = gameStateSchema.safeParse(migrated);
      return checked.success
        ? { state: repairPlayerPosition(checked.data as GameState), migrationBackupKey: MIGRATION_BACKUP_KEY }
        : null;
    }
    const legacy = legacySaveEnvelopeSchema.safeParse(parsed);
    if (!legacy.success) return null;
    const migrated = migrateVersion2GameState(migrateLegacyGameState(legacy.data.state));
    const checked = gameStateSchema.safeParse(migrated);
    return checked.success
      ? { state: repairPlayerPosition(checked.data as GameState), migrationBackupKey: MIGRATION_BACKUP_KEY }
      : null;
  } catch {
    return null;
  }
};

const preserveMigrationBackup = (
  storage: StorageLike,
  key: ParsedState["migrationBackupKey"],
  raw: string | null,
) => {
  if (!key || !raw) return;
  try {
    if (storage.getItem(key) === null) storage.setItem(key, raw);
  } catch {
    // A valid save remains playable even when the optional migration backup cannot be written.
  }
};

export const loadGame = (storage = browserStorage()): GameState | null => {
  if (!storage) return null;
  try {
    const currentRaw = storage.getItem(SAVE_KEY);
    const current = parseSavedState(currentRaw);
    if (current) {
      preserveMigrationBackup(storage, current.migrationBackupKey, currentRaw);
      if (currentRaw) knownValidRawByStorage.set(storage, currentRaw);
      return current.state;
    }
    const backupRaw = storage.getItem(BACKUP_KEY);
    const backup = parseSavedState(backupRaw);
    if (backup) {
      preserveMigrationBackup(storage, backup.migrationBackupKey, backupRaw);
      if (backupRaw) knownValidRawByStorage.set(storage, backupRaw);
    }
    return backup?.state ?? null;
  } catch {
    return null;
  }
};

export const saveGame = (state: GameState, storage = browserStorage()): void => {
  if (!storage) return;
  try {
    const current = storage.getItem(SAVE_KEY);
    if (current && knownValidRawByStorage.get(storage) === current) storage.setItem(BACKUP_KEY, current);
    const nextRaw = JSON.stringify({ schemaVersion: 6, savedAt: new Date().toISOString(), state });
    storage.setItem(SAVE_KEY, nextRaw);
    knownValidRawByStorage.set(storage, nextRaw);
  } catch {
    // Saving is best-effort. Storage restrictions or quota errors must not stop the game.
  }
};

export const deleteSave = (storage = browserStorage()): void => {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_KEY);
    storage.removeItem(BACKUP_KEY);
    storage.removeItem(VERSION5_MIGRATION_BACKUP_KEY);
    storage.removeItem(MIGRATION_BACKUP_KEY);
    storage.removeItem(VERSION4_MIGRATION_BACKUP_KEY);
    storage.removeItem(LEGACY_MIGRATION_BACKUP_KEY);
    knownValidRawByStorage.delete(storage);
  } catch {
    // Ignore browser storage restrictions.
  }
};

export const hasSavedGame = (storage = browserStorage()): boolean => loadGame(storage) !== null;
