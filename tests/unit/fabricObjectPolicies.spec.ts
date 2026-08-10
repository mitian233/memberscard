import { describe, expect, it, vi } from "vitest";

const fabricConstructors = vi.hoisted(() => ({
  Canvas: vi.fn(),
  StaticCanvas: vi.fn(),
  FabricImage: vi.fn(),
  IText: vi.fn(),
}));

vi.mock("fabric", () => fabricConstructors, { virtual: true });

import {
  createAvatarObjectOptions,
  createEditableTextOptions,
  createStaticObjectOptions,
} from "@/fabric/objectFactories";

describe("Fabric object policies", () => {
  it("creates a fully locked policy for static objects", () => {
    expect(createStaticObjectOptions("background")).toEqual({
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
      data: { role: "static", id: "background" },
    });
  });

  it("creates a locked editable-text policy for each card field", () => {
    expect(createEditableTextOptions("nameEn")).toEqual({
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
      data: { role: "field", field: "nameEn" },
    });
  });

  it("creates a selectable, scalable, non-flippable avatar policy", () => {
    expect(createAvatarObjectOptions()).toEqual({
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
    });
  });

  it("returns independent roots and data objects on every call", () => {
    const firstStatic = createStaticObjectOptions("logo");
    const secondStatic = createStaticObjectOptions("logo");
    const firstText = createEditableTextOptions("name");
    const secondText = createEditableTextOptions("name");
    const firstAvatar = createAvatarObjectOptions();
    const secondAvatar = createAvatarObjectOptions();

    expect(firstStatic).not.toBe(secondStatic);
    expect(firstStatic.data).not.toBe(secondStatic.data);
    expect(firstText).not.toBe(secondText);
    expect(firstText.data).not.toBe(secondText.data);
    expect(firstAvatar).not.toBe(secondAvatar);
    expect(firstAvatar.data).not.toBe(secondAvatar.data);
  });

  it("does not invoke Fabric constructors while building policies", () => {
    createStaticObjectOptions("frame");
    createEditableTextOptions("birthday");
    createAvatarObjectOptions();

    expect(fabricConstructors.Canvas).not.toHaveBeenCalled();
    expect(fabricConstructors.StaticCanvas).not.toHaveBeenCalled();
    expect(fabricConstructors.FabricImage).not.toHaveBeenCalled();
    expect(fabricConstructors.IText).not.toHaveBeenCalled();
  });
});
