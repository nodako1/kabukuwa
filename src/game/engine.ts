import { insectById } from "../data/insects";
import { HOME_LOCATION_IDS, locationById } from "../data/locations";
import { npcById } from "../data/npcs";
import type {
  AdRewardKind,
  GameCommand,
  GameState,
  LocationId,
  Outcome,
  Specimen,
} from "../types/game";
import {
  DAY_END,
  DAY_START,
  EVENING_START,
  PICKUP_COMPLETE_TIME,
  getTimePeriod,
} from "./clock";
import { getGrandmaHint, isLocationAvailable, isNpcPresent, rollEncounter } from "./rules";

const withRevision = (state: GameState): GameState => ({
  ...state,
  revision: state.revision + 1,
});

export const createInitialGame = (seed = `summer-${Date.now().toString(36)}`): GameState => ({
  schemaVersion: 1,
  contentVersion: 1,
  rngVersion: 1,
  worldSeed: seed,
  revision: 0,
  day: 1,
  timeMinutes: DAY_START,
  phase: "day",
  locationId: "grandma-house",
  visitCounters: {},
  specimens: [],
  npcTalkCounts: {},
  metNpcIds: [],
  flags: {
    secretRouteUnlocked: false,
    pickupCompletedDay: 0,
    extraHintDay: 0,
  },
  buffs: {
    appearanceBoostUntil: 0,
    nextBoostExtensionMinutes: 0,
  },
});

const advanceAfterAction = (
  state: GameState,
  minutes: number,
  outcome?: Outcome,
  actionOriginState = state,
): GameState => {
  const destinationMinutes = state.timeMinutes + minutes;
  let next: GameState = { ...state, timeMinutes: Math.min(destinationMinutes, DAY_END) };

  if (outcome) next.pendingOutcome = outcome;

  const syncExplorationPeriod = (candidate: GameState): GameState => {
    if (!candidate.exploration || candidate.exploration.locationId !== candidate.locationId) {
      return candidate;
    }
    const currentPeriod = getTimePeriod(candidate.timeMinutes);
    if (candidate.exploration.period === currentPeriod) return candidate;
    return {
      ...candidate,
      exploration: {
        ...candidate.exploration,
        period: currentPeriod,
        focusedSpotId: undefined,
        searchedSpotIds: [],
      },
    };
  };

  if (destinationMinutes >= DAY_END) {
    return syncExplorationPeriod({ ...next, timeMinutes: DAY_END, phase: "day-ended" });
  }

  const actionStartedAwayFromHome = !HOME_LOCATION_IDS.includes(actionOriginState.locationId);
  const actionEndsAwayFromHome = !HOME_LOCATION_IDS.includes(state.locationId);
  if (
    state.timeMinutes < EVENING_START &&
    destinationMinutes >= EVENING_START &&
    (actionStartedAwayFromHome || actionEndsAwayFromHome) &&
    state.flags.pickupCompletedDay !== state.day
  ) {
    const pickupLocationId = actionStartedAwayFromHome
      ? actionOriginState.locationId
      : state.locationId;
    return syncExplorationPeriod({
      ...next,
      timeMinutes: EVENING_START,
      phase: "pickup",
      locationId: pickupLocationId,
      exploration:
        pickupLocationId === actionOriginState.locationId
          ? actionOriginState.exploration
          : state.exploration,
      visitCounters:
        pickupLocationId === actionOriginState.locationId
          ? actionOriginState.visitCounters
          : state.visitCounters,
    });
  }

  if (destinationMinutes >= EVENING_START) {
    return syncExplorationPeriod({ ...next, phase: "evening" });
  }

  return syncExplorationPeriod(next);
};

const notice = (state: GameState, title: string, text: string): GameState =>
  withRevision({ ...state, pendingOutcome: { type: "notice", title, text } });

