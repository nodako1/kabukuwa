import { insectById } from "../data/insects";
import { HOME_FIELD_IDS, fieldById, getSpawnPoint } from "../data/fields";
import { locationById } from "../data/locations";
import { npcById } from "../data/npcs";
import { initialTrapStates, treeById } from "../data/trees";
import type {
  AdRewardKind,
  FieldId,
  FacingDirection,
  GameCommand,
  GameState,
  Outcome,
  Specimen,
  TreeInspectionSession,
} from "../types/game";
import {
  INTERACTION_RADIUS,
  distanceBetween,
  getFieldCollisionRects,
  isAtEdgeExit,
  isPositionWalkable,
} from "./field";
import {
  DAY_END,
  DAY_START,
  EVENING_START,
  PICKUP_COMPLETE_TIME,
  getTimePeriod,
} from "./clock";
import {
  getGrandmaHint,
  isFieldExitAvailable,
  isNpcPresent,
} from "./rules";
import {
  commitInspectionSession,
  generateInspectionSession,
  getInspectionSessionId,
  isInspectionComplete,
  isInspectionPointUnlocked,
} from "./inspection";

const withRevision = (state: GameState): GameState => ({
  ...state,
  revision: state.revision + 1,
});

const fieldStateAt = (
  fieldId: FieldId,
  spawnId?: string,
  discoveredFieldIds: FieldId[] = [fieldId],
  lastTransitionToken?: string,
) => {
  const point = getSpawnPoint(fieldId, spawnId);
  return {
    fieldId,
    x: point.x,
    y: point.y,
    facing: point.facing,
    lastSafeX: point.x,
    lastSafeY: point.y,
    discoveredFieldIds: discoveredFieldIds.includes(fieldId)
      ? discoveredFieldIds
      : [...discoveredFieldIds, fieldId],
    lastTransitionToken,
  };
};

export const createInitialGame = (seed = `summer-${Date.now().toString(36)}`): GameState => ({
  schemaVersion: 3,
  contentVersion: 3,
  rngVersion: 1,
  worldSeed: seed,
  revision: 0,
  day: 1,
  timeMinutes: DAY_START,
  phase: "day",
  locationId: "grandma-house",
  field: fieldStateAt("grandma-house", "start"),
  visitCounters: {},
  specimens: [],
  npcTalkCounts: {},
  metNpcIds: [],
  flags: {
    secretRouteUnlocked: false,
    pickupCompletedDay: 0,
    extraHintDay: 0,
    fieldTutorialSeen: false,
  },
  buffs: {
    appearanceBoostUntil: 0,
    nextBoostExtensionMinutes: 0,
  },
  inspectionSessions: {},
  discoveredClueSessionIds: [],
  caughtEncounterIds: [],
  trapStates: initialTrapStates(),
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
    if (state.activeInspectionSessionId) {
      return {
        ...next,
        timeMinutes: DAY_END,
        phase: "evening",
        pendingBoundaryEvent: "day-ended",
      };
    }
    return syncExplorationPeriod({ ...next, timeMinutes: DAY_END, phase: "day-ended" });
  }

  const actionStartedAwayFromHome = !HOME_FIELD_IDS.includes(actionOriginState.field.fieldId);
  const actionEndsAwayFromHome = !HOME_FIELD_IDS.includes(state.field.fieldId);
  if (
    state.timeMinutes < EVENING_START &&
    destinationMinutes >= EVENING_START &&
    (actionStartedAwayFromHome || actionEndsAwayFromHome) &&
    state.flags.pickupCompletedDay !== state.day
  ) {
    if (state.activeInspectionSessionId) {
      return {
        ...next,
        timeMinutes: EVENING_START,
        phase: "day",
        pendingBoundaryEvent: "pickup",
      };
    }
    const pickupState = actionStartedAwayFromHome ? actionOriginState : state;
    return syncExplorationPeriod({
      ...next,
      timeMinutes: EVENING_START,
      phase: "pickup",
      locationId: pickupState.locationId,
      field: pickupState.field,
      exploration: pickupState.exploration,
      visitCounters: pickupState.visitCounters,
    });
  }

  if (destinationMinutes >= EVENING_START) {
    return syncExplorationPeriod({ ...next, phase: "evening" });
  }

  return syncExplorationPeriod(next);
};

const notice = (state: GameState, title: string, text: string): GameState =>
  withRevision({ ...state, pendingOutcome: { type: "notice", title, text } });

const isPlayerNear = (state: GameState, point: { x: number; y: number }): boolean =>
  distanceBetween(state.field, point) < INTERACTION_RADIUS;

