import { z } from "zod";
import { fieldById, getSpawnPoint } from "../data/fields";
import { getFieldCollisionRects, isPositionWalkable } from "./field";
import type { FieldId, GameState, LocationId } from "../types/game";
import { getTimePeriod } from "./clock";

export const SAVE_KEY = "kabukuwa.save.current";
export const BACKUP_KEY = "kabukuwa.save.backup";

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
const fieldIds = [
  ...locationIds,
  "paddy-road",
  "forest-road",
  "secret-path",
] as const;
const npcIds = ["grandma", "shrine-keeper", "professor", "rival", "candy-shopkeeper"] as const;
const insectIds = ["japanese-rhino", "saw-stag", "miyama-stag", "giant-stag", "atlas-beetle"] as const;

const specimenSchema = z.object({
  id: z.string(),
  insectId: z.enum(insectIds),
  sizeMm: z.number(),
  day: z.number().int().positive(),
  caughtAtMinutes: z.number().int(),
  locationId: z.enum(locationIds),
  spotId: z.string(),
  rankingEligible: z.boolean(),
});

const outcomeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("empty"), spotId: z.string(), text: z.string() }),
  z.object({ type: z.literal("caught"), specimen: specimenSchema, isPersonalBest: z.boolean() }),
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
  period: z.enum(["morning", "day", "evening", "night"]),
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

const legacyGameStateSchema = z.object({
  schemaVersion: z.literal(1),
  contentVersion: z.literal(1),
  ...commonStateShape,
  flags: z.object({
    secretRouteUnlocked: z.boolean(),
    pickupCompletedDay: z.number().int().nonnegative(),
    extraHintDay: z.number().int().nonnegative(),
  }),
});

export const gameStateSchema = z.object({
  schemaVersion: z.literal(2),
  contentVersion: z.literal(2),
  ...commonStateShape,
  field: z.object({
    fieldId: z.enum(fieldIds),
    x: z.number().finite(),
    y: z.number().finite(),
    facing: z.enum(["up", "down", "left", "right"]),
    lastSafeX: z.number().finite(),
    lastSafeY: z.number().finite(),
    discoveredFieldIds: z.array(z.enum(fieldIds)),
  }),
  flags: z.object({
    secretRouteUnlocked: z.boolean(),
    pickupCompletedDay: z.number().int().nonnegative(),
    extraHintDay: z.number().int().nonnegative(),
    fieldTutorialSeen: z.boolean(),
  }),
}).superRefine((state, context) => {
  const field = fieldById[state.field.fieldId];
  const isHome = state.field.fieldId === "grandma-house" || state.field.fieldId === "backyard";
  const invalid = (message: string) => context.addIssue({ code: "custom", message });

  if (field.locationId && field.locationId !== state.locationId) {
    invalid("location must match the current collection field");
  }
  if (state.phase === "day" && state.timeMinutes >= 1080) {
    invalid("day phase must end before 18:00");
  }
  if (state.phase === "pickup" && (state.timeMinutes !== 1080 || isHome)) {
    invalid("pickup phase must be at 18:00 in a remote field");
  }
  if (state.phase === "evening" && (state.timeMinutes < 1080 || state.timeMinutes >= 1200 || !isHome)) {
    invalid("evening phase must be between 18:00 and 20:00 at home");
  }
  if (state.phase === "day-ended" && (state.timeMinutes !== 1200 || !isHome)) {
    invalid("day-ended phase must be at 20:00 at home");
  }
  if (state.exploration) {
    if (state.exploration.locationId !== state.locationId || field.locationId !== state.locationId) {
      invalid("exploration location must match the current collection field");
    }
    if (state.exploration.period !== getTimePeriod(state.timeMinutes)) {
      invalid("exploration period must match current time");
    }
  }
});

type LegacyGameState = z.infer<typeof legacyGameStateSchema>;

const migratedPosition = (legacy: LegacyGameState): { x: number; y: number } => {
  const field = fieldById[legacy.locationId as LocationId];
  const focused = legacy.exploration?.focusedSpotId;
  const hotspot = focused
    ? field.hotspots.find((candidate) => candidate.spotId === focused)
    : undefined;
  const candidate = hotspot
    ? { x: hotspot.x, y: hotspot.y + 88 }
    : getSpawnPoint(field.id);
  return isPositionWalkable(candidate, field, getFieldCollisionRects(field))
    ? candidate
    : getSpawnPoint(field.id);
};

export const migrateLegacyGameState = (legacy: LegacyGameState): GameState => {
  const fieldId = legacy.locationId as FieldId;
  const position = migratedPosition(legacy);
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
  } as GameState;
};

const saveEnvelopeSchema = z.object({
  schemaVersion: z.literal(2),
  savedAt: z.string(),
  state: gameStateSchema,
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

const repairPlayerPosition = (state: GameState): GameState => {
  const field = fieldById[state.field.fieldId];
  const obstacles = getFieldCollisionRects(field);
  const current = { x: state.field.x, y: state.field.y };
  const lastSafe = { x: state.field.lastSafeX, y: state.field.lastSafeY };
  const currentIsSafe = isPositionWalkable(current, field, obstacles);
  const lastSafeIsSafe = isPositionWalkable(lastSafe, field, obstacles);
  const fallback = getSpawnPoint(field.id);
  const repairedCurrent = currentIsSafe ? current : lastSafeIsSafe ? lastSafe : fallback;
  const repairedLastSafe = lastSafeIsSafe ? lastSafe : repairedCurrent;
  const discoveredFieldIds = state.field.discoveredFieldIds.includes(field.id)
    ? state.field.discoveredFieldIds
    : [...state.field.discoveredFieldIds, field.id];

  if (
    repairedCurrent.x === current.x &&
    repairedCurrent.y === current.y &&
    repairedLastSafe.x === lastSafe.x &&
    repairedLastSafe.y === lastSafe.y &&
    discoveredFieldIds === state.field.discoveredFieldIds
  ) return state;

  return {
    ...state,
    field: {
      ...state.field,
      x: repairedCurrent.x,
      y: repairedCurrent.y,
      lastSafeX: repairedLastSafe.x,
      lastSafeY: repairedLastSafe.y,
      discoveredFieldIds,
    },
  };
};

const parseSavedState = (raw: string | null): GameState | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const current = saveEnvelopeSchema.safeParse(parsed);
    if (current.success) return repairPlayerPosition(current.data.state as GameState);
    const legacy = legacySaveEnvelopeSchema.safeParse(parsed);
    if (!legacy.success) return null;
    const migrated = gameStateSchema.safeParse(migrateLegacyGameState(legacy.data.state));
    return migrated.success ? repairPlayerPosition(migrated.data as GameState) : null;
  } catch {
    return null;
  }
};

export const loadGame = (storage = browserStorage()): GameState | null => {
  if (!storage) return null;
  try {
    return parseSavedState(storage.getItem(SAVE_KEY)) ?? parseSavedState(storage.getItem(BACKUP_KEY));
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
      JSON.stringify({ schemaVersion: 2, savedAt: new Date().toISOString(), state }),
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
  } catch {
    // Ignore browser storage restrictions.
  }
};

export const hasSavedGame = (storage = browserStorage()): boolean => loadGame(storage) !== null;