const move = (state: GameState, locationId: LocationId): GameState => {
  if (state.locationId === locationId) return state;
  const access = isLocationAvailable(state, locationId);
  if (!access.available) return notice(state, "まだ行けません", access.reason ?? "今は移動できません");

  const visitIndex = (state.visitCounters[locationId] ?? 0) + 1;
  const definition = locationById[locationId];
  const arrived: GameState = {
    ...state,
    locationId,
    visitCounters: { ...state.visitCounters, [locationId]: visitIndex },
    exploration:
      definition.hotspots.length > 0
        ? {
            locationId,
            visitIndex,
            period: getTimePeriod(state.timeMinutes),
            searchedSpotIds: [],
          }
        : undefined,
  };
  return withRevision(advanceAfterAction(arrived, definition.travelMinutes, undefined, state));
};

const focusSpot = (state: GameState, spotId: string): GameState => {
  if (!state.exploration || state.exploration.locationId !== state.locationId) return state;
  const exists = locationById[state.locationId].hotspots.some((spot) => spot.id === spotId);
  if (!exists) return state;
  return withRevision({
    ...state,
    exploration: { ...state.exploration, focusedSpotId: spotId },
  });
};

const inspectSpot = (state: GameState): GameState => {
  const exploration = state.exploration;
  if (!exploration?.focusedSpotId) {
    return notice(state, "探索する場所を選ぼう", "気になる木やトラップをタップしてください。");
  }
  const hotspot = locationById[state.locationId].hotspots.find(
    (candidate) => candidate.id === exploration.focusedSpotId,
  );
  if (!hotspot) return state;
  if (hotspot.activePeriods && !hotspot.activePeriods.includes(getTimePeriod(state.timeMinutes))) {
    return notice(state, "まだ使えません", "ライトトラップは暗くなってから使えます。");
  }
  if (exploration.searchedSpotIds.includes(hotspot.id)) {
    return notice(state, "調査済み", "この探索では、もう調べた場所です。いったん別の場所へ移動してみよう。");
  }

  const encounter = rollEncounter(state, hotspot);
  const searchedExploration = {
    ...exploration,
    searchedSpotIds: [...exploration.searchedSpotIds, hotspot.id],
  };
  const finishTime = Math.min(state.timeMinutes + 15, DAY_END);

  if (!encounter) {
    return withRevision(
      advanceAfterAction(
        { ...state, exploration: searchedExploration },
        15,
        { type: "empty", spotId: hotspot.id, text: "そっと覗いたけれど、何もいない……。" },
      ),
    );
  }

  const previousBest = state.specimens
    .filter((specimen) => specimen.insectId === encounter.insectId)
    .reduce((best, specimen) => Math.max(best, specimen.sizeMm), 0);
  const specimen: Specimen = {
    id: `${state.day}-${state.locationId}-${exploration.visitIndex}-${hotspot.id}`,
    insectId: encounter.insectId,
    sizeMm: encounter.sizeMm,
    day: state.day,
    caughtAtMinutes: finishTime,
    locationId: state.locationId,
    spotId: hotspot.id,
    rankingEligible: !encounter.boostAssisted,
  };

  return withRevision(
    advanceAfterAction(
      { ...state, exploration: searchedExploration, specimens: [...state.specimens, specimen] },
      15,
      { type: "caught", specimen, isPersonalBest: specimen.sizeMm > previousBest },
    ),
  );
};

const talk = (state: GameState, npcId: Parameters<typeof isNpcPresent>[1]): GameState => {
  if (!isNpcPresent(state, npcId)) {
    return notice(state, "今はいないようです", "時間帯や日によって、会える人が変わります。");
  }
  const npc = npcById[npcId];
  const previousCount = state.npcTalkCounts[npcId] ?? 0;
  const baseText = npc.dialogues[Math.min(previousCount, npc.dialogues.length - 1)];
  const text =
    npcId === "grandma" && state.flags.extraHintDay === state.day
      ? `${baseText}\n\n追加ヒント：${getGrandmaHint(state)}`
      : baseText;
  const nextCount = previousCount + 1;
  const unlockedSecretRoute = npcId === "shrine-keeper" && nextCount >= 3 && !state.flags.secretRouteUnlocked;
  const metNpcIds = state.metNpcIds.includes(npcId) ? state.metNpcIds : [...state.metNpcIds, npcId];

  return withRevision(
    advanceAfterAction(
      {
        ...state,
        npcTalkCounts: { ...state.npcTalkCounts, [npcId]: nextCount },
        metNpcIds,
        flags: {
          ...state.flags,
          secretRouteUnlocked: state.flags.secretRouteUnlocked || unlockedSecretRoute,
        },
      },
      15,
      { type: "dialogue", npcId, text, unlockedSecretRoute },
    ),
  );
};

