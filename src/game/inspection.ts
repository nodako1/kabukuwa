import { fieldById, HOME_FIELD_IDS } from "../data/fields";
import { locationById } from "../data/locations";
import { treeById } from "../data/trees";
import type {
  AmbientInsectId,
  AmbientPlacement,
  GameState,
  InsectId,
  InspectionSceneKind,
  TreeDefinition,
  TreeInspectionPoint,
  TreeInspectionSession,
} from "../types/game";
import { DAY_END, EVENING_START, getTimePeriod } from "./clock";
import { deterministicRoll } from "./rng";
import { rollEncounter } from "./rules";

const ambientPool = (
  sceneKind: InspectionSceneKind,
  period: TreeInspectionSession["period"],
): AmbientInsectId[] => {
  if (sceneKind === "root") return ["ant", "pillbug", "ant", "gnat"];
  if (sceneKind === "bark-crack") return ["ant", "gnat", "black-bottle"];
  if (sceneKind === "light-trap") return ["moth", "gnat", "moth", "gnat"];
  if (sceneKind === "banana-trap") {
    return period === "night"
      ? ["moth", "green-bottle", "ant", "gnat"]
      : ["green-bottle", "ant", "black-bottle"];
  }
  if (period === "night") return ["moth", "gnat", "green-bottle", "moth"];
  if (period === "evening") return ["green-bottle", "moth", "gnat", "black-bottle"];
  return ["green-bottle", "black-bottle", "butterfly", "ant", "gnat"];
};

const motionFor = (insectId: AmbientInsectId): AmbientPlacement["motion"] => {
  if (insectId === "ant" || insectId === "pillbug") return "crawl";
  if (insectId === "moth" || insectId === "butterfly" || insectId === "gnat") return "flutter";
  return "still";
};

const ambientForPoint = (
  state: GameState,
  sessionId: string,
  point: TreeInspectionPoint,
  period: TreeInspectionSession["period"],
): AmbientPlacement[] => {
  const pool = ambientPool(point.sceneKind, period);
  const baseCount = point.sceneKind === "bark-crack" ? 1 : 2;
  const count = baseCount + Math.floor(deterministicRoll(
    state.rngVersion,
    state.worldSeed,
    sessionId,
    point.id,
    "ambient-count",
  ) * (point.sceneKind === "bark-crack" ? 3 : 5));

  return Array.from({ length: count }, (_, index) => {
    const insectId = pool[Math.floor(deterministicRoll(
      state.rngVersion,
      state.worldSeed,
      sessionId,
      point.id,
      index,
      "ambient-kind",
    ) * pool.length)] ?? pool[0];
    return {
      id: `${sessionId}:${point.id}:ambient-${index}`,
      insectId,
      x: 0.12 + deterministicRoll(state.worldSeed, sessionId, point.id, index, "ambient-x") * 0.76,
      y: 0.15 + deterministicRoll(state.worldSeed, sessionId, point.id, index, "ambient-y") * 0.68,
      motion: motionFor(insectId),
    };
  });
};

const pointWeight = (
  insectId: InsectId,
  point: TreeInspectionPoint,
  period: TreeInspectionSession["period"],
): number => {
  if (point.sceneKind === "banana-trap" || point.sceneKind === "light-trap") return 8;
  if (insectId === "giant-stag") return point.sceneKind === "bark-crack" ? 7 : point.sceneKind === "root" ? 2 : 1;
  if (insectId === "japanese-rhino") {
    if (period === "day") return point.sceneKind === "root" ? 6 : 2;
    return point.sceneKind === "sap" ? 6 : 2;
  }
  if (insectId === "miyama-stag") return point.sceneKind === "root" ? 4 : 3;
  return point.sceneKind === "sap" || point.sceneKind === "bark-crack" ? 4 : 2;
};

