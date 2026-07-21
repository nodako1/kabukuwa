export type LocationId =
  | "grandma-house"
  | "backyard"
  | "shrine"
  | "mixed-forest"
  | "oak-forest"
  | "bamboo-grove"
  | "school"
  | "secret-forest";

export type FieldId =
  | LocationId
  | "paddy-road"
  | "forest-road"
  | "secret-path";

export type FacingDirection = "up" | "down" | "left" | "right";

export type TimePeriod = "morning" | "day" | "evening" | "night";
export type GamePhase = "day" | "pickup" | "evening" | "day-ended";
export type SpotKind = "tree" | "sap" | "banana-trap" | "light-trap";
export type InspectionSceneKind =
  | "sap"
  | "bark-crack"
  | "root"
  | "banana-trap"
  | "light-trap";
export type AmbientInsectId =
  | "green-bottle"
  | "black-bottle"
  | "butterfly"
  | "moth"
  | "ant"
  | "gnat"
  | "pillbug";
export type InsectId =
  | "japanese-rhino"
  | "saw-stag"
  | "miyama-stag"
  | "giant-stag"
  | "atlas-beetle";
export type NpcId =
  | "grandma"
  | "shrine-keeper"
  | "professor"
  | "rival"
  | "candy-shopkeeper";

export type DailyNatureId =
  | "lively-sap"
  | "quiet-roots"
  | "forest-evening"
  | "sweet-breeze"
  | "moths-at-light"
  | "still-summer";

export type ObservationThemeId =
  | "inspect-three-trees"
  | "look-high-and-low"
  | "trust-your-eyes"
  | "visit-two-woods"
  | "listen-to-someone"
  | "check-a-trap"
  | "complete-one-tree"
  | "walk-the-loop";

export interface DailyPlan {
  day: number;
  natureId: DailyNatureId;
  themeId: ObservationThemeId;
  rumorNpcId: NpcId;
  rumorId: string;
}

export interface ObservationProgress {
  day: number;
  inspectedTreeIds: string[];
  examinedPointIds: string[];
  visitedFieldIds: FieldId[];
  talkedNpcIds: NpcId[];
  ambientInsectIds: AmbientInsectId[];
  capturedSpecimenIds: string[];
  inspectedWithoutClueTreeIds: string[];
  checkedTrapTreeIds: string[];
  completed: boolean;
  completedAtMinutes?: number;
}

export interface ObservationJournalEntry {
  day: number;
  natureId: DailyNatureId;
  themeId: ObservationThemeId;
  themeCompleted: boolean;
  rumorNpcId?: NpcId;
  rumorId?: string;
  inspectedTreeIds: string[];
  examinedPointIds: string[];
  visitedFieldIds: FieldId[];
  talkedNpcIds: NpcId[];
  ambientInsectIds: AmbientInsectId[];
  capturedSpecimenIds: string[];
  largestSpecimenId?: string;
  firstCatchInsectIds: InsectId[];
  stampId?: string;
  diaryLines: string[];
}

export interface HotspotDefinition {
  id: string;
  label: string;
  kind: SpotKind;
  x: number;
  y: number;
  activePeriods?: TimePeriod[];
}

export interface LocationDefinition {
  id: LocationId;
  name: string;
  mapLabel: string;
  description: string;
  travelMinutes: number;
  hotspots: HotspotDefinition[];
  daytimeOnly?: boolean;
  secret?: boolean;
}

export interface AppearanceRule {
  locations: LocationId[];
  periods: TimePeriod[];
  chance: number;
  spotKinds?: SpotKind[];
}

export interface InsectDefinition {
  id: InsectId;
  name: string;
  family: "カブトムシ" | "クワガタムシ";
  rarity: 1 | 2 | 3 | 4 | 5;
  minSizeMm: number;
  maxSizeMm: number;
  hint: string;
  appearances: AppearanceRule[];
}

export interface NpcSchedule {
  locationId: LocationId;
  startMinutes: number;
  endMinutes: number;
  days?: "all" | "odd" | "even";
}

export interface NpcDefinition {
  id: NpcId;
  name: string;
  role: string;
  color: string;
  schedules: NpcSchedule[];
  dialogues: string[];
}

export interface Specimen {
  id: string;
  insectId: InsectId;
  sizeMm: number;
  day: number;
  caughtAtMinutes: number;
  locationId: LocationId;
  spotId: string;
  treeId?: string;
  inspectionPointId?: string;
  rankingEligible: boolean;
}

export interface ExplorationState {
  locationId: LocationId;
  visitIndex: number;
  period: TimePeriod;
  focusedSpotId?: string;
  searchedSpotIds: string[];
}

export interface PlayerFieldState {
  fieldId: FieldId;
  x: number;
  y: number;
  facing: FacingDirection;
  lastSafeX: number;
  lastSafeY: number;
  discoveredFieldIds: FieldId[];
  lastTransitionToken?: string;
}