const applyAdReward = (state: GameState, reward: AdRewardKind): GameState => {
  if (reward === "appearance") {
    const duration = 60 + state.buffs.nextBoostExtensionMinutes;
    return notice(
      {
        ...state,
        buffs: {
          appearanceBoostUntil: Math.max(state.timeMinutes, state.buffs.appearanceBoostUntil) + duration,
          nextBoostExtensionMinutes: 0,
        },
      },
      "出現率アップ",
      `${duration}分間、虫の出現率が上がります。大きさには影響しません。`,
    );
  }
  if (reward === "duration") {
    const active = state.buffs.appearanceBoostUntil > state.timeMinutes;
    return notice(
      {
        ...state,
        buffs: active
          ? { ...state.buffs, appearanceBoostUntil: state.buffs.appearanceBoostUntil + 30 }
          : { ...state.buffs, nextBoostExtensionMinutes: state.buffs.nextBoostExtensionMinutes + 30 },
      },
      "効果時間アップ",
      active ? "出現率アップを30分延長しました。" : "次の出現率アップが30分長くなります。",
    );
  }
  return notice(
    { ...state, flags: { ...state.flags, extraHintDay: state.day } },
    "おばあちゃんの追加ヒント",
    "今日だけ聞けるヒントが増えました。おばあちゃんに聞いてみよう。",
  );
};

export const gameReducer = (state: GameState, command: GameCommand): GameState => {
  if (
    state.pendingOutcome &&
    command.type !== "ACKNOWLEDGE_OUTCOME" &&
    command.type !== "RESET_GAME"
  ) {
    return state;
  }
  switch (command.type) {
    case "MOVE":
      return move(state, command.locationId);
    case "FOCUS_SPOT":
      return focusSpot(state, command.spotId);
    case "INSPECT_SPOT":
      if (state.phase === "pickup" || state.phase === "day-ended") return state;
      return inspectSpot(state);
    case "TALK":
      if (state.phase === "pickup" || state.phase === "day-ended") return state;
      return talk(state, command.npcId);
    case "REST":
      if (state.phase === "pickup" || state.phase === "day-ended") return state;
      return withRevision(advanceAfterAction(state, command.minutes));
    case "APPLY_AD_REWARD":
      return applyAdReward(state, command.reward);
    case "ACKNOWLEDGE_OUTCOME":
      return state.pendingOutcome ? withRevision({ ...state, pendingOutcome: undefined }) : state;
    case "COMPLETE_PICKUP": {
      if (state.phase !== "pickup") return state;
      const visitIndex = (state.visitCounters["grandma-house"] ?? 0) + 1;
      return withRevision({
        ...state,
        phase: "evening",
        timeMinutes: PICKUP_COMPLETE_TIME,
        locationId: "grandma-house",
        exploration: undefined,
        visitCounters: { ...state.visitCounters, "grandma-house": visitIndex },
        flags: { ...state.flags, pickupCompletedDay: state.day },
      });
    }
    case "START_NEXT_DAY":
      if (state.phase !== "day-ended") return state;
      return withRevision({
        ...state,
        day: state.day + 1,
        timeMinutes: DAY_START,
        phase: "day",
        locationId: "grandma-house",
        exploration: undefined,
        pendingOutcome: undefined,
        buffs: { appearanceBoostUntil: 0, nextBoostExtensionMinutes: 0 },
      });
    case "RESET_GAME":
      return createInitialGame(command.seed);
    default:
      return state;
  }
};

export const getOutcomeTitle = (outcome: Outcome): string => {
  if (outcome.type === "caught") return insectById[outcome.specimen.insectId].name;
  if (outcome.type === "dialogue") return npcById[outcome.npcId].name;
  if (outcome.type === "notice") return outcome.title;
  return "木のようす";
};
