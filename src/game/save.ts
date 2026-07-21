import { z } from "zod";
import { fieldById, getSpawnPoint } from "../data/fields";
import { initialTrapStates, legacySpotToTreeId, treeById } from "../data/trees";
import type { FieldId, GameState, LocationId, TreeInspectionSession } from "../types/game";
import { getTimePeriod } from "./clock";
import { getFieldCollisionRects, isPositionWalkable } from "./field";
import { commitInspectionSession, generateInspectionSession } from "./inspection";
import { isFieldExitAvailable } from "./rules";

export const SAVE_KEY = "kabukuwa.save.current";
export const BACKUP_KEY = "kabukuwa.save.backup";
export const MIGRATION_BACKUP_KEY = "kabukuwa.save.pre-v3";

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

const semanticRefinement = (state: GameState, context: z.RefinementCtx) => {
  const field = fieldById[state.field.fieldId];
  const isHome = state.field.fieldId === "grandma-house" || state.field.fieldId === "backyard";
  const invalid = (message: string) => context.addIssue({ code: "custom", message });
  const activeSession = state.activeInspectionSessionId
    ? state.inspectionSessions[state.activeInspectionSessionId]
    : undefined;

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
  if (state.pendingBoundaryEvent && !activeSession) invalid("a deferred boundary requires an active inspection");
  if (
    state.phase === "day" &&
    !(state.timeMinutes < 1080 || (
      state.timeMinutes === 1080 &&
      state.pendingBoundaryEvent === "pickup" &&
      Boolean(activeSession)
    ))
  ) invalid("day phase must end before 18:00 unless inspection pickup is deferred");
  if (state.phase === "pickup" && (state.timeMinutes !== 1080 || isHome || activeSession)) {
    invalid("pickup phase must be at 18:00 in a remote field");
  }
  if (
    state.phase === "evening" &&
    !(
      (state.timeMinutes >= 1080 && state.timeMinutes < 1200 && isHome) ||
      (state.timeMinutes === 1200 && isHome && state.pendingBoundaryEvent === "day-ended" && activeSession)
    )
  ) invalid("evening phase must be at home, with only an active inspection allowed at 20:00");
  if (state.phase === "day-ended" && (state.timeMinutes !== 1200 || !isHome || activeSession)) {
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

export const gameStateSchema = z.object({
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
}).superRefine((state, context) => semanticRefinement(state as GameState, context));

type LegacyGameState = z.infer<typeof legacyGameStateSchema>;
type Version2GameState = z.infer<typeof version2GameStateSchema>;

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

const repairPlayerPosition = (state: GameState): GameState => {
  const field = fieldById[state.field.fieldId];
  const closedExitIds = field.exits
    .filter((exit) => !isFieldExitAvailable(state, exit).available)
    .map((exit) => exit.id);
  const repaired = nearestSafePoint(state.field.fieldId, [
    { x: state.field.x, y: state.field.y },
    { x: state.field.lastSafeX, y: state.field.lastSafeY },
  ], closedExitIds);
  const discoveredFieldIds = state.field.discoveredFieldIds.includes(state.field.fieldId)
    ? state.field.discoveredFieldIds
    : [...state.field.discoveredFieldIds, state.field.fieldId];
  if (
    repaired.x === state.field.x &&
    repaired.y === state.field.y &&
    repaired.x === state.field.lastSafeX &&
    repaired.y === state.field.lastSafeY &&
    discoveredFieldIds === state.field.discoveredFieldIds
  ) return state;
  return {
    ...state,
    field: {
      ...state.field,
      x: repaired.x,
      y: repaired.y,
      lastSafeX: repaired.x,
      lastSafeY: repaired.y,
      discoveredFieldIds,
    },
  };
};

export const migrateVersion2GameState = (legacy: Version2GameState): GameState => {
  const base = repairPlayerPosition({
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
  } as GameState);

  if (!base.exploration) return base;
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
  return {
    ...base,
    exploration: { ...base.exploration, searchedSpotIds: uniqueSpotIds },
    inspectionSessions: sessions,
  };
};

const saveEnvelopeSchema = z.object({
  schemaVersion: z.literal(3),
  savedAt: z.string(),
  state: gameStateSchema,
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
  migrated: boolean;
}

const parseSavedState = (raw: string | null): ParsedState | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const current = saveEnvelopeSchema.safeParse(parsed);
    if (current.success) return { state: repairPlayerPosition(current.data.state as GameState), migrated: false };
    const version2 = version2SaveEnvelopeSchema.safeParse(parsed);
    if (version2.success) {
      const migrated = migrateVersion2GameState(version2.data.state);
      const checked = gameStateSchema.safeParse(migrated);
      return checked.success ? { state: repairPlayerPosition(checked.data as GameState), migrated: true } : null;
    }
    const legacy = legacySaveEnvelopeSchema.safeParse(parsed);
    if (!legacy.success) return null;
    const migrated = migrateVersion2GameState(migrateLegacyGameState(legacy.data.state));
    const checked = gameStateSchema.safeParse(migrated);
    return checked.success ? { state: repairPlayerPosition(checked.data as GameState), migrated: true } : null;
  } catch {
    return null;
  }
};

export const loadGame = (storage = browserStorage()): GameState | null => {
  if (!storage) return null;
  try {
    const currentRaw = storage.getItem(SAVE_KEY);
    const current = parseSavedState(currentRaw);
    if (current) {
      if (current.migrated && currentRaw) {
        try {
          storage.setItem(MIGRATION_BACKUP_KEY, currentRaw);
        } catch {
          // A valid save remains playable even when the optional migration backup cannot be written.
        }
      }
      return current.state;
    }
    const backupRaw = storage.getItem(BACKUP_KEY);
    const backup = parseSavedState(backupRaw);
    if (backup?.migrated && backupRaw) {
      try {
        storage.setItem(MIGRATION_BACKUP_KEY, backupRaw);
      } catch {
        // A valid backup remains playable even when the optional migration copy cannot be written.
      }
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
    if (current) storage.setItem(BACKUP_KEY, current);
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({ schemaVersion: 3, savedAt: new Date().toISOString(), state }),
    );
  } catch {
    // Saving is best-effort. Storage restrictions or quota errors must not stop the game.
  }
};

export const deleteSave = (storage = browserStorage()): void => {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_KEY);
    storage.removeItem(BACKUP_KEY);
    storage.removeItem(MIGRATION_BACKUP_KEY);
  } catch {
    // Ignore browser storage restrictions.
  }
};

export const hasSavedGame = (storage = browserStorage()): boolean => loadGame(storage) !== null;
