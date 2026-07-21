import { describe, expect, it } from "vitest";
import { fieldById, fields } from "../data/fields";
import { locationById } from "../data/locations";
import {
  INTERACTION_RADIUS,
  distanceBetween,
  findNearestInteractionTarget,
  getCameraOffset,
  getFieldCollisionRects,
  isPositionWalkable,
  moveWithCollisions,
  normalizeMovement,
} from "./field";

describe("field movement", () => {
  it("normalizes diagonal input without making diagonal movement faster", () => {
    const movement = normalizeMovement(1, 1);
    expect(movement).not.toBeNull();
    expect(Math.hypot(movement?.x ?? 0, movement?.y ?? 0)).toBeCloseTo(1);
    expect(movement?.facing).toBe("down");
  });

  it("stops at obstacles and slides along their free edge", () => {
    const field = { width: 240, height: 240 };
    const obstacle = [{ x: 100, y: 70, width: 40, height: 100 }];
    const current = { x: 78, y: 100 };
    expect(moveWithCollisions(current, { x: 12, y: 0 }, field, obstacle)).toEqual(current);
    expect(moveWithCollisions(current, { x: 12, y: -20 }, field, obstacle)).toEqual({ x: 78, y: 80 });
  });

  it("clamps the camera at every field edge", () => {
    const field = { width: 1_000, height: 800 };
    const viewport = { width: 360, height: 640 };
    expect(getCameraOffset({ x: 20, y: 20 }, viewport, field)).toEqual({ x: 0, y: 0 });
    expect(getCameraOffset({ x: 980, y: 780 }, viewport, field)).toEqual({ x: 640, y: 160 });
  });

  it("chooses only the nearest interaction target inside the action radius", () => {
    const targets = [
      { id: "far", x: 100, y: 0 },
      { id: "near", x: 35, y: 0 },
    ];
    expect(findNearestInteractionTarget({ x: 0, y: 0 }, targets)?.id).toBe("near");
    expect(findNearestInteractionTarget({ x: 300, y: 300 }, targets)).toBeNull();
  });
});

describe("field data", () => {
  it("has valid safe spawns, exits, and one position per collection hotspot", () => {
    for (const field of fields) {
      const obstacles = getFieldCollisionRects(field);
      const spawnIds = new Set(field.spawnPoints.map((spawn) => spawn.id));
      expect(spawnIds.size, `${field.id}: duplicate spawn ID`).toBe(field.spawnPoints.length);
      for (const spawn of field.spawnPoints) {
        expect(
          isPositionWalkable(spawn, field, obstacles),
          `${field.id}:${spawn.id} must be walkable`,
        ).toBe(true);
      }
      for (const exit of field.exits) {
        const destination = fieldById[exit.toFieldId];
        expect(destination, `${field.id}:${exit.id} target`).toBeDefined();
        expect(
          destination.spawnPoints.some((spawn) => spawn.id === exit.toSpawnId),
          `${field.id}:${exit.id} destination spawn`,
        ).toBe(true);
      }
      if (field.locationId) {
        const actual = field.hotspots.map((hotspot) => hotspot.spotId).sort();
        const expected = locationById[field.locationId].hotspots.map((hotspot) => hotspot.id).sort();
        expect(actual, `${field.id}: hotspot positions`).toEqual(expected);
      } else {
        expect(field.hotspots).toEqual([]);
      }
    }
  });

  it("keeps every exit reachable from every spawn", () => {
    const step = 32;
    const directions = [
      { x: step, y: 0 },
      { x: -step, y: 0 },
      { x: 0, y: step },
      { x: 0, y: -step },
    ];

    for (const field of fields) {
      const obstacles = getFieldCollisionRects(field);
      for (const spawn of field.spawnPoints) {
        const remaining = new Set(field.exits.map((exit) => exit.id));
        const queue: { x: number; y: number }[] = [{ x: spawn.x, y: spawn.y }];
        const visited = new Set([`${spawn.x}:${spawn.y}`]);

        for (let index = 0; index < queue.length && remaining.size > 0; index += 1) {
          const point = queue[index];
          for (const exit of field.exits) {
            if (distanceBetween(point, exit) < INTERACTION_RADIUS) remaining.delete(exit.id);
          }
          for (const direction of directions) {
            const next = moveWithCollisions(point, direction, field, obstacles);
            if (next.x === point.x && next.y === point.y) continue;
            const key = `${next.x}:${next.y}`;
            if (!visited.has(key)) {
              visited.add(key);
              queue.push(next);
            }
          }
        }

        expect(
          [...remaining],
          `${field.id}:${spawn.id} has unreachable exits`,
        ).toEqual([]);
      }
    }
  });
});