const currentFieldCollisionRects = (state: GameState) => {
  const field = fieldById[state.field.fieldId];
  const closedExitIds = field.exits
    .filter((exit) => !isFieldExitAvailable(state, exit).available)
    .map((exit) => exit.id);
  return getFieldCollisionRects(field, closedExitIds);
};

const travelEdge = (
  state: GameState,
  command: Extract<GameCommand, { type: "TRAVEL_EDGE" }>,
): GameState => {
  const currentField = fieldById[state.field.fieldId];
  if (state.field.lastTransitionToken === command.transitionToken) return state;
  const exit = currentField.exits.find((candidate) => candidate.id === command.exitId);
  if (!exit) return notice(state, "道が見つかりません", "いったん周りを見直してみよう。");
  const access = isFieldExitAvailable(state, exit);
  if (!access.available) return notice(state, "今は通れません", access.reason ?? "別の道を探してみよう。");
  if (
    !Number.isFinite(command.x) ||
    !Number.isFinite(command.y) ||
    !isAtEdgeExit(command, command.facing, exit, currentField)
  ) return state;

  const actionOriginState: GameState = {
    ...state,
    field: {
      ...state.field,
      x: command.x,
      y: command.y,
      facing: command.facing,
      lastSafeX: command.x,
      lastSafeY: command.y,
      lastTransitionToken: command.transitionToken,
    },
  };
  const destination = fieldById[exit.toFieldId];
  const destinationLocationId = destination.locationId;
  const locationId = destinationLocationId ?? state.locationId;
  const visitIndex = destinationLocationId
    ? (state.visitCounters[destinationLocationId] ?? 0) + 1
    : undefined;
  const arrived: GameState = {
    ...state,
    locationId,
    field: fieldStateAt(
      exit.toFieldId,
      exit.toSpawnId,
      state.field.discoveredFieldIds,
      command.transitionToken,
    ),
    visitCounters: destinationLocationId && visitIndex
      ? { ...state.visitCounters, [destinationLocationId]: visitIndex }
      : state.visitCounters,
    exploration:
      destinationLocationId && visitIndex && locationById[destinationLocationId].hotspots.length > 0
        ? {
            locationId: destinationLocationId,
            visitIndex,
            period: getTimePeriod(state.timeMinutes),
            searchedSpotIds: [],
          }
        : undefined,
  };
  return withRevision(advanceAfterAction(arrived, exit.travelMinutes, undefined, actionOriginState));
};

const openTreeInspection = (state: GameState, treeId: string): GameState => {
  const tree = treeById[treeId];
  if (!tree || tree.fieldId !== state.field.fieldId || !state.exploration) {
    return notice(state, "探索する木へ近づこう", "気になる木やトラップのそばまで歩いてみよう。");
  }
  if (!isPlayerNear(state, { x: tree.x, y: tree.y + 30 })) {
    return notice(state, "もう少し近づこう", `${tree.label}のそばまで歩いてみよう。`);
  }

  const sessionId = getInspectionSessionId(state, tree);
  const existing = state.inspectionSessions[sessionId];
  if (existing?.committed) {
    const reopened: TreeInspectionSession = {
      ...existing,
      returnPosition: {
        x: state.field.x,
        y: state.field.y,
        facing: state.field.facing,
      },
    };
    return withRevision({
      ...state,
      activeInspectionSessionId: existing.id,
      inspectionSessions: { ...state.inspectionSessions, [existing.id]: reopened },
    });
  }

  const preview = existing ?? generateInspectionSession(state, tree);
  if (!preview) {
    return notice(state, "まだ調べられません", "この仕掛けは暗くなってから使えます。");
  }
  const session = commitInspectionSession(preview, state);
  const exploration = isInspectionComplete(session, tree) && !state.exploration.searchedSpotIds.includes(tree.legacySpotId)
    ? {
        ...state.exploration,
        focusedSpotId: tree.legacySpotId,
        searchedSpotIds: [...state.exploration.searchedSpotIds, tree.legacySpotId],
      }
    : {
        ...state.exploration,
        focusedSpotId: tree.legacySpotId,
      };
  const started: GameState = {
    ...state,
    activeInspectionSessionId: session.id,
    inspectionSessions: { ...state.inspectionSessions, [session.id]: session },
    exploration,
  };
  return withRevision(advanceAfterAction(started, 15, undefined, state));
};

