import type { FabricImage } from "fabric";

import { clampAvatarTransform } from "@/editor/avatarGeometry";
import type {
  AvatarFrameDefinition,
  CardPatch,
  PatchSource,
} from "@/types/card";

import type { CanvasAdapter } from "./types";

export interface BindAvatarEventsOptions {
  avatarSource: () => string;
  frame: AvatarFrameDefinition;
  onDocumentPatch(patch: CardPatch, source: PatchSource): void;
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite positive number`);
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
}

export function bindAvatarEvents(
  canvas: CanvasAdapter,
  avatar: FabricImage,
  options: BindAvatarEventsOptions,
): () => void {
  const imageSize = {
    width: avatar.width,
    height: avatar.height,
  };
  assertPositiveFinite(imageSize.width, "avatar image width");
  assertPositiveFinite(imageSize.height, "avatar image height");

  let disposed = false;
  const handleTransform = (): void => {
    if (disposed) {
      return;
    }

    const left = avatar.left;
    const top = avatar.top;
    const scaleX = avatar.scaleX;
    const scaleY = avatar.scaleY;
    assertFinite(left, "avatar left");
    assertFinite(top, "avatar top");
    assertFinite(scaleX, "avatar scaleX");
    assertFinite(scaleY, "avatar scaleY");

    const correctedTransform = clampAvatarTransform(
      {
        src: options.avatarSource(),
        left,
        top,
        scale: Math.max(scaleX, scaleY),
      },
      imageSize,
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
  };

  const disposeMoving = avatar.on("moving", handleTransform);
  const disposeScaling = avatar.on("scaling", handleTransform);

  return (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    disposeMoving();
    disposeScaling();
  };
}
