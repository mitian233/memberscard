import { FabricImage, IText } from "fabric";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyCardPatchToScene } from "@/fabric/applyCardPatchToScene";
import type {
  CanvasAdapter,
  FabricCardScene,
  TextMeasurer,
} from "@/fabric/types";
import type {
  AvatarFrameDefinition,
  CardDocument,
  CardField,
  CardFieldDefinition,
  CardPatch,
  CardTemplateDefinition,
} from "@/types/card";

function createCanvas(): CanvasAdapter & { renderCount: number } {
  let renderCount = 0;
  return {
    raw: {} as CanvasAdapter["raw"],
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

function fieldDefinition(
  field: CardField = "name",
  options: Partial<CardFieldDefinition> = {},
): CardFieldDefinition {
  return {
    role: "field",
    field,
    left: 30,
    top: 40,
    fontSize: 40,
    fontFamily: "Noto Sans",
    fontWeight: "bold",
    fill: "#000",
    ...options,
  };
}

function createTemplate(
  definition: CardFieldDefinition = fieldDefinition(),
): CardTemplateDefinition {
  return {
    id: "current",
    canvas: { width: 960, height: 640, radius: 0 },
    assets: { background: "/background.png", logo: "/logo.png" },
    defaults: {
      name: "default name",
      nameEn: "default name en",
      bandName: "default band",
      birthday: "2000-01-01",
      avatar: { src: "/avatar.png", left: 0, top: 0, scale: 1 },
    },
    avatarFrame: frame,
    fields: { [definition.field]: definition },
    staticObjects: [],
  };
}

function createDocument(
  template: CardTemplateDefinition,
  overrides: Partial<CardDocument> = {},
): CardDocument {
  return {
    templateId: template.id,
    name: "document name",
    nameEn: "document name en",
    bandName: "document band",
    birthday: "2001-02-03",
    avatar: { src: "/avatar.png", left: 0, top: 20, scale: 1 },
    ...overrides,
  };
}

function createField(
  text = "before",
  options: Record<string, unknown> = {},
): IText {
  return new IText(text, {
    left: 30,
    top: 40,
    fontSize: 40,
    fontFamily: "Noto Sans",
    fontWeight: "bold",
    fill: "#000",
    ...options,
  });
}

function createAvatar(width = 200, height = 100): FabricImage {
  const element = document.createElement("img");
  element.width = width;
  element.height = height;
  return new FabricImage(element, {
    left: 0,
    top: 20,
    scaleX: 1,
    scaleY: 1,
  });
}

function createScene(
  field: IText | undefined,
  avatar = createAvatar(),
): Pick<FabricCardScene, "avatar" | "fields"> {
  return { avatar, fields: field === undefined ? {} : { name: field } };
}

const measureBySize: TextMeasurer = vi.fn((text, options) => {
  return text.length * options.fontSize;
});

describe("applyCardPatchToScene", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          measureText: (value: string) => ({ width: value.length * 10 }),
        }) as unknown as CanvasRenderingContext2D,
    );
  });

  it("applies an unconstrained field at the template base size and renders once", () => {
    const template = createTemplate(
      fieldDefinition("name", { minSize: undefined }),
    );
    const currentDocument = createDocument(template, { name: "before" });
    const field = createField("old", { fontSize: 12 });
    const scene = createScene(field);
    const canvas = createCanvas();
    const measureText = vi.fn<TextMeasurer>();
    const setCoords = vi.spyOn(field, "setCoords");

    const result = applyCardPatchToScene(
      canvas,
      scene,
      { type: "field", field: "name", value: "new" },
      { currentDocument, template, measureText },
    );

    expect(result).toEqual({ kind: "applied", field: "name", error: null });
    expect(field.text).toBe("new");
    expect(field.fontSize).toBe(40);
    expect(measureText).not.toHaveBeenCalled();
    // Fabric refreshes coordinates internally when setting text; the bridge then
    // performs its explicit setCoords() call as required by the contract.
    expect(setCoords).toHaveBeenCalledTimes(2);
    expect(canvas.renderCount).toBe(1);
  });

  it("fits a valid constrained field with exact measurement options", () => {
    const template = createTemplate(
      fieldDefinition("name", { fontSize: 40, minSize: 20, maxWidth: 100 }),
    );
    const currentDocument = createDocument(template, { name: "before" });
    const field = createField("old", { fontSize: 12 });
    const scene = createScene(field);
    const canvas = createCanvas();
    const measureText = vi.fn<TextMeasurer>(measureBySize);
    const set = vi.spyOn(field, "set");
    const setCoords = vi.spyOn(field, "setCoords");

    const result = applyCardPatchToScene(
      canvas,
      scene,
      { type: "field", field: "name", value: "long" },
      { currentDocument, template, measureText },
    );

    expect(result).toEqual({ kind: "applied", field: "name", error: null });
    expect(field.text).toBe("long");
    expect(field.fontSize).toBe(25);
    expect(measureText).toHaveBeenCalledWith("long", {
      fontSize: 40,
      fontFamily: "Noto Sans",
      fontWeight: "bold",
    });
    expect(measureText).toHaveBeenLastCalledWith("long", {
      fontSize: 25,
      fontFamily: "Noto Sans",
      fontWeight: "bold",
    });
    expect(set).toHaveBeenCalledWith({ text: "long", fontSize: 25 });
    expect(setCoords).toHaveBeenCalledTimes(2);
    expect(canvas.renderCount).toBe(1);
  });

  it("returns the exact too-wide error at minimum and clears it on a later valid patch", () => {
    const template = createTemplate(
      fieldDefinition("name", { fontSize: 40, minSize: 20, maxWidth: 10 }),
    );
    const currentDocument = createDocument(template, { name: "before" });
    const field = createField("old");
    const scene = createScene(field);
    const canvas = createCanvas();
    const measureText = vi.fn<TextMeasurer>((text, options) => {
      return text === "long" ? text.length * options.fontSize : 1;
    });

    const tooWide = applyCardPatchToScene(
      canvas,
      scene,
      { type: "field", field: "name", value: "long" },
      { currentDocument, template, measureText },
    );
    expect(tooWide).toEqual({
      kind: "applied",
      field: "name",
      error: {
        field: "name",
        code: "text-too-wide",
        message: "内容过长，请缩短后重试。",
      },
    });
    expect(field.text).toBe("long");
    expect(field.fontSize).toBe(20);
    expect(canvas.renderCount).toBe(1);

    const valid = applyCardPatchToScene(
      canvas,
      scene,
      { type: "field", field: "name", value: "ok" },
      { currentDocument, template, measureText },
    );
    expect(valid).toEqual({ kind: "applied", field: "name", error: null });
    expect(field.text).toBe("ok");
    expect(field.fontSize).toBe(40);
    expect(canvas.renderCount).toBe(2);
  });

  it.each([
    [
      "missing template field",
      () => ({
        template: createTemplate(fieldDefinition("name")),
        field: createField(),
        patch: { type: "field", field: "nameEn", value: "x" } as CardPatch,
      }),
    ],
    [
      "missing document field",
      () => ({
        template: createTemplate(fieldDefinition("birthday")),
        field: createField(),
        patch: { type: "field", field: "birthday", value: "x" } as CardPatch,
      }),
    ],
    [
      "missing scene field",
      () => ({
        template: createTemplate(fieldDefinition("name")),
        field: undefined,
        patch: { type: "field", field: "name", value: "x" } as CardPatch,
      }),
    ],
  ])("rejects %s before any field side effects", (_label, setup) => {
    const { template, field, patch } = setup();
    const currentDocument = createDocument(template, { birthday: undefined });
    const scene = createScene(field);
    const canvas = createCanvas();
    const fieldObject = scene.fields.name ?? scene.fields.birthday;
    const set =
      fieldObject === undefined ? undefined : vi.spyOn(fieldObject, "set");
    const setCoords =
      fieldObject === undefined
        ? undefined
        : vi.spyOn(fieldObject, "setCoords");

    expect(() =>
      applyCardPatchToScene(canvas, scene, patch, {
        currentDocument,
        template,
        measureText: measureBySize,
      }),
    ).toThrow(RangeError);
    expect(set?.mock.calls ?? []).toHaveLength(0);
    expect(setCoords?.mock.calls ?? []).toHaveLength(0);
    expect(canvas.renderCount).toBe(0);
  });

  it("rejects an invalid measured width before mutating the IText", () => {
    const template = createTemplate(
      fieldDefinition("name", { minSize: 20, maxWidth: 100 }),
    );
    const currentDocument = createDocument(template);
    const field = createField();
    const scene = createScene(field);
    const canvas = createCanvas();
    const set = vi.spyOn(field, "set");
    const setCoords = vi.spyOn(field, "setCoords");

    expect(() =>
      applyCardPatchToScene(
        canvas,
        scene,
        { type: "field", field: "name", value: "bad" },
        {
          currentDocument,
          template,
          measureText: vi.fn(() => Number.NaN),
        },
      ),
    ).toThrow(RangeError);
    expect(field.text).toBe("before");
    expect(field.fontSize).toBe(40);
    expect(set).not.toHaveBeenCalled();
    expect(setCoords).not.toHaveBeenCalled();
    expect(canvas.renderCount).toBe(0);
  });

  it("applies a same-source clamped avatar transform and resets angle and flips", () => {
    const template = createTemplate();
    const currentDocument = createDocument(template, {
      avatar: { src: "/avatar.png", left: 0, top: 0, scale: 1 },
    });
    const avatar = createAvatar();
    avatar.set({ angle: 45, flipX: true, flipY: true });
    const scene = createScene(undefined, avatar);
    const canvas = createCanvas();
    const set = vi.spyOn(avatar, "set");
    const setCoords = vi.spyOn(avatar, "setCoords");

    const result = applyCardPatchToScene(
      canvas,
      scene,
      {
        type: "avatar",
        value: { src: "/avatar.png", left: 500, top: -500, scale: 0.4 },
      },
      { currentDocument, template, measureText: measureBySize },
    );

    expect(result).toEqual({ kind: "applied", field: null, error: null });
    expect(avatar).toMatchObject({
      left: 10,
      top: 20,
      scaleX: 0.8,
      scaleY: 0.8,
      angle: 0,
      flipX: false,
      flipY: false,
    });
    expect(set).toHaveBeenCalledWith({
      left: 10,
      top: 20,
      scaleX: 0.8,
      scaleY: 0.8,
      angle: 0,
      flipX: false,
      flipY: false,
    });
    expect(setCoords).toHaveBeenCalledTimes(1);
    expect(canvas.renderCount).toBe(1);
  });

  it("requires a full render for a changed avatar source without side effects", () => {
    const template = createTemplate();
    const currentDocument = createDocument(template);
    const avatar = createAvatar();
    const scene = createScene(undefined, avatar);
    const canvas = createCanvas();
    const set = vi.spyOn(avatar, "set");
    const setCoords = vi.spyOn(avatar, "setCoords");

    const result = applyCardPatchToScene(
      canvas,
      scene,
      {
        type: "avatar",
        value: { src: "/new-avatar.png", left: Number.NaN, top: 2, scale: 0 },
      },
      { currentDocument, template, measureText: measureBySize },
    );

    expect(result).toEqual({
      kind: "requires-render",
      reason: "avatar-source-changed",
    });
    expect(set).not.toHaveBeenCalled();
    expect(setCoords).not.toHaveBeenCalled();
    expect(canvas.renderCount).toBe(0);
  });

  it.each([
    [
      "invalid live image",
      () => createAvatar(0, 100),
      { src: "/avatar.png", left: 0, top: 0, scale: 1 },
    ],
    [
      "invalid patch geometry",
      () => createAvatar(),
      { src: "/avatar.png", left: 0, top: 0, scale: Number.NaN },
    ],
  ])(
    "rejects %s before mutating the avatar",
    (_label, createLiveAvatar, value) => {
      const template = createTemplate();
      const currentDocument = createDocument(template);
      const avatar = createLiveAvatar();
      const scene = createScene(undefined, avatar);
      const canvas = createCanvas();
      const set = vi.spyOn(avatar, "set");
      const setCoords = vi.spyOn(avatar, "setCoords");

      expect(() =>
        applyCardPatchToScene(
          canvas,
          scene,
          { type: "avatar", value },
          { currentDocument, template, measureText: measureBySize },
        ),
      ).toThrow(RangeError);
      expect(set).not.toHaveBeenCalled();
      expect(setCoords).not.toHaveBeenCalled();
      expect(canvas.renderCount).toBe(0);
    },
  );

  it("rejects a template mismatch before any canvas or scene mutation", () => {
    const template = createTemplate();
    const currentDocument = createDocument(template, { templateId: "legacy" });
    const field = createField();
    const avatar = createAvatar();
    const scene = createScene(field, avatar);
    const canvas = createCanvas();
    const fieldSet = vi.spyOn(field, "set");
    const avatarSet = vi.spyOn(avatar, "set");

    expect(() =>
      applyCardPatchToScene(
        canvas,
        scene,
        { type: "field", field: "name", value: "new" },
        { currentDocument, template, measureText: measureBySize },
      ),
    ).toThrow(RangeError);
    expect(fieldSet).not.toHaveBeenCalled();
    expect(avatarSet).not.toHaveBeenCalled();
    expect(canvas.renderCount).toBe(0);
  });

  it("does not mutate patch, document, template, or scene collections", () => {
    const definition = fieldDefinition("name", {
      fontSize: 40,
      minSize: 20,
      maxWidth: 100,
    });
    const template = createTemplate(definition);
    const currentDocument = createDocument(template, { name: "before" });
    const patch: CardPatch = {
      type: "field",
      field: "name",
      value: "long",
    };
    const scene = createScene(createField());
    const originalPatch = structuredClone(patch);
    const originalDocument = structuredClone(currentDocument);
    const originalDefinition = structuredClone(definition);
    const fieldsBefore = scene.fields;

    applyCardPatchToScene(createCanvas(), scene, patch, {
      currentDocument,
      template,
      measureText: measureBySize,
    });

    expect(patch).toEqual(originalPatch);
    expect(currentDocument).toEqual(originalDocument);
    expect(definition).toEqual(originalDefinition);
    expect(scene.fields).toBe(fieldsBefore);
  });
});