const viewInspectionPoint = (state: GameState, pointId: string): GameState => {
  const sessionId = state.activeInspectionSessionId;
  if (!sessionId) return state;
  const session = state.inspectionSessions[sessionId];
  const tree = session ? treeById[session.treeId] : undefined;
  const inspectionPoint = tree?.inspectionPoints.find((point) => point.id === pointId);
  if (!session || !tree || !inspectionPoint) return state;
  if (
    inspectionPoint.activePeriods && !inspectionPoint.activePeriods.includes(session.period) ||
    !isInspectionPointUnlocked(session, inspectionPoint)
  ) return state;
  const examinedPointIds = session.examinedPointIds.includes(pointId)
    ? session.examinedPointIds
    : [...session.examinedPointIds, pointId];
  const nextSession: TreeInspectionSession = {
    ...session,
    currentPointId: pointId,
    examinedPointIds,
  };
  const completed = isInspectionComplete(nextSession, tree);
  const exploration = state.exploration && completed && !state.exploration.searchedSpotIds.includes(tree.legacySpotId)
    ? {
        ...state.exploration,
        searchedSpotIds: [...state.exploration.searchedSpotIds, tree.legacySpotId],
      }
    : state.exploration;
  return withRevision({
    ...state,
    exploration,
    inspectionSessions: { ...state.inspectionSessions, [sessionId]: nextSession },
  });
};

const catchInspectionEncounter = (state: GameState, encounterId: string): GameState => {
  const sessionId = state.activeInspectionSessionId;
  const session = sessionId ? state.inspectionSessions[sessionId] : undefined;
  const encounter = session?.catchableEncounter;
  if (
    !sessionId ||
    !session ||
    !encounter ||
    encounter.id !== encounterId ||
    encounter.caught ||
    state.caughtEncounterIds.includes(encounterId)
  ) return state;

  const previousBest = state.specimens
    .filter((specimen) => specimen.insectId === encounter.insectId)
    .reduce((best, specimen) => Math.max(best, specimen.sizeMm), 0);
  const specimen: Specimen = {
    id: encounter.id,
    insectId: encounter.insectId,
    sizeMm: encounter.sizeMm,
    day: session.day,
    caughtAtMinutes: session.resolvedAtMinutes,
    locationId: state.locationId,
    spotId: session.treeId,
    treeId: session.treeId,
    inspectionPointId: encounter.pointId,
    rankingEligible: encounter.rankingEligible,
  };
  const nextSession = {
    ...session,
    catchableEncounter: { ...encounter, caught: true },
  };
  return withRevision({
    ...state,
    specimens: [...state.specimens, specimen],
    caughtEncounterIds: [...state.caughtEncounterIds, encounterId],
    inspectionSessions: { ...state.inspectionSessions, [sessionId]: nextSession },
    pendingOutcome: {
      type: "caught",
      specimen,
      isPersonalBest: specimen.sizeMm > previousBest,
      isFirstCatch: previousBest === 0,
    },
  });
};

const closeTreeInspection = (state: GameState): GameState => {
  const sessionId = state.activeInspectionSessionId;
  if (!sessionId) return state;
  const session = state.inspectionSessions[sessionId];
  let next: GameState = {
    ...state,
    activeInspectionSessionId: undefined,
    field: session
      ? {
          ...state.field,
          ...session.returnPosition,
          lastSafeX: session.returnPosition.x,
          lastSafeY: session.returnPosition.y,
        }
      : state.field,
  };
  if (state.pendingBoundaryEvent === "pickup") {
    next = { ...next, phase: "pickup", timeMinutes: EVENING_START, pendingBoundaryEvent: undefined };
  } else if (state.pendingBoundaryEvent === "day-ended") {
    next = { ...next, phase: "day-ended", timeMinutes: DAY_END, pendingBoundaryEvent: undefined };
  }
  return withRevision(next);
};

const discoverTreeClue = (
  state: GameState,
  command: Extract<GameCommand, { type: "DISCOVER_TREE_CLUE" }>,
): GameState => {
  const tree = treeById[command.treeId];
  if (!tree || tree.fieldId !== state.field.fieldId || !state.exploration) return state;
  if (distanceBetween({ x: command.x, y: command.y }, tree) > 220) return state;
  const sessionId = getInspectionSessionId(state, tree);
  if (state.discoveredClueSessionIds.includes(sessionId)) return state;
  const session = state.inspectionSessions[sessionId] ?? generateInspectionSession(state, tree);
  if (!session?.clueVisible) return state;
  const point = { x: Math.round(command.x * 10) / 10, y: Math.round(command.y * 10) / 10 };
  const field = fieldById[state.field.fieldId];
  const validPosition = isPositionWalkable(point, field, currentFieldCollisionRects(state));
  return withRevision({
    ...state,
    field: validPosition
      ? {
          ...state.field,
          ...point,
          facing: command.facing,
          lastSafeX: point.x,
          lastSafeY: point.y,
        }
      : state.field,
    inspectionSessions: { ...state.inspectionSessions, [session.id]: session },
    discoveredClueSessionIds: [...state.discoveredClueSessionIds, session.id],
  });
};

