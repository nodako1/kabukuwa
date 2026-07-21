import type { EdgeExit, FieldDefinition } from "../data/fields";
import { locationById } from "../data/locations";
import type { FacingDirection } from "../types/game";

export interface Point {
  x: number;
  y: number;
}

export interface MovementVector extends Point {
  facing: FacingDirection;
}

export interface CollisionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const PLAYER_RADIUS = 18;
export const PLAYER_SPEED = 220;
export const INTERACTION_RADIUS = 96;

export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(value, maximum));

export const normalizeMovement = (x: number, y: number): MovementVector | null => {
  const length = Math.hypot(x, y);
  if (length < 0.01) return null;
  const normalizedX = x / Math.max(1, length);
  const normalizedY = y / Math.max(1, length);
  const facing: FacingDirection =
    Math.abs(normalizedX) > Math.abs(normalizedY)
      ? normalizedX > 0
        ? "right"
        : "left"
      : normalizedY > 0
        ? "down"
        : "up";
  return { x: normalizedX, y: normalizedY, facing };
};

export const circleTouchesRect = (
  point: Point,
  radius: number,
  rect: CollisionRect,
): boolean => {
  const closestX = clamp(point.x, rect.x, rect.x + rect.width);
  const closestY = clamp(point.y, rect.y, rect.y + rect.height);
  const distanceX = point.x - closestX;
  const distanceY = point.y - closestY;
  return distanceX * distanceX + distanceY * distanceY < radius * radius;
};

export const isPositionWalkable = (
  point: Point,
  field: Pick<FieldDefinition, "width" | "height">,
  obstacles: CollisionRect[],
  radius = PLAYER_RADIUS,
): boolean =>
  point.x >= radius &&
  point.y >= radius &&
  point.x <= field.width - radius &&
  point.y <= field.height - radius &&
  !obstacles.some((obstacle) => circleTouchesRect(point, radius, obstacle));

export const moveWithCollisions = (
  current: Point,
  delta: Point,
  field: Pick<FieldDefinition, "width" | "height">,
  obstacles: CollisionRect[],
): Point => {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / 8));
  const step = { x: delta.x / steps, y: delta.y / steps };
  let position = current;
  for (let index = 0; index < steps; index += 1) {
    const nextX = {
      x: clamp(position.x + step.x, PLAYER_RADIUS, field.width - PLAYER_RADIUS),
      y: position.y,
    };
    const afterX = isPositionWalkable(nextX, field, obstacles) ? nextX : position;
    const nextY = {
      x: afterX.x,
      y: clamp(position.y + step.y, PLAYER_RADIUS, field.height - PLAYER_RADIUS),
    };
    position = isPositionWalkable(nextY, field, obstacles) ? nextY : afterX;
  }
  return position;
};

const exitCoordinate = (point: Point, exit: EdgeExit): number =>
  exit.side === "top" || exit.side === "bottom" ? point.x : point.y;

export const facingForExit = (exit: EdgeExit): FacingDirection => {
  if (exit.side === "top") return "up";
  if (exit.side === "bottom") return "down";
  return exit.side;
};

export const isAtEdgeExit = (
  point: Point,
  facing: FacingDirection,
  exit: EdgeExit,
  field: Pick<FieldDefinition, "width" | "height">,
  tolerance = 5,
): boolean => {
  if (facing !== facingForExit(exit)) return false;
  const coordinate = exitCoordinate(point, exit);
  if (coordinate < exit.rangeStart || coordinate > exit.rangeEnd) return false;
  if (exit.side === "left") return point.x <= PLAYER_RADIUS + tolerance;
  if (exit.side === "right") return point.x >= field.width - PLAYER_RADIUS - tolerance;
  if (exit.side === "top") return point.y <= PLAYER_RADIUS + tolerance;
  return point.y >= field.height - PLAYER_RADIUS - tolerance;
};

export const findTriggeredEdgeExit = (
  current: Point,
  delta: Point,
  field: Pick<FieldDefinition, "width" | "height" | "exits">,
  availableExitIds: ReadonlySet<string>,
): EdgeExit | null => {
  if (Math.abs(delta.x) < 0.001 && Math.abs(delta.y) < 0.001) return null;
  const next = { x: current.x + delta.x, y: current.y + delta.y };
  const horizontal = Math.abs(delta.x) > Math.abs(delta.y);
  const facing: FacingDirection = horizontal
    ? delta.x < 0 ? "left" : "right"
    : delta.y < 0 ? "up" : "down";
  return field.exits.find((exit) => {
    if (!availableExitIds.has(exit.id) || facingForExit(exit) !== facing) return false;
    const coordinate = exitCoordinate(next, exit);
    if (coordinate < exit.rangeStart || coordinate > exit.rangeEnd) return false;
    if (exit.side === "left") return current.x >= PLAYER_RADIUS && next.x <= PLAYER_RADIUS;
    if (exit.side === "right") return current.x <= field.width - PLAYER_RADIUS && next.x >= field.width - PLAYER_RADIUS;
    if (exit.side === "top") return current.y >= PLAYER_RADIUS && next.y <= PLAYER_RADIUS;
    return current.y <= field.height - PLAYER_RADIUS && next.y >= field.height - PLAYER_RADIUS;
  }) ?? null;
};

