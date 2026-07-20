import { z } from "zod";
import type { GameState } from "../types/game";
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

export const gameStateSchema = z.object({
  schemaVersion: z.literal(1),
  contentVersion: z.literal(1),
  rngVersion: z.literal(1),
  worldSeed: z.string(),
  revision: z.number().int().nonnegative(),
  day: z.number().int().positive(),
  timeMinutes: z.number().int().min(360).max(1200),
  phase: z.enum(["day", "pickup", "evening", "day-ended"]),
  locationId: z.enum(locationIds),
  visitCounters: z.partialRecord(z.enum(locationIds), z.number().int().nonnegative()),
  exploration: z
    .object({
      locationId: z.enum(locationIds),
      visitIndex: z.number().int().positive(),
      period: z.enum(["morning", "day", "evening", "night"]),
      focusedSpotId: z.string().optional(),
      searchedSpotIds: z.array(z.string()),
    })
    .optional(),
  specimens: z.array(specimenSchema),
  npcTalkCounts: z.partialRecord(z.enum(npcIds), z.number().int().nonnegative()),
  metNpcIds: z.array(z.enum(npcIds)),
  flags: z.object({
    secretRouteUnlocked: z.boolean(),
    pickupCompletedDay: z.number().int().nonnegative(),
    extraHintDay: z.number().int().nonnegative(),
  }),
  buffs: z.object({
    appearanceBoostUntil: z.number().int().nonnegative(),
    nextBoostExtensionMinutes: z.number().int().nonnegative(),
  }),
  pendingOutcome: outcomeSchema.optional(),
}).superRefine((state, context) => {
  const isHome = state.locationId === "grandma-house" || state.locationId === "backyard";
  const invalid = (message: string) => context.addIssue({ code: "custom", message });

  if (state.phase === "day" && state.timeMinutes >= 1080) {
    invalid("day phase must end before 18:00");
  }
  if (state.phase === "pickup" && (state.timeMinutes !== 1080 || isHome)) {
    invalid("pickup phase must be at 18:00 in a remote location");
  }
  if (state.phase === "evening" && (state.timeMinutes < 1080 || state.timeMinutes >= 1200 || !isHome)) {
    invalid("evening phase must be between 18:00 and 20:00 at home");
  }
  if (state.phase === "day-ended" && (state.timeMinutes !== 1200 || !isHome)) {
    invalid("day-ended phase must be at 20:00 at home");
  }
  if (state.exploration) {
    if (state.exploration.locationId !== state.locationId) {
      invalid("exploration location must match current location");
    }
    if (state.exploration.period !== getTimePeriod(state.timeMinutes)) {
      invalid("exploration period must match current time");
    }
  }
});

const saveEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  savedAt: z.string(),
  state: gameStateSchema,
});

const browserStorage = (): StorageLike | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const parseSavedState = (raw: string | null): GameState | null => {
  if (!raw) return null;
  try {
    const result = saveEnvelopeSchema.safeParse(JSON.parse(raw));
    return result.success ? (result.data.state as GameState) : null;
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
      JSON.stringify({ schemaVersion: 1, savedAt: new Date().toISOString(), state }),
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