const talk = (state: GameState, npcId: Parameters<typeof isNpcPresent>[1]): GameState => {
  if (!isNpcPresent(state, npcId)) {
    return notice(state, "今はいないようです", "時間帯や日によって、会える人が変わります。");
  }
  const npcPosition = fieldById[state.field.fieldId].npcPositions.find(
    (candidate) => candidate.npcId === npcId,
  );
  if (!npcPosition || !isPlayerNear(state, npcPosition)) {
    return notice(state, "もう少し近づこう", "声が届くところまで歩いてみよう。");
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

const syncPlayerPosition = (
  state: GameState,
  position: { x: number; y: number; facing: FacingDirection },
): GameState => {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return state;
  const field = fieldById[state.field.fieldId];
  const point = { x: Math.round(position.x * 10) / 10, y: Math.round(position.y * 10) / 10 };
  if (!isPositionWalkable(point, field, currentFieldCollisionRects(state))) return state;
  if (
    state.field.x === point.x &&
    state.field.y === point.y &&
    state.field.facing === position.facing
  ) {
    return state;
  }
  return withRevision({
    ...state,
    field: {
      ...state.field,
      ...point,
      facing: position.facing,
      lastSafeX: point.x,
      lastSafeY: point.y,
    },
  });
};

const resetPlayerPosition = (state: GameState): GameState => {
  const field = fieldById[state.field.fieldId];
  const obstacles = currentFieldCollisionRects(state);
  const lastSafe = { x: state.field.lastSafeX, y: state.field.lastSafeY };
  const fallback = getSpawnPoint(field.id);
  const point = isPositionWalkable(lastSafe, field, obstacles) ? lastSafe : fallback;
  return withRevision({
    ...state,
    field: {
      ...state.field,
      x: point.x,
      y: point.y,
      lastSafeX: point.x,
      lastSafeY: point.y,
      facing: "down",
    },
  });
};

export const gameReducer = (state: GameState, command: GameCommand): GameState => {
  if (
    state.pendingOutcome &&
    command.type !== "ACKNOWLEDGE_OUTCOME" &&
    command.type !== "RESET_GAME"
  ) {
    return state;
  }
  if (
    state.activeInspectionSessionId &&
    ![
      "VIEW_INSPECTION_POINT",
      "CATCH_INSPECTION_ENCOUNTER",
      "CLOSE_TREE_INSPECTION",
      "ACKNOWLEDGE_OUTCOME",
      "RESET_GAME",
    ].includes(command.type)
  ) return state;
  switch (command.type) {
    case "OPEN_TREE_INSPECTION":
      if (state.phase === "pickup" || state.phase === "day-ended") return state;
      return openTreeInspection(state, command.treeId);
    case "VIEW_INSPECTION_POINT":
      return viewInspectionPoint(state, command.pointId);
    case "CATCH_INSPECTION_ENCOUNTER":
      return catchInspectionEncounter(state, command.encounterId);
    case "CLOSE_TREE_INSPECTION":
      return closeTreeInspection(state);
    case "DISCOVER_TREE_CLUE":
      if (state.phase === "pickup" || state.phase === "day-ended") return state;
      return discoverTreeClue(state, command);
    case "TALK":
      if (state.phase === "pickup" || state.phase === "day-ended") return state;
      return talk(state, command.npcId);
    case "TRAVEL_EDGE":
      if (state.phase === "pickup" || state.phase === "day-ended") return state;
      return travelEdge(state, command);
    case "SYNC_PLAYER_POSITION":
      if (state.phase === "pickup" || state.phase === "day-ended") return state;
      return syncPlayerPosition(state, command);
    case "RESET_PLAYER_POSITION":
      return resetPlayerPosition(state);
    case "DISMISS_FIELD_TUTORIAL":
      return state.flags.fieldTutorialSeen
        ? state
        : withRevision({ ...state, flags: { ...state.flags, fieldTutorialSeen: true } });
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
        field: fieldStateAt("grandma-house", "start", state.field.discoveredFieldIds),
        exploration: undefined,
        visitCounters: { ...state.visitCounters, "grandma-house": visitIndex },
        flags: { ...state.flags, pickupCompletedDay: state.day },
        pendingBoundaryEvent: undefined,
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
        field: fieldStateAt("grandma-house", "start", state.field.discoveredFieldIds),
        exploration: undefined,
        pendingOutcome: undefined,
        buffs: { appearanceBoostUntil: 0, nextBoostExtensionMinutes: 0 },
        inspectionSessions: {},
        activeInspectionSessionId: undefined,
        discoveredClueSessionIds: [],
        caughtEncounterIds: [],
        pendingBoundaryEvent: undefined,
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
