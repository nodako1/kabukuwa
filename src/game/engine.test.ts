import { describe, expect, it } from "vitest";
import { insects } from "../data/insects";
import { locationById } from "../data/locations";
import type { GameState } from "../types/game";
import { createInitialGame, gameReducer } from "./engine";
import { isLocationAvailable, rollEncounter } from "./rules";

const stateAt = (overrides: Partial<GameState>): GameState => ({
  ...createInitialGame("test-summer"),
  ...overrides,
});

describe("game engine", () => {
  it("starts at grandma's house at 6:00", () => {
    const state = createInitialGame("fixed");
    expect(state.day).toBe(1);
    expect(state.timeMinutes).toBe(360);
    expect(state.locationId).toBe("grandma-house");
    expect(state.phase).toBe("day");
  });

  it("interrupts a remote action at 18:00, then returns home at 18:15", () => {
    const remote = stateAt({
      timeMinutes: 1065,
      locationId: "mixed-forest",
      visitCounters: { "mixed-forest": 1 },
      exploration: {
        locationId: "mixed-forest",
        visitIndex: 1,
        period: "evening",
        searchedSpotIds: [],
      },
    });

    const pickup = gameReducer(remote, { type: "REST", minutes: 30 });
    expect(pickup.phase).toBe("pickup");
    expect(pickup.timeMinutes).toBe(1080);
    expect(pickup.locationId).toBe("mixed-forest");

    const home = gameReducer(pickup, { type: "COMPLETE_PICKUP" });
    expect(home.phase).toBe("evening");
    expect(home.timeMinutes).toBe(1095);
    expect(home.locationId).toBe("grandma-house");
    expect(home.flags.pickupCompletedDay).toBe(1);
  });

  it("does not trigger pickup when already at home", () => {
    const home = stateAt({ timeMinutes: 1065, locationId: "grandma-house" });
    const evening = gameReducer(home, { type: "REST", minutes: 30 });
    expect(evening.phase).toBe("evening");
    expect(evening.timeMinutes).toBe(1095);
    expect(evening.locationId).toBe("grandma-house");
  });

  it("still triggers pickup when a remote-to-home move crosses 18:00", () => {
    const remote = stateAt({
      timeMinutes: 1065,
      locationId: "mixed-forest",
      visitCounters: { "mixed-forest": 1 },
      exploration: {
        locationId: "mixed-forest",
        visitIndex: 1,
        period: "evening",
        searchedSpotIds: [],
      },
    });
    const pickup = gameReducer(remote, { type: "MOVE", locationId: "grandma-house" });
    expect(pickup.phase).toBe("pickup");
    expect(pickup.timeMinutes).toBe(1080);
    expect(pickup.locationId).toBe("mixed-forest");
  });

  it("allows only the house and backyard after 18:00", () => {
    const night = stateAt({ timeMinutes: 1095, phase: "evening" });
    expect(isLocationAvailable(night, "backyard").available).toBe(true);
    expect(isLocationAvailable(night, "grandma-house").available).toBe(true);
    expect(isLocationAvailable(night, "shrine").available).toBe(false);
  });

  it("ends the day at 20:00 and preserves the collection into the next day", () => {
    const state = stateAt({ timeMinutes: 1185, phase: "evening", locationId: "backyard" });
    const ended = gameReducer(state, { type: "REST", minutes: 30 });
    expect(ended.timeMinutes).toBe(1200);
    expect(ended.phase).toBe("day-ended");

    const next = gameReducer(ended, { type: "START_NEXT_DAY" });
    expect(next.day).toBe(2);
    expect(next.timeMinutes).toBe(360);
    expect(next.locationId).toBe("grandma-house");
  });

  it("unlocks the secret route after the shrine keeper's third conversation", () => {
    let state = stateAt({ timeMinutes: 360, locationId: "shrine" });
    state = gameReducer(state, { type: "TALK", npcId: "shrine-keeper" });
    state = gameReducer(state, { type: "ACKNOWLEDGE_OUTCOME" });
    state = gameReducer(state, { type: "TALK", npcId: "shrine-keeper" });
    state = gameReducer(state, { type: "ACKNOWLEDGE_OUTCOME" });
    state = gameReducer(state, { type: "TALK", npcId: "shrine-keeper" });

    expect(state.npcTalkCounts["shrine-keeper"]).toBe(3);
    expect(state.flags.secretRouteUnlocked).toBe(true);

    const atFour = { ...state, timeMinutes: 960, pendingOutcome: undefined };
    const beforeFour = { ...state, timeMinutes: 959, pendingOutcome: undefined };
    expect(isLocationAvailable(atFour, "secret-forest").available).toBe(true);
    expect(isLocationAvailable(beforeFour, "secret-forest").available).toBe(false);
  });

  it("keeps a non-zero daytime rate for the giant stag", () => {
    const giantStag = insects.find((insect) => insect.id === "giant-stag");
    const daytimeRule = giantStag?.appearances.find((rule) => rule.periods.includes("day"));
    expect(daytimeRule?.chance).toBe(0.005);
  });

  it("refreshes the encounter period when time crosses a period boundary", () => {
    const morning = stateAt({
      timeMinutes: 585,
      locationId: "backyard",
      visitCounters: { backyard: 1 },
      exploration: {
        locationId: "backyard",
        visitIndex: 1,
        period: "morning",
        focusedSpotId: "backyard-tree-1",
        searchedSpotIds: ["backyard-tree-1"],
      },
    });
    const daytime = gameReducer(morning, { type: "REST", minutes: 30 });
    expect(daytime.exploration?.period).toBe("day");
    expect(daytime.exploration?.focusedSpotId).toBeUndefined();
    expect(daytime.exploration?.searchedSpotIds).toEqual([]);

    const lateHome = stateAt({ timeMinutes: 1065, locationId: "grandma-house" });
    const nightBackyard = gameReducer(lateHome, { type: "MOVE", locationId: "backyard" });
    expect(nightBackyard.phase).toBe("evening");
    expect(nightBackyard.timeMinutes).toBe(1080);
    expect(nightBackyard.exploration?.period).toBe("night");
  });

  it("uses the current night period even if an old exploration snapshot is stale", () => {
    const lightTrap = locationById.backyard.hotspots.find((spot) => spot.id === "backyard-light")!;
    let foundAtlas = false;
    for (let index = 0; index < 2_000 && !foundAtlas; index += 1) {
      const stale = stateAt({
        worldSeed: `night-${index}`,
        timeMinutes: 1095,
        phase: "evening",
        locationId: "backyard",
        visitCounters: { backyard: 1 },
        exploration: {
          locationId: "backyard",
          visitIndex: 1,
          period: "morning",
          searchedSpotIds: [],
        },
      });
      foundAtlas = rollEncounter(stale, lightTrap)?.insectId === "atlas-beetle";
    }
    expect(foundAtlas).toBe(true);
  });

  it("repeats an encounter for the same seed and saved visit", () => {
    const state = stateAt({
      worldSeed: "repeatable",
      timeMinutes: 600,
      locationId: "oak-forest",
      visitCounters: { "oak-forest": 3 },
      exploration: {
        locationId: "oak-forest",
        visitIndex: 3,
        period: "day",
        searchedSpotIds: [],
      },
    });
    const spot = locationById["oak-forest"].hotspots[0];
    expect(rollEncounter(state, spot)).toEqual(rollEncounter(structuredClone(state), spot));
  });

  it("never lets an appearance boost alter specimen size", () => {
    const spot = locationById["oak-forest"].hotspots[0];
    let matchingPair: [ReturnType<typeof rollEncounter>, ReturnType<typeof rollEncounter>] | null = null;

    for (let index = 0; index < 10_000 && !matchingPair; index += 1) {
      const base = stateAt({
        worldSeed: `size-${index}`,
        timeMinutes: 600,
        locationId: "oak-forest",
        visitCounters: { "oak-forest": 1 },
        exploration: {
          locationId: "oak-forest",
          visitIndex: 1,
          period: "day",
          searchedSpotIds: [],
        },
      });
      const normal = rollEncounter(base, spot);
      const boosted = rollEncounter(
        { ...base, buffs: { ...base.buffs, appearanceBoostUntil: 720 } },
        spot,
      );
      if (normal && boosted && normal.insectId === boosted.insectId) matchingPair = [normal, boosted];
    }

    expect(matchingPair).not.toBeNull();
    expect(matchingPair?.[0]?.sizeMm).toBe(matchingPair?.[1]?.sizeMm);
  });

  it("makes boosted encounters a superset of normal encounters", () => {
    const spot = locationById["oak-forest"].hotspots[0];
    let sawBoostOnlyEncounter = false;
    for (let index = 0; index < 2_000; index += 1) {
      const base = stateAt({
        worldSeed: `monotonic-${index}`,
        timeMinutes: 600,
        locationId: "oak-forest",
        visitCounters: { "oak-forest": 1 },
        exploration: {
          locationId: "oak-forest",
          visitIndex: 1,
          period: "day",
          searchedSpotIds: [],
        },
      });
      const normal = rollEncounter(base, spot);
      const boosted = rollEncounter(
        { ...base, buffs: { ...base.buffs, appearanceBoostUntil: 720 } },
        spot,
      );
      if (normal) {
        expect(boosted).not.toBeNull();
        expect(boosted?.insectId).toBe(normal.insectId);
        expect(boosted?.sizeMm).toBe(normal.sizeMm);
        expect(boosted?.boostAssisted).toBe(false);
      } else if (boosted) {
        sawBoostOnlyEncounter = true;
        expect(boosted.boostAssisted).toBe(true);
      }
    }
    expect(sawBoostOnlyEncounter).toBe(true);
  });

  it("blocks all gameplay commands until the current outcome is acknowledged", () => {
    const state = stateAt({
      locationId: "shrine",
      pendingOutcome: { type: "notice", title: "確認", text: "結果表示中" },
    });
    const attemptedTalk = gameReducer(state, { type: "TALK", npcId: "shrine-keeper" });
    expect(attemptedTalk).toBe(state);
    expect(attemptedTalk.timeMinutes).toBe(360);
    expect(attemptedTalk.npcTalkCounts["shrine-keeper"]).toBeUndefined();
  });

  it("does not offer a secret-forest trip that would arrive at 18:00", () => {
    const unlocked = stateAt({
      timeMinutes: 1065,
      locationId: "shrine",
      flags: { secretRouteUnlocked: true, pickupCompletedDay: 0, extraHintDay: 0 },
    });
    expect(isLocationAvailable(unlocked, "secret-forest").available).toBe(false);
  });
});
