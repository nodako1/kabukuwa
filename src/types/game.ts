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
}

export type Outcome =
  | { type: "empty"; spotId: string; text: string }
  | { type: "caught"; specimen: Specimen; isPersonalBest: boolean }
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
  schemaVersion: 2;
  contentVersion: 2;
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
  pendingOutcome?: Outcome;
}

export type AdRewardKind = "appearance" | "duration" | "hint";

export type GameCommand =
  | { type: "MOVE"; locationId: LocationId }
  | { type: "FOCUS_SPOT"; spotId: string }
  | { type: "INSPECT_SPOT"; spotId?: string }
  | { type: "TALK"; npcId: NpcId }
  | { type: "TRAVEL_EXIT"; exitId: string }
  | {
      type: "SYNC_PLAYER_POSITION";
      x: number;
      y: number;
      facing: FacingDirection;
    }
  | { type: "RESET_PLAYER_POSITION" }
  | { type: "DISMISS_FIELD_TUTORIAL" }
  | { type: "REST"; minutes: 30 | 60 }
  | { type: "APPLY_AD_REWARD"; reward: AdRewardKind }
  | { type: "ACKNOWLEDGE_OUTCOME" }
  | { type: "COMPLETE_PICKUP" }
  | { type: "START_NEXT_DAY" }
  | { type: "RESET_GAME"; seed?: string };
