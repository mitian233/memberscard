import type { FabricImage } from "fabric";

import { scaleAvatarAroundPoint, type Point } from "@/editor/avatarGeometry";
import {
  createPinchSnapshot,
  getPinchUpdate,
  type PinchSnapshot,
} from "@/fabric/pinchGesture";
import type {
  AvatarFrameDefinition,
  CardPatch,
  PatchSource,
} from "@/types/card";

import type { CanvasAdapter } from "./types";

export interface BindAvatarPinchEventsOptions {
  target: HTMLElement;
  avatarSource: () => string;
  frame: AvatarFrameDefinition;
  onDocumentPatch(patch: CardPatch, source: PatchSource): void;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite positive number`);
  }
}

function logicalPoint(
  event: PointerEvent,
  canvas: CanvasAdapter,
  target: HTMLElement,
): Point {
  const rect = target.getBoundingClientRect();
  assertFinite(rect.left, "rendered left");
  assertFinite(rect.top, "rendered top");
  assertPositiveFinite(rect.width, "rendered width");
  assertPositiveFinite(rect.height, "rendered height");
  assertPositiveFinite(canvas.width, "canvas width");
  assertPositiveFinite(canvas.height, "canvas height");
  assertFinite(event.clientX, "pointer clientX");
  assertFinite(event.clientY, "pointer clientY");

  const point = {
    x: ((event.clientX - rect.left) * canvas.width) / rect.width,
    y: ((event.clientY - rect.top) * canvas.height) / rect.height,
  };
  assertFinite(point.x, "logical pointer x");
  assertFinite(point.y, "logical pointer y");
  return point;
}

function readLiveTransform(
  avatar: FabricImage,
  avatarSource: () => string,
): {
  src: string;
  left: number;
  top: number;
  scale: number;
  width: number;
  height: number;
} {
  const width = avatar.width;
  const height = avatar.height;
  assertPositiveFinite(width, "avatar image width");
  assertPositiveFinite(height, "avatar image height");

  const left = avatar.left;
  const top = avatar.top;
  const scaleX = avatar.scaleX;
  const scaleY = avatar.scaleY;
  assertFinite(left, "avatar left");
  assertFinite(top, "avatar top");
  assertPositiveFinite(scaleX, "avatar scaleX");
  assertPositiveFinite(scaleY, "avatar scaleY");

  return {
    src: avatarSource(),
    left,
    top,
    scale: Math.max(scaleX, scaleY),
    width,
    height,
  };
}

export function bindAvatarPinchEvents(
  canvas: CanvasAdapter,
  avatar: FabricImage,
  options: BindAvatarPinchEventsOptions,
): () => void {
  const pointers = new Map<number, Point>();
  let snapshot: PinchSnapshot | null = null;
  let disposed = false;

  const capturePointer = (pointerId: number): void => {
    if (typeof options.target.setPointerCapture !== "function") {
      return;
    }
    try {
      options.target.setPointerCapture(pointerId);
    } catch {
      // Browsers can reject capture when a pointer is no longer active.
    }
  };

  const releasePointer = (pointerId: number): void => {
    if (typeof options.target.releasePointerCapture !== "function") {
      return;
    }
    try {
      options.target.releasePointerCapture(pointerId);
    } catch {
      // A capture may already have been released by the browser.
    }
  };

  const resetSnapshot = (): void => {
    if (pointers.size === 2) {
      snapshot = createPinchSnapshot(Array.from(pointers.values()));
    } else {
      snapshot = null;
    }
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (disposed) {
      return;
    }

    const point = logicalPoint(event, canvas, options.target);
    pointers.set(event.pointerId, point);
    resetSnapshot();
    capturePointer(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (disposed || !pointers.has(event.pointerId)) {
      return;
    }

    const point = logicalPoint(event, canvas, options.target);
    const nextPointers = new Map(pointers);
    nextPointers.set(event.pointerId, point);

    if (nextPointers.size !== 2 || snapshot === null) {
      pointers.clear();
      for (const [pointerId, pointer] of nextPointers) {
        pointers.set(pointerId, pointer);
      }
      snapshot =
        nextPointers.size === 2
          ? createPinchSnapshot(Array.from(nextPointers.values()))
          : null;
      return;
    }

    const update = getPinchUpdate(snapshot, Array.from(nextPointers.values()));
    if (update === null) {
      pointers.clear();
      for (const [pointerId, pointer] of nextPointers) {
        pointers.set(pointerId, pointer);
      }
      snapshot = null;
      return;
    }

    const liveTransform = readLiveTransform(avatar, options.avatarSource);
    const correctedTransform = scaleAvatarAroundPoint(
      {
        src: liveTransform.src,
        left: liveTransform.left,
        top: liveTransform.top,
        scale: liveTransform.scale,
      },
      liveTransform.scale * update.scaleRatio,
      update.anchor,
      { width: liveTransform.width, height: liveTransform.height },
      options.frame,
    );

    avatar.set({
      left: correctedTransform.left,
      top: correctedTransform.top,
      scaleX: correctedTransform.scale,
      scaleY: correctedTransform.scale,
      angle: 0,
      flipX: false,
      flipY: false,
    });
    avatar.setCoords();
    canvas.requestRenderAll();
    options.onDocumentPatch(
      { type: "avatar", value: correctedTransform },
      "canvas",
    );
    event.preventDefault();

    pointers.clear();
    for (const [pointerId, pointer] of nextPointers) {
      pointers.set(pointerId, pointer);
    }
    snapshot = update.snapshot;
  };

  const handlePointerEnd = (event: PointerEvent): void => {
    if (disposed) {
      return;
    }

    pointers.delete(event.pointerId);
    resetSnapshot();
    releasePointer(event.pointerId);
  };

  const handleLostPointerCapture = (event: PointerEvent): void => {
    if (disposed) {
      return;
    }

    pointers.delete(event.pointerId);
    resetSnapshot();
  };

  options.target.addEventListener("pointerdown", handlePointerDown);
  options.target.addEventListener("pointermove", handlePointerMove);
  options.target.addEventListener("pointerup", handlePointerEnd);
  options.target.addEventListener("pointercancel", handlePointerEnd);
  options.target.addEventListener(
    "lostpointercapture",
    handleLostPointerCapture,
  );

  return (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    options.target.removeEventListener("pointerdown", handlePointerDown);
    options.target.removeEventListener("pointermove", handlePointerMove);
    options.target.removeEventListener("pointerup", handlePointerEnd);
    options.target.removeEventListener("pointercancel", handlePointerEnd);
    options.target.removeEventListener(
      "lostpointercapture",
      handleLostPointerCapture,
    );
    pointers.clear();
    snapshot = null;
  };
}