export const edgeExitAnchor = (
  exit: EdgeExit,
  field: Pick<FieldDefinition, "width" | "height">,
): Point => {
  const center = (exit.rangeStart + exit.rangeEnd) / 2;
  if (exit.side === "top") return { x: center, y: 24 };
  if (exit.side === "bottom") return { x: center, y: field.height - 24 };
  if (exit.side === "left") return { x: 24, y: center };
  return { x: field.width - 24, y: center };
};

export const getCameraOffset = (
  player: Point,
  viewport: { width: number; height: number },
  field: Pick<FieldDefinition, "width" | "height">,
): Point => ({
  x: clamp(player.x - viewport.width / 2, 0, Math.max(0, field.width - viewport.width)),
  y: clamp(player.y - viewport.height / 2, 0, Math.max(0, field.height - viewport.height)),
});

export const distanceBetween = (left: Point, right: Point): number =>
  Math.hypot(left.x - right.x, left.y - right.y);

export const findNearestInteractionTarget = <Target extends Point>(
  player: Point,
  targets: readonly Target[],
  radius = INTERACTION_RADIUS,
): Target | null => {
  let nearest: Target | null = null;
  let nearestDistance = radius;
  for (const target of targets) {
    const distance = distanceBetween(player, target);
    if (distance < nearestDistance) {
      nearest = target;
      nearestDistance = distance;
    }
  }
  return nearest;
};

const closedExitRect = (field: FieldDefinition, exit: EdgeExit): CollisionRect => {
  const thickness = 48;
  if (exit.side === "top") {
    return { x: exit.rangeStart, y: 0, width: exit.rangeEnd - exit.rangeStart, height: thickness };
  }
  if (exit.side === "bottom") {
    return { x: exit.rangeStart, y: field.height - thickness, width: exit.rangeEnd - exit.rangeStart, height: thickness };
  }
  if (exit.side === "left") {
    return { x: 0, y: exit.rangeStart, width: thickness, height: exit.rangeEnd - exit.rangeStart };
  }
  return { x: field.width - thickness, y: exit.rangeStart, width: thickness, height: exit.rangeEnd - exit.rangeStart };
};

export const getFieldCollisionRects = (
  field: FieldDefinition,
  closedExitIds: readonly string[] = [],
): CollisionRect[] => {
  const objectRects = field.objects
    .filter((object) => object.solid)
    .map(({ x, y, width, height }) => ({ x, y, width, height }));

  const closedExitRects = field.exits
    .filter((exit) => closedExitIds.includes(exit.id))
    .map((exit) => closedExitRect(field, exit));

  if (!field.locationId) return [...objectRects, ...closedExitRects];
  const hotspots = locationById[field.locationId].hotspots;
  const treeRects = field.hotspots.flatMap((position) => {
    const hotspot = hotspots.find((candidate) => candidate.id === position.spotId);
    if (!hotspot || (hotspot.kind !== "tree" && hotspot.kind !== "sap")) return [];
    return [{ x: position.x - 20, y: position.y - 8, width: 40, height: 45 }];
  });
  return [...objectRects, ...treeRects, ...closedExitRects];
};

export interface BoundarySegment extends CollisionRect {
  side: EdgeExit["side"];
}

export const getBoundarySegments = (
  field: FieldDefinition,
  openExitIds: ReadonlySet<string>,
): BoundarySegment[] => {
  const thickness = 34;
  const segments: BoundarySegment[] = [];
  const addSide = (side: EdgeExit["side"], length: number) => {
    const openings = field.exits
      .filter((exit) => exit.side === side && openExitIds.has(exit.id))
      .map((exit) => ({ start: exit.rangeStart, end: exit.rangeEnd }))
      .sort((left, right) => left.start - right.start);
    let cursor = 0;
    for (const opening of openings) {
      if (opening.start > cursor) {
        const size = opening.start - cursor;
        if (side === "top") segments.push({ side, x: cursor, y: 0, width: size, height: thickness });
        else if (side === "bottom") segments.push({ side, x: cursor, y: field.height - thickness, width: size, height: thickness });
        else if (side === "left") segments.push({ side, x: 0, y: cursor, width: thickness, height: size });
        else segments.push({ side, x: field.width - thickness, y: cursor, width: thickness, height: size });
      }
      cursor = Math.max(cursor, opening.end);
    }
    if (cursor < length) {
      const size = length - cursor;
      if (side === "top") segments.push({ side, x: cursor, y: 0, width: size, height: thickness });
      else if (side === "bottom") segments.push({ side, x: cursor, y: field.height - thickness, width: size, height: thickness });
      else if (side === "left") segments.push({ side, x: 0, y: cursor, width: thickness, height: size });
      else segments.push({ side, x: field.width - thickness, y: cursor, width: thickness, height: size });
    }
  };
  addSide("top", field.width);
  addSide("bottom", field.width);
  addSide("left", field.height);
  addSide("right", field.height);
  return segments;
};
