import { FabricImage } from "fabric";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bindAvatarPinchEvents } from "@/fabric/bindAvatarPinchEvents";
import type { CanvasAdapter } from "@/fabric/types";
import type { AvatarFrameDefinition, AvatarTransform } from "@/types/card";
import type { Canvas } from "fabric";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TargetHarness {
  target: HTMLElement;
  rect: Rect;
  setPointerCapture: ReturnType<typeof vi.fn>;
  releasePointerCapture: ReturnType<typeof vi.fn>;
}

function createImage(width = 100, height = 100): FabricImage {
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

function createTarget(
  rect: Rect = { left: 100, top: 50, width: 480, height: 320 },
): TargetHarness {
  const target = document.createElement("div");
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  Object.defineProperty(target, "getBoundingClientRect", {
    configurable: true,
    value: vi.fn(() => rect),
  });
  Object.assign(target, { setPointerCapture, releasePointerCapture });
  return { target, rect, setPointerCapture, releasePointerCapture };
}

function pointerEvent(
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
): PointerEvent {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    pointerId: { configurable: true, value: pointerId },
    clientX: { configurable: true, value: clientX },
    clientY: { configurable: true, value: clientY },
  });
  return event as PointerEvent;
}

function dispatchPointer(
  target: HTMLElement,
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
): PointerEvent {
  const event = pointerEvent(type, pointerId, clientX, clientY);
  target.dispatchEvent(event);
  return event;
}

const frame: AvatarFrameDefinition = {
  left: 100,
  top: 80,
  width: 200,
  height: 160,
  radius: 16,
};

function bindFixture() {
  const avatar = createImage();
  avatar.set({ left: frame.left, top: frame.top, scaleX: 2, scaleY: 2 });
  const canvas = createCanvas();
  const targetHarness = createTarget();
  const patches: Array<{ value: AvatarTransform; source: "canvas" }> = [];
  const disposer = bindAvatarPinchEvents(canvas, avatar, {
    target: targetHarness.target,
    avatarSource: () => "/avatar.png",
    frame,
    onDocumentPatch: (patch, source) => {
      if (patch.type === "avatar") {
        patches.push({ value: patch.value, source });
      }
    },
  });
  return { avatar, canvas, targetHarness, patches, disposer };
}

