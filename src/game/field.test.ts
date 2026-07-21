import { describe, expect, it } from "vitest";
import { fieldById, fields, type FieldDefinition } from "../data/fields";
import { locationById } from "../data/locations";
import {
  PLAYER_RADIUS,
  findNearestInteractionTarget,
  findTriggeredEdgeExit,
  getBoundarySegments,
  getCameraOffset,
  getFieldCollisionRects,
  isAtEdgeExit,
  isPositionWalkable,
  moveWithCollisions,
  normalizeMovement,
} from "./field";

describe("field movement", () => {
  it("normalizes diagonal input without making diagonal movement faster", () => {
    const movement = normalizeMovement(1, 1);
    expect(Math.hypot(movement?.x ?? 0, movement?.y ?? 0)).toBeCloseTo(1);
    expect(movement?.facing).toBe("down");
  });

  it("stops at obstacles and slides along their free edge", () => {
    const field = { width: 240, height: 240 };
    const obstacle = [{ x: 100, y: 70, width: 40, height: 100 }];
    const current = { x: 78, y: 100 };
    expect(moveWithCollisions(current, { x: 12, y: 0 }, field, obstacle)).toEqual(current);
    const sliding = moveWithCollisions(current, { x: 12, y: -20 }, field, obstacle);
    expect(sliding.y).toBeCloseTo(80);
    expect(sliding.x).toBeLessThanOrEqual(82);
  });

  it("does not tunnel through a thin fence with a large D-pad step", () => {
    const field = { width: 240, height: 240 };
    const thinFence = [{ x: 100, y: 0, width: 4, height: 240 }];
    const moved = moveWithCollisions({ x: 75, y: 120 }, { x: 36, y: 0 }, field, thinFence);
    expect(moved.x).toBeLessThan(100 - PLAYER_RADIUS);
  });

  it("clamps the camera at every field edge", () => {
    const field = { width: 1000, height: 800 };
    const viewport = { width: 360, height: 640 };
    expect(getCameraOffset({ x: 20, y: 20 }, viewport, field)).toEqual({ x: 0, y: 0 });
    expect(getCameraOffset({ x: 980, y: 780 }, viewport, field)).toEqual({ x: 640, y: 160 });
  });

  it("chooses only the nearest interaction target inside the action radius", () => {
    const targets = [{ id: "far", x: 100, y: 0 }, { id: "near", x: 35, y: 0 }];
    expect(findNearestInteractionTarget({ x: 0, y: 0 }, targets)?.id).toBe("near");
    expect(findNearestInteractionTarget({ x: 300, y: 300 }, targets)).toBeNull();
  });

  it("triggers an edge only from its opening with outward movement", () => {
    const field: Pick<FieldDefinition, "width" | "height" | "exits"> = {
      width: 400,
      height: 300,
      exits: [{
        id: "top",
        label: "上へ",
        side: "top",
        rangeStart: 140,
        rangeEnd: 260,
        toFieldId: "grandma-house",
        toSpawnId: "start",
        travelMinutes: 5,
      }],
    };
    const available = new Set(["top"]);
    expect(findTriggeredEdgeExit({ x: 200, y: 20 }, { x: 0, y: -4 }, field, available)?.id).toBe("top");
    expect(findTriggeredEdgeExit({ x: 80, y: 20 }, { x: 0, y: -4 }, field, available)).toBeNull();
    expect(findTriggeredEdgeExit({ x: 200, y: 20 }, { x: 0, y: 4 }, field, available)).toBeNull();
    expect(findTriggeredEdgeExit({ x: 200, y: 20 }, { x: 0, y: -4 }, field, new Set())).toBeNull();
  });

  it("adds a solid collision rectangle when an exit is closed", () => {
    const field = fieldById["grandma-house"];
    const exit = field.exits.find((candidate) => candidate.id === "to-paddy")!;
    const open = getFieldCollisionRects(field);
    const closed = getFieldCollisionRects(field, [exit.id]);
    expect(closed.length).toBe(open.length + 1);
    expect(isPositionWalkable(
      { x: field.width - PLAYER_RADIUS, y: (exit.rangeStart + exit.rangeEnd) / 2 },
      field,
      closed,
    )).toBe(false);
  });
});

