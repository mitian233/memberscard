import type { AvatarFrameDefinition, AvatarTransform } from "@/types/card";

export interface ImageSize {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

type FrameSize = Pick<AvatarFrameDefinition, "width" | "height">;

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

function validateImageSize(imageSize: ImageSize): void {
  assertPositiveFinite(imageSize.width, "image width");
  assertPositiveFinite(imageSize.height, "image height");
}

function validateFrame(frame: AvatarFrameDefinition): void {
  assertFinite(frame.left, "frame left");
  assertFinite(frame.top, "frame top");
  assertPositiveFinite(frame.width, "frame width");
  assertPositiveFinite(frame.height, "frame height");
  assertFinite(frame.radius, "frame radius");
}

function validateTransform(transform: AvatarTransform): void {
  assertFinite(transform.left, "avatar left");
  assertFinite(transform.top, "avatar top");
  assertPositiveFinite(transform.scale, "avatar scale");
}

function validatePoint(point: Point): void {
  assertFinite(point.x, "anchor x");
  assertFinite(point.y, "anchor y");
}

/** Return the smallest scale that fully covers a frame with an image. */
export function getCoverScale(imageSize: ImageSize, frame: FrameSize): number {
  validateImageSize(imageSize);
  assertPositiveFinite(frame.width, "frame width");
  assertPositiveFinite(frame.height, "frame height");

  const scale = Math.max(
    frame.width / imageSize.width,
    frame.height / imageSize.height,
  );
  assertPositiveFinite(scale, "cover scale");
  return scale;
}

/** Clamp an avatar to the cover scale and frame bounds without mutating it. */
export function clampAvatarTransform(
  transform: AvatarTransform,
  imageSize: ImageSize,
  frame: AvatarFrameDefinition,
): AvatarTransform {
  validateTransform(transform);
  validateImageSize(imageSize);
  validateFrame(frame);

  const scale = Math.max(transform.scale, getCoverScale(imageSize, frame));
  const imageWidth = imageSize.width * scale;
  const imageHeight = imageSize.height * scale;
  assertFinite(imageWidth, "scaled image width");
  assertFinite(imageHeight, "scaled image height");

  const minLeft = frame.left + frame.width - imageWidth;
  const minTop = frame.top + frame.height - imageHeight;
  assertFinite(minLeft, "avatar left bound");
  assertFinite(minTop, "avatar top bound");

  const left = Math.min(Math.max(transform.left, minLeft), frame.left);
  const top = Math.min(Math.max(transform.top, minTop), frame.top);
  assertFinite(left, "avatar left");
  assertFinite(top, "avatar top");

  return { ...transform, left, top, scale };
}

/** Scale around a canvas point, then constrain the result to the frame. */
export function scaleAvatarAroundPoint(
  transform: AvatarTransform,
  nextScale: number,
  anchor: Point,
  imageSize: ImageSize,
  frame: AvatarFrameDefinition,
): AvatarTransform {
  validateTransform(transform);
  assertPositiveFinite(nextScale, "next scale");
  validatePoint(anchor);

  const clampedNextScale = Math.max(nextScale, getCoverScale(imageSize, frame));
  const ratio = clampedNextScale / transform.scale;
  assertFinite(ratio, "scale ratio");

  const left = anchor.x - (anchor.x - transform.left) * ratio;
  const top = anchor.y - (anchor.y - transform.top) * ratio;
  assertFinite(left, "scaled avatar left");
  assertFinite(top, "scaled avatar top");

  return clampAvatarTransform(
    { ...transform, left, top, scale: clampedNextScale },
    imageSize,
    frame,
  );
}
