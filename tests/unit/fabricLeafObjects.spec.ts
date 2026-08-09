import { Circle, FabricImage, FabricText, IText, Rect } from "fabric";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  configureAvatarImage,
  createEditableFabricText,
  createStaticFabricObject,
} from "@/fabric/objectFactories";
import type {
  AvatarFrameDefinition,
  AvatarTransform,
  CardFieldDefinition,
  CardStaticObjectDefinition,
} from "@/types/card";

function createImage(width = 100, height = 80): FabricImage {
  const element = document.createElement("img");
  element.width = width;
  element.height = height;
  return new FabricImage(element);
}

function createMeasuringContext(): CanvasRenderingContext2D {
  const context = {
    measureText: (value: string) => ({ width: value.length * 10 }),
  } as unknown as CanvasRenderingContext2D;
  return context;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
    createMeasuringContext(),
  );
});

describe("typed Fabric leaf objects", () => {
  it("creates fixed rectangles with template origins and radius", () => {
    const definition: CardStaticObjectDefinition = {
      role: "static",
      id: "panel",
      type: "rect",
      left: 10,
      top: 20,
      width: 300,
      height: 120,
      radius: 12,
      fill: "#fff",
    };

    const object = createStaticFabricObject(definition);

    expect(object).toBeInstanceOf(Rect);
    expect(object).toMatchObject({
      left: 10,
      top: 20,
      width: 300,
      height: 120,
      rx: 12,
      ry: 12,
      fill: "#fff",
      originX: "left",
      originY: "top",
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      data: { role: "static", id: "panel" },
    });
  });

  it("creates fixed circles around template center coordinates", () => {
    const object = createStaticFabricObject({
      role: "static",
      id: "dot",
      type: "circle",
      left: 40,
      top: 50,
      radius: 7.5,
      fill: "#000",
    });

    expect(object).toBeInstanceOf(Circle);
    expect(object).toMatchObject({
      left: 40,
      top: 50,
      radius: 7.5,
      originX: "center",
      originY: "center",
      data: { role: "static", id: "dot" },
      selectable: false,
      evented: false,
    });
  });

  it("creates fixed FabricText with pixel letter spacing converted to charSpacing", () => {
    const object = createStaticFabricObject({
      role: "static",
      id: "title",
      type: "text",
      text: "TITLE",
      left: 30,
      top: 40,
      fontFamily: "Poppins",
      fontWeight: "bold",
      fontSize: 20,
      fill: "#000",
      letterSpacing: 5,
    });

    expect(object).toBeInstanceOf(FabricText);
    expect(object).toMatchObject({
      text: "TITLE",
      left: 30,
      top: 40,
      fontFamily: "Poppins",
      fontWeight: "bold",
      fontSize: 20,
      fill: "#000",
      charSpacing: 250,
      originX: "left",
      originY: "top",
      data: { role: "static", id: "title" },
      selectable: false,
      evented: false,
    });
  });

  it("configures a fixed image and absolute rounded clip", () => {
    const image = createImage();
    const definition: CardStaticObjectDefinition = {
      role: "static",
      id: "background",
      type: "image",
      asset: "background",
      left: 10,
      top: 20,
      width: 300,
      height: 120,
      radius: 12,
    };

    const object = createStaticFabricObject(definition, image);

    expect(object).toBe(image);
    expect(image).toMatchObject({
      left: 10,
      top: 20,
      width: 300,
      height: 120,
      originX: "left",
      originY: "top",
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      data: { role: "static", id: "background" },
    });
    expect(image.clipPath).toBeInstanceOf(Rect);
    expect(image.clipPath).toMatchObject({
      left: 10,
      top: 20,
      width: 300,
      height: 120,
      rx: 12,
      ry: 12,
      originX: "left",
      originY: "top",
      absolutePositioned: true,
    });
  });

  it("requires a loaded image for image definitions", () => {
    expect(() =>
      createStaticFabricObject({
        role: "static",
        id: "logo",
        type: "image",
        asset: "logo",
        left: 0,
        top: 0,
        width: 100,
        height: 40,
      }),
    ).toThrow(TypeError);
  });

  it("creates interactive and export IText with field data and locks", () => {
    const definition: CardFieldDefinition = {
      role: "field",
      field: "name",
      left: 30,
      top: 40,
      fontSize: 20,
      fontFamily: "Poppins",
      fontWeight: "bold",
      fill: "#000",
    };

    const interactive = createEditableFabricText(
      definition,
      "Mika",
      "interactive",
    );
    const exported = createEditableFabricText(definition, "Mika", "export");

    expect(interactive).toBeInstanceOf(IText);
    expect(interactive).toMatchObject({
      text: "Mika",
      left: 30,
      top: 40,
      fontSize: 20,
      fontFamily: "Poppins",
      fontWeight: "bold",
      fill: "#000",
      originX: "left",
      originY: "top",
      selectable: true,
      evented: true,
      editable: true,
      hasControls: false,
      hasBorders: true,
      lockMovementX: true,
      lockScalingX: true,
      lockRotation: true,
      data: { role: "field", field: "name" },
    });
    expect(exported).toMatchObject({
      selectable: false,
      evented: false,
      editable: false,
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockScalingX: true,
      lockRotation: true,
      data: { role: "field", field: "name" },
    });
  });

  it("configures interactive avatar controls and export locks immutably", () => {
    const image = createImage();
    const transform: AvatarTransform = {
      src: "/avatar.png",
      left: -20,
      top: 30,
      scale: 0.6,
    };
    const frame: AvatarFrameDefinition = {
      left: 10,
      top: 20,
      width: 300,
      height: 200,
      radius: 20,
    };
    const transformBefore = { ...transform };
    const frameBefore = { ...frame };

    const interactive = configureAvatarImage(
      image,
      transform,
      frame,
      "interactive",
    );

    expect(interactive).toBe(image);
    expect(image).toMatchObject({
      left: -20,
      top: 30,
      scaleX: 0.6,
      scaleY: 0.6,
      originX: "left",
      originY: "top",
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
      flipX: false,
      flipY: false,
      data: { role: "avatar" },
    });
    expect(image.isControlVisible("tl")).toBe(true);
    expect(image.isControlVisible("tr")).toBe(true);
    expect(image.isControlVisible("bl")).toBe(true);
    expect(image.isControlVisible("br")).toBe(true);
    for (const key of ["mtr", "ml", "mr", "mt", "mb"]) {
      expect(image.isControlVisible(key)).toBe(false);
    }
    expect(image.clipPath).toBeInstanceOf(Rect);
    expect(image.clipPath).toMatchObject({
      left: 10,
      top: 20,
      width: 300,
      height: 200,
      rx: 20,
      ry: 20,
      originX: "left",
      originY: "top",
      absolutePositioned: true,
    });
    expect(transform).toEqual(transformBefore);
    expect(frame).toEqual(frameBefore);

    const exportedImage = createImage();
    configureAvatarImage(exportedImage, transform, frame, "export");
    expect(exportedImage).toMatchObject({
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      flipX: false,
      flipY: false,
      data: { role: "avatar" },
    });
  });
});