describe("field data", () => {
  it("has valid safe spawns, destinations, opening widths, and tree positions", () => {
    for (const field of fields) {
      const obstacles = getFieldCollisionRects(field);
      const spawnIds = new Set(field.spawnPoints.map((spawn) => spawn.id));
      expect(spawnIds.size, `${field.id}: duplicate spawn ID`).toBe(field.spawnPoints.length);
      for (const spawn of field.spawnPoints) {
        expect(isPositionWalkable(spawn, field, obstacles), `${field.id}:${spawn.id} must be walkable`).toBe(true);
      }
      for (const exit of field.exits) {
        expect(exit.rangeEnd - exit.rangeStart, `${field.id}:${exit.id} opening width`).toBeGreaterThanOrEqual(72);
        const destination = fieldById[exit.toFieldId];
        expect(destination.spawnPoints.some((spawn) => spawn.id === exit.toSpawnId), `${field.id}:${exit.id} destination spawn`).toBe(true);
      }
      if (field.locationId) {
        expect(field.hotspots.map((hotspot) => hotspot.spotId).sort()).toEqual(
          locationById[field.locationId].hotspots.map((hotspot) => hotspot.id).sort(),
        );
      } else expect(field.hotspots).toEqual([]);
    }
  });

  it("keeps every edge opening reachable from every spawn", () => {
    const step = 28;
    const directions = [{ x: step, y: 0 }, { x: -step, y: 0 }, { x: 0, y: step }, { x: 0, y: -step }];
    for (const field of fields) {
      const obstacles = getFieldCollisionRects(field);
      for (const spawn of field.spawnPoints) {
        const remaining = new Set(field.exits.map((exit) => exit.id));
        const queue = [{ x: spawn.x, y: spawn.y }];
        const visited = new Set([`${spawn.x}:${spawn.y}`]);
        for (let index = 0; index < queue.length && remaining.size > 0; index += 1) {
          const point = queue[index];
          for (const exit of field.exits) {
            const facing = exit.side === "top" ? "up" : exit.side === "bottom" ? "down" : exit.side;
            if (isAtEdgeExit(point, facing, exit, field, step + 3)) remaining.delete(exit.id);
          }
          for (const direction of directions) {
            const next = moveWithCollisions(point, direction, field, obstacles);
            if (next.x === point.x && next.y === point.y) continue;
            const key = `${Math.round(next.x)}:${Math.round(next.y)}`;
            if (!visited.has(key)) {
              visited.add(key);
              queue.push(next);
            }
          }
        }
        expect([...remaining], `${field.id}:${spawn.id} has unreachable exits`).toEqual([]);
      }
    }
  });

  it("uses exactly the eight bidirectional links in the main loop", () => {
    const mainIds = [
      "grandma-house",
      "paddy-road",
      "shrine",
      "bamboo-grove",
      "school",
      "oak-forest",
      "mixed-forest",
      "forest-road",
    ] as const;
    const expected = new Set([
      "grandma-house|paddy-road",
      "paddy-road|shrine",
      "bamboo-grove|shrine",
      "bamboo-grove|school",
      "oak-forest|school",
      "mixed-forest|oak-forest",
      "forest-road|mixed-forest",
      "forest-road|grandma-house",
    ]);
    const actual = new Set<string>();
    for (const id of mainIds) {
      for (const exit of fieldById[id].exits) {
        if (!mainIds.includes(exit.toFieldId as typeof mainIds[number])) continue;
        actual.add([id, exit.toFieldId].sort().join("|"));
        expect(fieldById[exit.toFieldId].exits.some((reverse) => reverse.toFieldId === id)).toBe(true);
      }
    }
    expect(actual).toEqual(expected);
  });

  it("renders visible boundaries everywhere except available openings", () => {
    for (const field of fields) {
      const open = new Set(field.exits.map((exit) => exit.id));
      const segments = getBoundarySegments(field, open);
      expect(segments.length).toBeGreaterThanOrEqual(4);
      expect(segments.every((segment) => segment.width > 0 && segment.height > 0)).toBe(true);
    }
  });
});
