import { Circle, FabricImage, FabricText, IText, Rect } from "fabric";
import type { FabricObject } from "fabric";

import type {
  AvatarFrameDefinition,
  AvatarTransform,
  CardField,
  CardFieldDefinition,
  CardStaticObjectDefinition,
} from "@/types/card";

export type RenderMode = "interactive" | "export";

export interface StaticObjectOptions {
  selectable: false;
  evented: false;
  lockMovementX: true;
  lockMovementY: true;
  lockScalingX: true;
  lockScalingY: true;
  lockRotation: true;
  lockSkewingX: true;
  lockSkewingY: true;
  hasControls: false;
  hasBorders: false;
  hoverCursor: "default";
  data: {
    role: "static";
    id: string;
  };
}

export interface EditableTextOptions {
  selectable: true;
  evented: true;
  editable: true;
  lockMovementX: true;
  lockMovementY: true;
  lockScalingX: true;
  lockScalingY: true;
  lockRotation: true;
  lockSkewingX: true;
  lockSkewingY: true;
  lockScalingFlip: true;
  hasControls: false;
  hasBorders: true;
  data: {
    role: "field";
    field: CardField;
  };
}

export interface AvatarObjectOptions {
  selectable: true;
  evented: true;
  lockMovementX: false;
  lockMovementY: false;
  lockScalingX: false;
  lockScalingY: false;
  lockRotation: true;
  lockSkewingX: true;
  lockSkewingY: true;
  lockScalingFlip: true;
  hasControls: true;
  hasBorders: true;
  flipX: false;
  flipY: false;
  data: {
    role: "avatar";
  };
}

export function createStaticObjectOptions(id: string): StaticObjectOptions {
  return {
    selectable: false,
    evented: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    lockSkewingX: true,
    lockSkewingY: true,
    hasControls: false,
    hasBorders: false,
    hoverCursor: "default",
    data: { role: "static", id },
  };
}

export function createEditableTextOptions(
  field: CardField,
): EditableTextOptions {
  return {
    selectable: true,
    evented: true,
    editable: true,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    lockSkewingX: true,
    lockSkewingY: true,
    lockScalingFlip: true,
    hasControls: false,
    hasBorders: true,
    data: { role: "field", field },
  };
}

export function createAvatarObjectOptions(): AvatarObjectOptions {
  return {
    selectable: true,
    evented: true,
    lockMovementX: false,
    lockMovementY: false,
    lockScalingX: false,
    lockScalingY: false,
    lockRotation: true,
    lockSkewingX: true,
    lockSkewingY: true,
    lockScalingFlip: true,
    hasControls: true,
    hasBorders: true,
    flipX: false,
    flipY: false,
    data: { role: "avatar" },
  };
}

function createAbsoluteClipPath(
  left: number,
  top: number,
  width: number,
  height: number,
  radius: number,
): Rect {
  return new Rect({
    left,
    top,
    width,
    height,
    rx: radius,
    ry: radius,
    originX: "left",
    originY: "top",
    absolutePositioned: true,
  });
}

function createStaticRect(
  definition: Extract<CardStaticObjectDefinition, { type: "rect" }>,
): Rect {
  return new Rect({
    ...createStaticObjectOptions(definition.id),
    left: definition.left,
    top: definition.top,
    width: definition.width,
    height: definition.height,
    fill: definition.fill,
    rx: definition.radius ?? 0,
    ry: definition.radius ?? 0,
    originX: "left",
    originY: "top",
  });
}

function createStaticCircle(
  definition: Extract<CardStaticObjectDefinition, { type: "circle" }>,
): Circle {
  return new Circle({
    ...createStaticObjectOptions(definition.id),
    left: definition.left,
    top: definition.top,
    radius: definition.radius,
    fill: definition.fill,
    originX: "center",
    originY: "center",
  });
}

function createStaticText(
  definition: Extract<CardStaticObjectDefinition, { type: "text" }>,
): FabricText {
  return new FabricText(definition.text, {
    ...createStaticObjectOptions(definition.id),
    left: definition.left,
    top: definition.top,
    fontSize: definition.fontSize,
    ...(definition.fontFamily === undefined
      ? null
      : { fontFamily: definition.fontFamily }),
    fontWeight: definition.fontWeight,
    fill: definition.fill,
    charSpacing:
      definition.letterSpacing === undefined
        ? 0
        : (definition.letterSpacing * 1000) / definition.fontSize,
    originX: "left",
    originY: "top",
  });
}

function configureStaticImage(
  definition: Extract<CardStaticObjectDefinition, { type: "image" }>,
  loadedImage: FabricImage,
): FabricImage {
  const radius = definition.radius ?? 0;
  const scaleX = definition.width / loadedImage.width;
  const scaleY = definition.height / loadedImage.height;
  loadedImage.set({
    ...createStaticObjectOptions(definition.id),
    left: definition.left,
    top: definition.top,
    scaleX,
    scaleY,
    originX: "left",
    originY: "top",
    clipPath:
      radius > 0
        ? createAbsoluteClipPath(
            definition.left,
            definition.top,
            definition.width,
            definition.height,
            radius,
          )
        : undefined,
  });
  return loadedImage;
}

export function createStaticFabricObject(
  definition: CardStaticObjectDefinition,
  loadedImage?: FabricImage,
): FabricObject {
  switch (definition.type) {
    case "rect":
      return createStaticRect(definition);
    case "circle":
      return createStaticCircle(definition);
    case "text":
      return createStaticText(definition);
    case "image":
      if (!loadedImage) {
        throw new TypeError(
          `A loaded FabricImage is required for static image ${definition.id}`,
        );
      }
      return configureStaticImage(definition, loadedImage);
  }
}

export function createEditableFabricText(
  definition: CardFieldDefinition,
  text: string,
  mode: RenderMode,
): IText {
  const policy = createEditableTextOptions(definition.field);
  return new IText(text, {
    ...policy,
    left: definition.left,
    top: definition.top,
    fontSize: definition.fontSize,
    fontFamily: definition.fontFamily,
    fontWeight: definition.fontWeight,
    fill: definition.fill,
    originX: "left",
    originY: "top",
    ...(mode === "export"
      ? {
          selectable: false,
          evented: false,
          editable: false,
          hasControls: false,
          hasBorders: false,
        }
      : null),
  });
}

export function configureAvatarImage(
  image: FabricImage,
  transform: AvatarTransform,
  frame: AvatarFrameDefinition,
  mode: RenderMode,
): FabricImage {
  image.set({
    ...createAvatarObjectOptions(),
    left: transform.left,
    top: transform.top,
    scaleX: transform.scale,
    scaleY: transform.scale,
    originX: "left",
    originY: "top",
    clipPath: createAbsoluteClipPath(
      frame.left,
      frame.top,
      frame.width,
      frame.height,
      frame.radius,
    ),
    ...(mode === "export"
      ? {
          selectable: false,
          evented: false,
          hasControls: false,
          hasBorders: false,
        }
      : null),
  });

  image.setControlsVisibility(
    mode === "interactive"
      ? {
          tl: true,
          tr: true,
          bl: true,
          br: true,
          mtr: false,
          ml: false,
          mr: false,
          mt: false,
          mb: false,
        }
      : {
          tl: false,
          tr: false,
          bl: false,
          br: false,
          mtr: false,
          ml: false,
          mr: false,
          mt: false,
          mb: false,
        },
  );
  return image;
}
