import type { FieldDefinition } from "../data/fields";
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
  const nextX = {
    x: clamp(current.x + delta.x, PLAYER_RADIUS, field.width - PLAYER_RADIUS),
    y: current.y,
  };
  const afterX = isPositionWalkable(nextX, field, obstacles) ? nextX : current;
  const nextY = {
    x: afterX.x,
    y: clamp(current.y + delta.y, PLAYER_RADIUS, field.height - PLAYER_RADIUS),
  };
  return isPositionWalkable(nextY, field, obstacles) ? nextY : afterX;
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

export const getFieldCollisionRects = (field: FieldDefinition): CollisionRect[] => {
  const objectRects = field.objects
    .filter((object) => object.solid)
    .map(({ x, y, width, height }) => ({ x, y, width, height }));

  if (!field.locationId) return objectRects;
  const hotspots = locationById[field.locationId].hotspots;
  const treeRects = field.hotspots.flatMap((position) => {
    const hotspot = hotspots.find((candidate) => candidate.id === position.spotId);
    if (!hotspot || (hotspot.kind !== "tree" && hotspot.kind !== "sap")) return [];
    return [{ x: position.x - 20, y: position.y - 8, width: 40, height: 45 }];
  });
  return [...objectRects, ...treeRects];
};
