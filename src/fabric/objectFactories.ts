import type { CardField } from "@/types/card";

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
