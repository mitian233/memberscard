import { describe, expect, it } from "vitest";

import {
  clampAvatarTransform,
  getCoverScale,
  scaleAvatarAroundPoint,
} from "@/editor/avatarGeometry";

const imageSize = { width: 1334, height: 1002 };
const frame = { left: 30, top: 45, width: 360, height: 550, radius: 25 };

describe("avatar geometry", () => {
  it("computes the cover scale from the frame dimensions", () => {
    expect(getCoverScale(imageSize, { width: 360, height: 550 })).toBeCloseTo(
      550 / 1002,
    );
  });

  it("raises a too-small scale and clamps the image to the frame edges", () => {
    const result = clampAvatarTransform(
      { src: "/demo.png", left: 100, top: 100, scale: 0.1 },
      imageSize,
      frame,
    );

    expect(result).toMatchObject({ left: 30, top: 45, scale: 550 / 1002 });
    expect(result.left).toBeLessThanOrEqual(frame.left);
    expect(result.top).toBeLessThanOrEqual(frame.top);
    expect(result.left + imageSize.width * result.scale).toBeGreaterThanOrEqual(
      frame.left + frame.width - 1e-9,
    );
    expect(result.top + imageSize.height * result.scale).toBeGreaterThanOrEqual(
      frame.top + frame.height - 1e-9,
    );
  });

  it("clamps dragging past each frame edge", () => {
    const scale = getCoverScale(imageSize, frame);
    const leftBound = frame.left + frame.width - imageSize.width * scale;
    const topBound = frame.top + frame.height - imageSize.height * scale;

    const rightBottom = clampAvatarTransform(
      { src: "/demo.png", left: 10_000, top: 10_000, scale },
      imageSize,
      frame,
    );
    expect(rightBottom.left).toBeCloseTo(frame.left);
    expect(rightBottom.top).toBeCloseTo(frame.top);
    expect(rightBottom.left).toBeLessThanOrEqual(frame.left);
    expect(rightBottom.top).toBeLessThanOrEqual(frame.top);
    expect(
      rightBottom.left + imageSize.width * rightBottom.scale,
    ).toBeGreaterThanOrEqual(frame.left + frame.width - 1e-9);
    expect(
      rightBottom.top + imageSize.height * rightBottom.scale,
    ).toBeGreaterThanOrEqual(frame.top + frame.height - 1e-9);

    const leftTop = clampAvatarTransform(
      { src: "/demo.png", left: -10_000, top: -10_000, scale },
      imageSize,
      frame,
    );
    expect(leftTop.left).toBeCloseTo(leftBound);
    expect(leftTop.top).toBeCloseTo(topBound);
    expect(
      leftTop.left + imageSize.width * leftTop.scale,
    ).toBeGreaterThanOrEqual(frame.left + frame.width - 1e-9);
    expect(
      leftTop.top + imageSize.height * leftTop.scale,
    ).toBeGreaterThanOrEqual(frame.top + frame.height - 1e-9);
  });

  it("scales around the frame center while preserving the anchor point", () => {
    const image = { width: 100, height: 100 };
    const avatarFrame = {
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      radius: 50,
    };
    const transform = { src: "/demo.png", left: 0, top: 0, scale: 1 };
    const anchor = { x: 50, y: 50 };

    const result = scaleAvatarAroundPoint(
      transform,
      2,
      anchor,
      image,
      avatarFrame,
    );

    expect(result).toMatchObject({
      src: "/demo.png",
      left: -50,
      top: -50,
      scale: 2,
    });
    expect(anchor.x - result.left).toBeCloseTo(
      (anchor.x - transform.left) * (result.scale / transform.scale),
    );
    expect(anchor.y - result.top).toBeCloseTo(
      (anchor.y - transform.top) * (result.scale / transform.scale),
    );
  });

  it("returns new transforms without mutating the source", () => {
    const transform = { src: "/demo.png", left: 0, top: 0, scale: 1 };
    const original = { ...transform };
    const result = scaleAvatarAroundPoint(
      transform,
      2,
      { x: 50, y: 50 },
      { width: 100, height: 100 },
      {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        radius: 50,
      },
    );

    expect(result).not.toBe(transform);
    expect(transform).toEqual(original);
    expect(result.src).toBe(transform.src);
  });

  it("rejects invalid image and frame dimensions", () => {
    expect(() =>
      getCoverScale({ width: 0, height: 100 }, { width: 100, height: 100 }),
    ).toThrow(RangeError);
    expect(() =>
      getCoverScale(
        { width: 100, height: 100 },
        { width: Number.NaN, height: 100 },
      ),
    ).toThrow(RangeError);
  });

  it("rejects a non-finite scale", () => {
    expect(() =>
      clampAvatarTransform(
        { src: "/demo.png", left: 0, top: 0, scale: Number.NaN },
        imageSize,
        frame,
      ),
    ).toThrow(RangeError);
  });
});
