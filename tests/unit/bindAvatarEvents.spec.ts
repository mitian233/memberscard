import { FabricImage } from "fabric";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bindAvatarEvents } from "@/fabric/bindAvatarEvents";
import type { CanvasAdapter } from "@/fabric/types";
import type { AvatarFrameDefinition, AvatarTransform } from "@/types/card";
import type { Canvas } from "fabric";

function createImage(width = 200, height = 100): FabricImage {
  const element = document.createElement("img");
  element.width = width;
  element.height = height;
  return new FabricImage(element);
}

function createCanvas(): CanvasAdapter & { renderCount: number } {
  let renderCount = 0;
  return {
    raw: {} as Canvas,
    width: 960,
    height: 640,
    clear: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    requestRenderAll: vi.fn(() => {
      renderCount += 1;
    }),
    discardActiveObject: vi.fn(),
    dispose: vi.fn(),
    get renderCount() {
      return renderCount;
    },
  };
}

const frame: AvatarFrameDefinition = {
  left: 10,
  top: 20,
  width: 100,
  height: 80,
  radius: 12,
};

describe("bindAvatarEvents", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("clamps moving and scaling events, resets locks, and emits one patch/render each", () => {
    const avatar = createImage();
    const canvas = createCanvas();
    const patches: Array<{ value: AvatarTransform; source: "canvas" }> = [];
    const disposer = bindAvatarEvents(canvas, avatar, {
      avatarSource: () => "/avatar.png",
      frame,
      onDocumentPatch: (patch, source) => {
        if (patch.type === "avatar") {
          patches.push({ value: patch.value, source });
        }
      },
    });

    avatar.set({
      left: 500,
      top: -500,
      scaleX: 0.4,
      scaleY: 0.5,
      angle: 45,
      flipX: true,
      flipY: true,
    });
    avatar.fire("moving");

    expect(avatar).toMatchObject({
      left: 10,
      top: 20,
      scaleX: 0.8,
      scaleY: 0.8,
      angle: 0,
      flipX: false,
      flipY: false,
    });
    expect(patches).toEqual([
      {
        value: { src: "/avatar.png", left: 10, top: 20, scale: 0.8 },
        source: "canvas",
      },
    ]);
    expect(canvas.renderCount).toBe(1);

    avatar.set({
      left: -500,
      top: -500,
      scaleX: 1.2,
      scaleY: 0.7,
      angle: -10,
      flipX: true,
      flipY: true,
    });
    avatar.fire("scaling");

    expect(avatar).toMatchObject({
      left: -130,
      top: -20,
      scaleX: 1.2,
      scaleY: 1.2,
      angle: 0,
      flipX: false,
      flipY: false,
    });
    expect(patches).toHaveLength(2);
    expect(patches[1]).toEqual({
      value: { src: "/avatar.png", left: -130, top: -20, scale: 1.2 },
      source: "canvas",
    });
    expect(canvas.renderCount).toBe(2);

    disposer();
  });

  it("uses the larger nonuniform scale and preserves edge coverage", () => {
    const avatar = createImage();
    const canvas = createCanvas();
    const patches: AvatarTransform[] = [];
    const frameBefore = { ...frame };
    const disposer = bindAvatarEvents(canvas, avatar, {
      avatarSource: () => "/avatar.png",
      frame,
      onDocumentPatch: (patch) => {
        if (patch.type === "avatar") {
          patches.push(patch.value);
        }
      },
    });

    avatar.set({ left: 500, top: 500, scaleX: 1.3, scaleY: 0.7 });
    avatar.fire("scaling");

    const corrected = patches[0];
    expect(corrected.scale).toBe(1.3);
    expect(corrected.left).toBeLessThanOrEqual(frame.left);
    expect(corrected.top).toBeLessThanOrEqual(frame.top);
    expect(
      corrected.left + avatar.width * corrected.scale,
    ).toBeGreaterThanOrEqual(frame.left + frame.width);
    expect(
      corrected.top + avatar.height * corrected.scale,
    ).toBeGreaterThanOrEqual(frame.top + frame.height);
    expect(frame).toEqual(frameBefore);

    disposer();
  });

  it("rejects invalid intrinsic dimensions before registering listeners", () => {
    const avatar = createImage();
    avatar.set({ width: 0 });
    const onSpy = vi.spyOn(avatar, "on");

    expect(() =>
      bindAvatarEvents(createCanvas(), avatar, {
        avatarSource: () => "/avatar.png",
        frame,
        onDocumentPatch: () => undefined,
      }),
    ).toThrow(RangeError);
    expect(onSpy).not.toHaveBeenCalled();
  });

  it("rejects invalid live values without rendering or patching", () => {
    const avatar = createImage();
    const canvas = createCanvas();
    const onDocumentPatch = vi.fn();
    const disposer = bindAvatarEvents(canvas, avatar, {
      avatarSource: () => "/avatar.png",
      frame,
      onDocumentPatch,
    });

    avatar.set({ left: Number.NaN });
    expect(() => avatar.fire("moving")).toThrow(RangeError);
    avatar.set({ left: 0, scaleX: Number.POSITIVE_INFINITY });
    expect(() => avatar.fire("scaling")).toThrow(RangeError);
    expect(onDocumentPatch).not.toHaveBeenCalled();
    expect(canvas.renderCount).toBe(0);

    disposer();
  });

  it("disposes each listener once and ignores later events", () => {
    const avatar = createImage();
    const canvas = createCanvas();
    const onDocumentPatch = vi.fn();
    const offSpy = vi.spyOn(avatar, "off");
    const disposer = bindAvatarEvents(canvas, avatar, {
      avatarSource: () => "/avatar.png",
      frame,
      onDocumentPatch,
    });

    disposer();
    disposer();
    expect(offSpy).toHaveBeenCalledTimes(2);
    expect(offSpy.mock.calls.every((call) => call.length === 2)).toBe(true);

    avatar.set({ left: 0, top: 0, scaleX: 1, scaleY: 1 });
    avatar.fire("moving");
    avatar.fire("scaling");
    expect(onDocumentPatch).not.toHaveBeenCalled();
    expect(canvas.renderCount).toBe(0);
  });
});
