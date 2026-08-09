import type { Point } from "@/editor/avatarGeometry";

export interface PinchSnapshot {
  distance: number;
  center: Point;
}

export interface PinchUpdate {
  scaleRatio: number;
  anchor: Point;
  snapshot: PinchSnapshot;
}

function assertFinitePoint(point: Point): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError("pinch points must have finite coordinates");
  }
}

/** Create a snapshot for exactly two finite pointer positions. */
export function createPinchSnapshot(
  points: readonly Point[],
): PinchSnapshot | null {
  if (points.length !== 2) {
    return null;
  }

  const [first, second] = points;
  assertFinitePoint(first);
  assertFinitePoint(second);

  const distance = Math.hypot(second.x - first.x, second.y - first.y);
  const center = {
    x: first.x / 2 + second.x / 2,
    y: first.y / 2 + second.y / 2,
  };

  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y)
  ) {
    throw new RangeError("pinch geometry must be finite");
  }

  return { distance, center };
}

/** Calculate a scale update from the previous and current pointer positions. */
export function getPinchUpdate(
  previous: PinchSnapshot | null,
  points: readonly Point[],
): PinchUpdate | null {
  if (
    previous === null ||
    !Number.isFinite(previous.distance) ||
    previous.distance <= 0
  ) {
    return null;
  }

  const current = createPinchSnapshot(points);
  if (current === null || current.distance === 0) {
    return null;
  }

  const scaleRatio = current.distance / previous.distance;
  if (!Number.isFinite(scaleRatio)) {
    throw new RangeError("pinch scale ratio must be finite");
  }

  const anchor = { ...current.center };
  const snapshot = {
    distance: current.distance,
    center: { ...current.center },
  };

  return {
    scaleRatio,
    anchor,
    snapshot,
  };
}
