import { describe, expect, it } from "vitest";

import { createPinchSnapshot, getPinchUpdate } from "@/fabric/pinchGesture";

describe("pinch gesture math", () => {
  it("computes a 3-4-5 distance and arithmetic center", () => {
    expect(
      createPinchSnapshot([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ]),
    ).toEqual({ distance: 5, center: { x: 1.5, y: 2 } });
  });

  it("returns zoom-in and zoom-out ratios around the current center", () => {
    const previous = createPinchSnapshot([
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ]);

    expect(
      getPinchUpdate(previous, [
        { x: 0, y: 0 },
        { x: 6, y: 8 },
      ]),
    ).toMatchObject({
      scaleRatio: 2,
      anchor: { x: 3, y: 4 },
      snapshot: { distance: 10, center: { x: 3, y: 4 } },
    });

    expect(
      getPinchUpdate(previous, [
        { x: 0, y: 0 },
        { x: 1.5, y: 2 },
      ]),
    ).toMatchObject({
      scaleRatio: 0.5,
      anchor: { x: 0.75, y: 1 },
      snapshot: { distance: 2.5, center: { x: 0.75, y: 1 } },
    });
  });

  it("requires exactly two pointers", () => {
    expect(createPinchSnapshot([])).toBeNull();
    expect(createPinchSnapshot([{ x: 0, y: 0 }])).toBeNull();
    expect(
      createPinchSnapshot([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBeNull();

    const previous = createPinchSnapshot([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(getPinchUpdate(previous, [{ x: 0, y: 0 }])).toBeNull();
    expect(
      getPinchUpdate(previous, [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBeNull();
  });

  it("does not produce an update for coincident pointers", () => {
    const coincident = createPinchSnapshot([
      { x: 10, y: 20 },
      { x: 10, y: 20 },
    ]);
    expect(coincident).toEqual({ distance: 0, center: { x: 10, y: 20 } });
    expect(
      getPinchUpdate(coincident, [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toBeNull();

    const previous = createPinchSnapshot([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ]);
    expect(
      getPinchUpdate(previous, [
        { x: 5, y: 5 },
        { x: 5, y: 5 },
      ]),
    ).toBeNull();
  });

  it("rejects non-finite point coordinates", () => {
    for (const points of [
      [
        { x: Number.NaN, y: 0 },
        { x: 1, y: 1 },
      ],
      [
        { x: 0, y: Number.POSITIVE_INFINITY },
        { x: 1, y: 1 },
      ],
      [
        { x: 0, y: 0 },
        { x: Number.NEGATIVE_INFINITY, y: 1 },
      ],
    ]) {
      expect(() => createPinchSnapshot(points)).toThrow(RangeError);
    }

    const previous = createPinchSnapshot([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(() =>
      getPinchUpdate(previous, [
        { x: 0, y: 0 },
        { x: Number.NaN, y: 1 },
      ]),
    ).toThrow(RangeError);
  });

  it("does not mutate inputs and returns fresh nested objects", () => {
    const first = { x: 0, y: 0 };
    const second = { x: 3, y: 4 };
    const points = [first, second] as const;
    const snapshot = createPinchSnapshot(points);

    expect(snapshot).not.toBeNull();
    expect(snapshot).not.toBe(points);
    expect(snapshot?.center).not.toBe(first);
    expect(snapshot?.center).not.toBe(second);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ]);

    const secondSnapshot = createPinchSnapshot(points);
    expect(secondSnapshot).not.toBe(snapshot);
    expect(secondSnapshot?.center).not.toBe(snapshot?.center);

    const update = getPinchUpdate(snapshot, [
      { x: 0, y: 0 },
      { x: 6, y: 8 },
    ]);
    expect(update).not.toBeNull();
    expect(update?.snapshot).not.toBe(snapshot);
    expect(update?.snapshot.center).not.toBe(snapshot?.center);
    expect(update?.anchor).not.toBe(snapshot?.center);
    expect(update?.anchor).not.toBe(update?.snapshot.center);
  });

  it("returns null for missing or invalid previous snapshots", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ] as const;

    expect(getPinchUpdate(null, points)).toBeNull();
    expect(
      getPinchUpdate({ distance: 0, center: { x: 0, y: 0 } }, points),
    ).toBeNull();
    expect(
      getPinchUpdate({ distance: Number.NaN, center: { x: 0, y: 0 } }, points),
    ).toBeNull();
    expect(
      getPinchUpdate(
        { distance: Number.POSITIVE_INFINITY, center: { x: 0, y: 0 } },
        points,
      ),
    ).toBeNull();
  });
});