export interface TreeInspectionPoint {
  id: string;
  label: string;
  sceneKind: InspectionSceneKind;
  unlockAfterPointId?: string;
  activePeriods?: TimePeriod[];
  encounterWeightTags: string[];
}

export interface TreeDefinition {
  id: string;
  legacySpotId: string;
  fieldId: FieldId;
  label: string;
  species: "kunugi" | "konara" | "other";
  x: number;
  y: number;
  primaryPointId: string;
  inspectionPoints: TreeInspectionPoint[];
  clueProfileId: string;
  encounterKind: SpotKind;
  trapKind?: "banana" | "light";
}

export interface AmbientPlacement {
  id: string;
  insectId: AmbientInsectId;
  x: number;
  y: number;
  motion: "still" | "crawl" | "flutter";
}

export interface TreeInspectionSession {
  id: string;
  treeId: string;
  committed: boolean;
  day: number;
  visitIndex: number;
  period: TimePeriod;
  startedAtMinutes: number;
  resolvedAtMinutes: number;
  currentPointId: string;
  examinedPointIds: string[];
  catchableEncounter?: {
    id: string;
    pointId: string;
    insectId: InsectId;
    sizeMm: number;
    rankingEligible: boolean;
    caught: boolean;
    x: number;
    y: number;
  };
  ambientByPointId: Record<string, AmbientPlacement[]>;
  clueVisible: boolean;
  returnPosition: {
    x: number;
    y: number;
    facing: FacingDirection;
  };
}

export interface TrapState {
  kind: "banana" | "light";
  installed: boolean;
}

export type Outcome =
  | { type: "empty"; spotId: string; text: string }
  | { type: "caught"; specimen: Specimen; isPersonalBest: boolean; isFirstCatch?: boolean }
  | { type: "dialogue"; npcId: NpcId; text: string; unlockedSecretRoute: boolean }
  | { type: "notice"; title: string; text: string };

export interface GameFlags {
  secretRouteUnlocked: boolean;
  pickupCompletedDay: number;
  extraHintDay: number;
  fieldTutorialSeen: boolean;
}

export interface GameBuffs {
  appearanceBoostUntil: number;
  nextBoostExtensionMinutes: number;
}

export interface GameState {
  schemaVersion: 4;
  contentVersion: 4;
  rngVersion: 1;
  worldSeed: string;
  revision: number;
  day: number;
  timeMinutes: number;
  phase: GamePhase;
  locationId: LocationId;
  field: PlayerFieldState;
  visitCounters: Partial<Record<LocationId, number>>;
  exploration?: ExplorationState;
  specimens: Specimen[];
  npcTalkCounts: Partial<Record<NpcId, number>>;
  metNpcIds: NpcId[];
  flags: GameFlags;
  buffs: GameBuffs;
  inspectionSessions: Record<string, TreeInspectionSession>;
  activeInspectionSessionId?: string;
  discoveredClueSessionIds: string[];
  caughtEncounterIds: string[];
  trapStates: Record<string, TrapState>;
  dailyPlansByDay: Record<string, DailyPlan>;
  observationProgressByDay: Record<string, ObservationProgress>;
  observationJournalByDay: Record<string, ObservationJournalEntry>;
  heardRumorDays: number[];
  morningBriefSeenDays: number[];
  pendingBoundaryEvent?: "pickup" | "day-ended";
  pendingOutcome?: Outcome;
}

export type AdRewardKind = "appearance" | "duration" | "hint";

export type GameCommand =
  | { type: "OPEN_TREE_INSPECTION"; treeId: string }
  | { type: "VIEW_INSPECTION_POINT"; pointId: string }
  | { type: "CATCH_INSPECTION_ENCOUNTER"; encounterId: string }
  | { type: "CLOSE_TREE_INSPECTION" }
  | {
      type: "DISCOVER_TREE_CLUE";
      treeId: string;
      x: number;
      y: number;
      facing: FacingDirection;
    }
  | { type: "TALK"; npcId: NpcId }
  | {
      type: "TRAVEL_EDGE";
      exitId: string;
      x: number;
      y: number;
      facing: FacingDirection;
      transitionToken: string;
    }
  | {
      type: "SYNC_PLAYER_POSITION";
      x: number;
      y: number;
      facing: FacingDirection;
    }
  | { type: "RESET_PLAYER_POSITION" }
  | { type: "DISMISS_FIELD_TUTORIAL" }
  | { type: "DISMISS_MORNING_BRIEF" }
  | { type: "REST"; minutes: 30 | 60 }
  | { type: "APPLY_AD_REWARD"; reward: AdRewardKind }
  | { type: "ACKNOWLEDGE_OUTCOME" }
  | { type: "COMPLETE_PICKUP" }
  | { type: "START_NEXT_DAY" }
  | { type: "RESET_GAME"; seed?: string };