describe("bindAvatarPinchEvents", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("converts client coordinates to the logical canvas and leaves the first two-pointer sample untouched", () => {
    const { avatar, canvas, targetHarness, patches, disposer } = bindFixture();

    const first = dispatchPointer(
      targetHarness.target,
      "pointerdown",
      1,
      130,
      90,
    );
    const second = dispatchPointer(
      targetHarness.target,
      "pointerdown",
      2,
      250,
      170,
    );

    expect(first.defaultPrevented).toBe(false);
    expect(second.defaultPrevented).toBe(false);
    expect(avatar).toMatchObject({
      left: frame.left,
      top: frame.top,
      scaleX: 2,
      scaleY: 2,
    });
    expect(patches).toEqual([]);
    expect(canvas.renderCount).toBe(0);
    expect(targetHarness.setPointerCapture).toHaveBeenNthCalledWith(1, 1);
    expect(targetHarness.setPointerCapture).toHaveBeenNthCalledWith(2, 2);

    disposer();
  });

  it("applies zoom-in and zoom-out around the current center with a cover clamp", () => {
    const { avatar, canvas, targetHarness, patches, disposer } = bindFixture();

    dispatchPointer(targetHarness.target, "pointerdown", 1, 100, 50);
    dispatchPointer(targetHarness.target, "pointerdown", 2, 200, 100);

    const zoomIn = dispatchPointer(
      targetHarness.target,
      "pointermove",
      2,
      300,
      150,
    );
    expect(zoomIn.defaultPrevented).toBe(true);
    expect(avatar).toMatchObject({
      left: 0,
      top: 60,
      scaleX: 4,
      scaleY: 4,
      angle: 0,
      flipX: false,
      flipY: false,
    });
    expect(patches).toEqual([
      {
        value: { src: "/avatar.png", left: 0, top: 60, scale: 4 },
        source: "canvas",
      },
    ]);
    expect(canvas.renderCount).toBe(1);

    const zoomOut = dispatchPointer(
      targetHarness.target,
      "pointermove",
      2,
      200,
      100,
    );
    expect(zoomOut.defaultPrevented).toBe(true);
    expect(avatar).toMatchObject({ left: 100, top: 55, scaleX: 2, scaleY: 2 });
    expect(patches).toHaveLength(2);
    expect(patches[1]).toEqual({
      value: { src: "/avatar.png", left: 100, top: 55, scale: 2 },
      source: "canvas",
    });
    expect(canvas.renderCount).toBe(2);

    disposer();
  });

  it("resets the baseline across pointerup, cancel, lost capture, and a third pointer", () => {
    const { canvas, targetHarness, patches, disposer } = bindFixture();

    dispatchPointer(targetHarness.target, "pointerdown", 1, 100, 50);
    dispatchPointer(targetHarness.target, "pointerdown", 2, 200, 100);
    dispatchPointer(targetHarness.target, "pointermove", 2, 300, 150);
    expect(patches).toHaveLength(1);

    dispatchPointer(targetHarness.target, "pointerdown", 3, 140, 80);
    dispatchPointer(targetHarness.target, "pointermove", 2, 400, 200);
    expect(patches).toHaveLength(1);

    dispatchPointer(targetHarness.target, "pointerup", 3, 0, 0);
    const freshBaselineMove = dispatchPointer(
      targetHarness.target,
      "pointermove",
      2,
      250,
      125,
    );
    expect(freshBaselineMove.defaultPrevented).toBe(true);
    expect(patches).toHaveLength(2);
    expect(canvas.renderCount).toBe(2);

    dispatchPointer(targetHarness.target, "pointercancel", 2, 0, 0);
    dispatchPointer(targetHarness.target, "lostpointercapture", 1, 0, 0);
    expect(targetHarness.releasePointerCapture).toHaveBeenCalledWith(3);
    expect(targetHarness.releasePointerCapture).toHaveBeenCalledWith(2);
    expect(patches).toHaveLength(2);

    disposer();
  });

  it("tolerates pointer capture errors while retaining pinch behavior", () => {
    const { target, setPointerCapture, releasePointerCapture } = createTarget();
    setPointerCapture.mockImplementation(() => {
      throw new DOMException("capture failed");
    });
    releasePointerCapture.mockImplementation(() => {
      throw new DOMException("release failed");
    });
    const avatar = createImage();
    avatar.set({ left: frame.left, top: frame.top, scaleX: 2, scaleY: 2 });
    const canvas = createCanvas();
    const onDocumentPatch = vi.fn();
    const disposer = bindAvatarPinchEvents(canvas, avatar, {
      target,
      avatarSource: () => "/avatar.png",
      frame,
      onDocumentPatch,
    });

    expect(() =>
      dispatchPointer(target, "pointerdown", 1, 100, 50),
    ).not.toThrow();
    expect(() => dispatchPointer(target, "pointerup", 1, 0, 0)).not.toThrow();
    disposer();
  });

  it("rejects invalid rendered rectangles and live avatar values before side effects", () => {
    const targetHarness = createTarget({
      left: 100,
      top: 50,
      width: 0,
      height: 320,
    });
    const avatar = createImage();
    avatar.set({ left: frame.left, top: frame.top, scaleX: 2, scaleY: 2 });
    const canvas = createCanvas();
    const onDocumentPatch = vi.fn();
    const disposer = bindAvatarPinchEvents(canvas, avatar, {
      target: targetHarness.target,
      avatarSource: () => "/avatar.png",
      frame,
      onDocumentPatch,
    });

    expect(() =>
      dispatchPointer(targetHarness.target, "pointerdown", 1, 100, 50),
    ).toThrow(RangeError);
    expect(targetHarness.setPointerCapture).not.toHaveBeenCalled();
    expect(canvas.renderCount).toBe(0);
    expect(onDocumentPatch).not.toHaveBeenCalled();

    const valid = createTarget();
    const liveAvatar = createImage();
    liveAvatar.set({ left: frame.left, top: frame.top, scaleX: 2, scaleY: 2 });
    const liveCanvas = createCanvas();
    const livePatch = vi.fn();
    const liveSet = vi.spyOn(liveAvatar, "set");
    const liveDisposer = bindAvatarPinchEvents(liveCanvas, liveAvatar, {
      target: valid.target,
      avatarSource: () => "/avatar.png",
      frame,
      onDocumentPatch: livePatch,
    });
    dispatchPointer(valid.target, "pointerdown", 1, 100, 50);
    dispatchPointer(valid.target, "pointerdown", 2, 200, 100);
    liveAvatar.set({ left: Number.NaN });
    liveSet.mockClear();
    const move = pointerEvent("pointermove", 2, 300, 150);
    expect(() => valid.target.dispatchEvent(move)).toThrow(RangeError);
    expect(move.defaultPrevented).toBe(false);
    expect(liveSet).not.toHaveBeenCalled();
    expect(liveCanvas.renderCount).toBe(0);
    expect(livePatch).not.toHaveBeenCalled();

    liveAvatar.set({ left: frame.left, width: 0 });
    liveSet.mockClear();
    const invalidWidthMove = pointerEvent("pointermove", 2, 300, 150);
    expect(() => valid.target.dispatchEvent(invalidWidthMove)).toThrow(
      RangeError,
    );
    expect(invalidWidthMove.defaultPrevented).toBe(false);
    expect(liveSet).not.toHaveBeenCalled();
    expect(liveCanvas.renderCount).toBe(0);
    expect(livePatch).not.toHaveBeenCalled();

    liveAvatar.set({ width: 100, height: Number.POSITIVE_INFINITY });
    liveSet.mockClear();
    const invalidHeightMove = pointerEvent("pointermove", 2, 300, 150);
    expect(() => valid.target.dispatchEvent(invalidHeightMove)).toThrow(
      RangeError,
    );
    expect(invalidHeightMove.defaultPrevented).toBe(false);
    expect(liveSet).not.toHaveBeenCalled();
    expect(liveCanvas.renderCount).toBe(0);
    expect(livePatch).not.toHaveBeenCalled();

    liveDisposer();
    disposer();
  });

  it("removes exactly five listeners once and makes stale callbacks no-op", () => {
    const { avatar, canvas, targetHarness, patches, disposer } = bindFixture();
    const addSpy = vi.spyOn(targetHarness.target, "addEventListener");
    const removeSpy = vi.spyOn(targetHarness.target, "removeEventListener");

    // Rebind after spying so the registration calls are captured.
    disposer();
    removeSpy.mockClear();
    const second = bindAvatarPinchEvents(canvas, avatar, {
      target: targetHarness.target,
      avatarSource: () => "/avatar.png",
      frame,
      onDocumentPatch: (patch, source) => {
        if (patch.type === "avatar") {
          patches.push({ value: patch.value, source });
        }
      },
    });
    expect(addSpy).toHaveBeenCalledTimes(5);
    expect(addSpy.mock.calls.map(([type]) => type)).toEqual([
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ]);

    second();
    second();
    expect(removeSpy).toHaveBeenCalledTimes(5);
    expect(removeSpy.mock.calls.map(([type]) => type)).toEqual([
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ]);

    dispatchPointer(targetHarness.target, "pointerdown", 1, 100, 50);
    dispatchPointer(targetHarness.target, "pointerdown", 2, 200, 100);
    dispatchPointer(targetHarness.target, "pointermove", 2, 300, 150);
    expect(patches).toEqual([]);
    expect(canvas.renderCount).toBe(0);
    expect(avatar).toMatchObject({ scaleX: 2, scaleY: 2 });
  });
});
