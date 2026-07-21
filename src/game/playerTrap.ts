import { fieldById } from "../data/fields";
import { insects } from "../data/insects";
import { treeById } from "../data/trees";
import type {
  AmbientInsectId,
  AmbientPlacement,
  DailyNatureId,
  GameState,
  InsectDefinition,
  LocationId,
  PlayerTrapOutcomePlan,
  PlayerTrapPresenceTier,
  PlayerTrapState,
  TreeDefinition,
} from "../types/game";
import { deterministicRange, deterministicRoll } from "./rng";

const MAX_PRESENCE_CHANCE = 0.72;
const PLAYER_TRAP_MULTIPLIER = 1.25;
const SWEET_BREEZE_MULTIPLIER = 1.2;

interface Candidate {
  insect: InsectDefinition;
  chance: number;
}

const morningBananaChance = (insect: InsectDefinition, locationId: LocationId): number =>
  insect.appearances.reduce((total, rule) => {
    const matches =
      rule.locations.includes(locationId) &&
      rule.periods.includes("morning") &&
      (!rule.spotKinds || rule.spotKinds.includes("banana-trap"));
    return matches ? total + rule.chance : total;
  }, 0);

const candidatesForTree = (tree: TreeDefinition): Candidate[] => {
  const locationId = fieldById[tree.fieldId].locationId;
  if (!locationId) return [];
  return insects
    .map((insect) => ({ insect, chance: morningBananaChance(insect, locationId) }))
    .filter((candidate) => candidate.chance > 0);
};

export const getPlayerTrapProbabilities = (
  tree: TreeDefinition,
  natureId: DailyNatureId,
): { baseChance: number; natureChance: number; playerTrapChance: number } => {
  const baseChance = Math.min(
    MAX_PRESENCE_CHANCE,
    candidatesForTree(tree).reduce((sum, candidate) => sum + candidate.chance, 0),
  );
  const natureChance = Math.min(
    MAX_PRESENCE_CHANCE,
    baseChance * (natureId === "sweet-breeze" ? SWEET_BREEZE_MULTIPLIER : 1),
  );
  return {
    baseChance,
    natureChance,
    playerTrapChance: Math.min(MAX_PRESENCE_CHANCE, natureChance * PLAYER_TRAP_MULTIPLIER),
  };
};

const trapKey = (state: GameState, trap: PlayerTrapState) => [
  state.rngVersion,
  state.worldSeed,
  trap.readyDay,
  trap.sequence,
  trap.treeId,
  "player-banana-trap",
] as const;

export const getPlayerTrapPresenceRoll = (state: GameState, trap: PlayerTrapState): number =>
  deterministicRoll(...trapKey(state, trap), "presence");

const presenceTierFor = (
  roll: number,
  thresholds: ReturnType<typeof getPlayerTrapProbabilities>,
): PlayerTrapPresenceTier => {
  if (roll < thresholds.baseChance) return "base";
  if (roll < thresholds.natureChance) return "daily-nature";
  if (roll < thresholds.playerTrapChance) return "player-trap";
  return "none";
};

const motionFor = (insectId: AmbientInsectId): AmbientPlacement["motion"] => {
  if (insectId === "ant" || insectId === "pillbug") return "crawl";
  if (insectId === "moth" || insectId === "butterfly" || insectId === "gnat") return "flutter";
  return "still";
};

const ambientPlacements = (state: GameState, trap: PlayerTrapState): AmbientPlacement[] => {
  const key = trapKey(state, trap);
  const pool: AmbientInsectId[] = [
    "green-bottle",
    "black-bottle",
    "ant",
    "moth",
    "gnat",
    "green-bottle",
  ];
  const count = 2 + Math.floor(deterministicRoll(...key, "ambient-count") * 5);
  return Array.from({ length: count }, (_, index) => {
    const insectId = pool[Math.min(
      pool.length - 1,
      Math.floor(deterministicRoll(...key, "ambient-kind", index) * pool.length),
    )];
    return {
      id: `${trap.id}:ambient-${index}`,
      insectId,
      x: 0.12 + deterministicRoll(...key, "ambient-x", index) * 0.76,
      y: 0.16 + deterministicRoll(...key, "ambient-y", index) * 0.66,
      motion: motionFor(insectId),
    };
  });
};

export const generatePlayerTrapOutcome = (
  state: GameState,
  trap: PlayerTrapState,
  natureId: DailyNatureId,
): PlayerTrapOutcomePlan => {
  const tree = treeById[trap.treeId];
  const candidates = tree ? candidatesForTree(tree) : [];
  const thresholds = tree
    ? getPlayerTrapProbabilities(tree, natureId)
    : { baseChance: 0, natureChance: 0, playerTrapChance: 0 };
  const presenceRoll = getPlayerTrapPresenceRoll(state, trap);
  const presenceTier = presenceTierFor(presenceRoll, thresholds);
  const key = trapKey(state, trap);

  let selected: Candidate | undefined;
  if (presenceTier !== "none" && candidates.length > 0) {
    const total = candidates.reduce((sum, candidate) => sum + candidate.chance, 0);
    let speciesRoll = deterministicRoll(...key, "species") * total;
    selected = candidates.find((candidate) => {
      speciesRoll -= candidate.chance;
      return speciesRoll <= 0;
    }) ?? candidates[candidates.length - 1];
  }

  const sizeMm = selected
    ? Math.round(deterministicRange(
        selected.insect.minSizeMm,
        selected.insect.maxSizeMm,
        ...key,
        selected.insect.id,
        "size",
      ) * 10) / 10
    : undefined;

  return {
    planVersion: 1,
    resolvedDay: trap.readyDay,
    resolvedNatureId: natureId,
    presenceTier,
    encounter: selected && sizeMm !== undefined
      ? {
          id: `${trap.id}:encounter`,
          insectId: selected.insect.id,
          sizeMm,
          rankingEligible: true,
          caught: false,
          x: 0.2 + deterministicRoll(...key, "position", "x") * 0.6,
          y: 0.2 + deterministicRoll(...key, "position", "y") * 0.56,
        }
      : undefined,
    ambientPlacements: ambientPlacements(state, trap),
  };
};

export const resolvePlayerTrapForDay = (state: GameState, day: number): GameState => {
  const trap = state.playerTrapKit.activeTrap;
  if (!trap || trap.phase !== "waiting" || trap.readyDay > day) return state;
  const plan = state.dailyPlansByDay[String(day)];
  if (!plan) return state;
  const outcomePlan = generatePlayerTrapOutcome(state, trap, plan.natureId);
  return {
    ...state,
    playerTrapKit: {
      ...state.playerTrapKit,
      activeTrap: { ...trap, phase: "ready", outcomePlan },
    },
  };
};

export const playerTrapId = (sequence: number, treeId: string, installedDay: number): string =>
  `player-trap:${sequence}:${treeId}:day-${installedDay}`;

export const treeIdFromPlayerTrapId = (id: string): string | undefined => {
  const match = id.match(/^player-trap:\d+:(.+):day-\d+$/);
  return match?.[1];
};

export const playerTrapLocationId = (trap: PlayerTrapState): LocationId | undefined => {
  const tree = treeById[trap.treeId];
  return tree ? fieldById[tree.fieldId].locationId : undefined;
};
