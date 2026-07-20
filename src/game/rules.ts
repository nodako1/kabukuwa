import { insects } from "../data/insects";
import { HOME_LOCATION_IDS, locationById, locations } from "../data/locations";
import { npcs } from "../data/npcs";
import type {
  GameState,
  HotspotDefinition,
  InsectDefinition,
  InsectId,
  LocationId,
  NpcDefinition,
  NpcId,
  TimePeriod,
} from "../types/game";
import { EVENING_START, SECRET_ROUTE_START, getTimePeriod } from "./clock";
import { deterministicRange, deterministicRoll } from "./rng";

interface WeightedInsect {
  insect: InsectDefinition;
  chance: number;
}

export interface EncounterRoll {
  insectId: InsectId;
  sizeMm: number;
  boostAssisted: boolean;
}

const appearanceFor = (
  insect: InsectDefinition,
  locationId: LocationId,
  period: TimePeriod,
  hotspot: HotspotDefinition,
): number =>
  insect.appearances.reduce((total, rule) => {
    const matches =
      rule.locations.includes(locationId) &&
      rule.periods.includes(period) &&
      (!rule.spotKinds || rule.spotKinds.includes(hotspot.kind));
    return matches ? total + rule.chance : total;
  }, 0);

export const rollEncounter = (state: GameState, hotspot: HotspotDefinition): EncounterRoll | null => {
  const exploration = state.exploration;
  if (!exploration) return null;
  const period = getTimePeriod(state.timeMinutes);

  const candidates: WeightedInsect[] = insects
    .map((insect) => ({
      insect,
      chance: appearanceFor(insect, state.locationId, period, hotspot),
    }))
    .filter(({ chance }) => chance > 0);

  if (candidates.length === 0) return null;

  const boostActive = state.buffs.appearanceBoostUntil > state.timeMinutes;
  const boostMultiplier = boostActive ? 1.5 : 1;
  const baseChance = Math.min(
    0.72,
    candidates.reduce((total, candidate) => total + candidate.chance, 0),
  );
  const totalChance = Math.min(0.72, baseChance * boostMultiplier);
  const baseKey = [
    state.rngVersion,
    state.worldSeed,
    state.day,
    state.locationId,
    exploration.visitIndex,
    period,
    hotspot.id,
  ] as const;

  // The random roll is shared by normal and boosted checks. Raising the threshold can add an
  // encounter, but can never remove an insect that was already present before the boost.
  const presenceRoll = deterministicRoll(...baseKey, "presence");
  if (presenceRoll >= totalChance) {
    return null;
  }

  const weightTotal = candidates.reduce((total, candidate) => total + candidate.chance, 0);
  let speciesRoll = deterministicRoll(...baseKey, "species") * weightTotal;
  const selected =
    candidates.find((candidate) => {
      speciesRoll -= candidate.chance;
      return speciesRoll <= 0;
    }) ?? candidates[candidates.length - 1];

  // Size deliberately has no ad/boost input. Rewarded ads can never affect rankings.
  const rawSize = deterministicRange(
    selected.insect.minSizeMm,
    selected.insect.maxSizeMm,
    ...baseKey,
    selected.insect.id,
    "size",
  );

  return {
    insectId: selected.insect.id,
    sizeMm: Math.round(rawSize * 10) / 10,
    boostAssisted: boostActive && presenceRoll >= baseChance,
  };
};

export const isLocationAvailable = (
  state: GameState,
  locationId: LocationId,
): { available: boolean; reason?: string } => {
  if (state.phase === "day-ended") {
    return { available: false, reason: "今日はもうおしまいです" };
  }
  if (state.phase === "pickup") {
    return { available: false, reason: "おばあちゃんが迎えに来ています" };
  }
  if (state.timeMinutes >= EVENING_START && !HOME_LOCATION_IDS.includes(locationId)) {
    return { available: false, reason: "18時以降は裏庭だけ探索できます" };
  }
  if (locationId === "secret-forest") {
    if (!state.flags.secretRouteUnlocked) {
      return { available: false, reason: "まだ道を知りません" };
    }
    if (state.timeMinutes < SECRET_ROUTE_START || state.timeMinutes >= EVENING_START) {
      return { available: false, reason: "秘密の道は16:00〜18:00だけ現れます" };
    }
    if (state.locationId !== locationId && state.timeMinutes + locationById[locationId].travelMinutes >= EVENING_START) {
      return { available: false, reason: "今から向かうと18時に間に合いません" };
    }
  }
  if (locationById[locationId].daytimeOnly && state.timeMinutes >= EVENING_START) {
    return { available: false, reason: "もう暗くて入れません" };
  }
  return { available: true };
};

export const visibleLocations = (state: GameState) =>
  locations.filter((location) => !location.secret || state.flags.secretRouteUnlocked);

const scheduleMatchesDay = (days: "all" | "odd" | "even" | undefined, day: number) =>
  days === undefined || days === "all" || (days === "odd" ? day % 2 === 1 : day % 2 === 0);

export const presentNpcs = (state: GameState): NpcDefinition[] =>
  npcs.filter((npc) =>
    npc.schedules.some(
      (schedule) =>
        schedule.locationId === state.locationId &&
        state.timeMinutes >= schedule.startMinutes &&
        state.timeMinutes < schedule.endMinutes &&
        scheduleMatchesDay(schedule.days, state.day),
    ),
  );

export const isNpcPresent = (state: GameState, npcId: NpcId): boolean =>
  presentNpcs(state).some((npc) => npc.id === npcId);

export const getGrandmaHint = (state: GameState): string => {
  const period = getTimePeriod(state.timeMinutes);
  if (period === "night") {
    return "今夜はライトだけでなく、甘いバナナの匂いにも注目してみな。";
  }
  if (state.flags.secretRouteUnlocked && state.timeMinutes < SECRET_ROUTE_START) {
    return "神社のおじさんの話なら、夕方の四時を過ぎてから確かめるといいよ。";
  }
  if (state.locationId === "oak-forest") {
    return "クヌギ林では太い木だけでなく、少し離れた木も見てごらん。";
  }
  return "同じ場所へ入り直すと、虫がいる木が変わることもあるよ。";
};

export const knownNpcIds = (state: GameState): NpcId[] => state.metNpcIds;