const selectEncounterPoint = (
  state: GameState,
  sessionId: string,
  tree: TreeDefinition,
  insectId: InsectId,
  period: TreeInspectionSession["period"],
): TreeInspectionPoint => {
  const active = tree.inspectionPoints.filter(
    (point) => !point.activePeriods || point.activePeriods.includes(period),
  );
  const weighted = active.map((point) => ({ point, weight: pointWeight(insectId, point, period) }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = deterministicRoll(state.worldSeed, sessionId, insectId, "encounter-point") * total;
  return weighted.find((item) => {
    roll -= item.weight;
    return roll <= 0;
  })?.point ?? active[0] ?? tree.inspectionPoints[0];
};

export const getInspectionSessionId = (state: GameState, tree: TreeDefinition): string => {
  const period = getTimePeriod(state.timeMinutes);
  const visitIndex = state.exploration?.locationId === state.locationId
    ? state.exploration.visitIndex
    : state.visitCounters[state.locationId] ?? 1;
  const token = Math.floor(deterministicRoll(
    state.rngVersion,
    state.worldSeed,
    state.day,
    visitIndex,
    period,
    tree.id,
    "inspection-session",
  ) * 0xffffffffff).toString(36);
  return `inspect:${state.day}:${visitIndex}:${period}:${tree.id}:${token}`;
};

const resolvedMinutes = (state: GameState): number => {
  const raw = state.timeMinutes + 15;
  if (
    !HOME_FIELD_IDS.includes(state.field.fieldId) &&
    state.timeMinutes < EVENING_START &&
    raw >= EVENING_START
  ) return EVENING_START;
  return Math.min(raw, DAY_END);
};

export const generateInspectionSession = (
  state: GameState,
  tree: TreeDefinition,
): TreeInspectionSession | null => {
  const field = fieldById[state.field.fieldId];
  if (!field.locationId || tree.fieldId !== field.id || field.locationId !== state.locationId) return null;
  if (tree.trapKind && !state.trapStates[tree.id]?.installed) return null;
  const hotspot = locationById[field.locationId].hotspots.find((candidate) => candidate.id === tree.legacySpotId);
  if (!hotspot || !state.exploration) return null;

  const period = getTimePeriod(state.timeMinutes);
  const activePoints = tree.inspectionPoints.filter(
    (point) => !point.activePeriods || point.activePeriods.includes(period),
  );
  if (activePoints.length === 0) return null;

  const id = getInspectionSessionId(state, tree);
  const encounter = rollEncounter(state, hotspot);
  const ambientByPointId = Object.fromEntries(activePoints.map((inspectionPoint) => [
    inspectionPoint.id,
    ambientForPoint(state, id, inspectionPoint, period),
  ]));
  const encounterPoint = encounter
    ? selectEncounterPoint(state, id, tree, encounter.insectId, period)
    : undefined;
  const ambientCount = Object.values(ambientByPointId).reduce((sum, placements) => sum + placements.length, 0);
  const clueRate = encounter ? 0.55 : ambientCount >= activePoints.length * 4 ? 0.2 : 0.05;
  const clueVisible = deterministicRoll(state.worldSeed, id, "clue") < clueRate;

  return {
    id,
    treeId: tree.id,
    committed: false,
    day: state.day,
    visitIndex: state.exploration.visitIndex,
    period,
    startedAtMinutes: state.timeMinutes,
    resolvedAtMinutes: resolvedMinutes(state),
    currentPointId: activePoints[0].id,
    examinedPointIds: [],
    catchableEncounter: encounter && encounterPoint
      ? {
          id: `${id}:encounter`,
          pointId: encounterPoint.id,
          insectId: encounter.insectId,
          sizeMm: encounter.sizeMm,
          rankingEligible: !encounter.boostAssisted,
          caught: false,
          x: 0.2 + deterministicRoll(state.worldSeed, id, "encounter-x") * 0.6,
          y: 0.2 + deterministicRoll(state.worldSeed, id, "encounter-y") * 0.58,
        }
      : undefined,
    ambientByPointId,
    clueVisible,
    returnPosition: {
      x: state.field.x,
      y: state.field.y,
      facing: state.field.facing,
    },
  };
};

export const commitInspectionSession = (
  session: TreeInspectionSession,
  state: GameState,
): TreeInspectionSession => {
  const tree = treeById[session.treeId];
  const activePoints = tree.inspectionPoints.filter(
    (point) => !point.activePeriods || point.activePeriods.includes(session.period),
  );
  const primary = activePoints.find((point) => point.id === tree.primaryPointId) ?? activePoints[0];
  return {
    ...session,
    committed: true,
    startedAtMinutes: state.timeMinutes,
    resolvedAtMinutes: resolvedMinutes(state),
    currentPointId: primary.id,
    examinedPointIds: session.examinedPointIds.includes(primary.id)
      ? session.examinedPointIds
      : [...session.examinedPointIds, primary.id],
    returnPosition: {
      x: state.field.x,
      y: state.field.y,
      facing: state.field.facing,
    },
  };
};

export const getCurrentTreeSession = (
  state: GameState,
  tree: TreeDefinition,
): TreeInspectionSession | undefined => state.inspectionSessions[getInspectionSessionId(state, tree)];

export const isInspectionPointUnlocked = (
  session: TreeInspectionSession,
  point: TreeInspectionPoint,
): boolean => !point.unlockAfterPointId || session.examinedPointIds.includes(point.unlockAfterPointId);

export const activeInspectionPoints = (
  session: TreeInspectionSession,
  tree = treeById[session.treeId],
): TreeInspectionPoint[] => tree.inspectionPoints.filter(
  (point) => (!point.activePeriods || point.activePeriods.includes(session.period)) &&
    isInspectionPointUnlocked(session, point),
);

export const isInspectionComplete = (
  session: TreeInspectionSession,
  tree = treeById[session.treeId],
): boolean => tree.inspectionPoints
  .filter((point) => !point.activePeriods || point.activePeriods.includes(session.period))
  .every((point) => session.examinedPointIds.includes(point.id));
