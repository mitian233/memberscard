import { IText } from "fabric";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bindTextEvents } from "@/fabric/bindTextEvents";
import type { CanvasAdapter, TextMeasurer } from "@/fabric/types";
import type {
  CardField,
  CardFieldDefinition,
  CardTemplateDefinition,
  FieldValidationError,
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

function createField(
  text: string,
  definition: Partial<CardFieldDefinition> = {},
): IText {
  return new IText(text, {
    left: 0,
    top: 0,
    fontSize: 40,
    fontFamily: "Arial",
    fontWeight: "normal",
    fill: "#000",
    editable: true,
    ...definition,
  });
}

function createTemplate(
  field: CardField,
  definition: Partial<CardFieldDefinition> = {},
): CardTemplateDefinition {
  const fieldDefinition: CardFieldDefinition = {
    role: "field",
    field,
    left: 0,
    top: 0,
    fontSize: 40,
    fontFamily: "Arial",
    fontWeight: "normal",
    fill: "#000",
    ...definition,
  };
  return {
    id: "current",
    canvas: { width: 960, height: 640, radius: 0 },
    assets: { background: "/background.png", logo: "/logo.png" },
    defaults: {
      name: "name",
      nameEn: "nameEn",
      bandName: "bandName",
      birthday: "birthday",
      avatar: { src: "/avatar.png", left: 0, top: 0, scale: 1 },
    },
    avatarFrame: { left: 0, top: 0, width: 100, height: 100, radius: 0 },
    fields: { [field]: fieldDefinition },
    staticObjects: [],
  };
}

function createKeyTarget(): EventTarget {
  return new EventTarget();
}

function pressKey(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function createMeasurer(): TextMeasurer {
  return vi.fn((text, options) => text.length * options.fontSize);
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        measureText: (value: string) => ({ width: value.length * 10 }),
      }) as unknown as CanvasRenderingContext2D,
  );
});

describe("bindTextEvents", () => {
  it("emits a canvas field patch after a changed event", () => {
    const canvas = createCanvas();
    const field = createField("before");
    const target = createKeyTarget();
    const patches: unknown[] = [];
    const disposer = bindTextEvents(
      canvas,
      { name: field },
      {
        template: createTemplate("name"),
        measureText: createMeasurer(),
        keyTarget: target,
        onDocumentPatch: (patch, source) => patches.push({ patch, source }),
        onFieldValidation: vi.fn(),
        onEditCancel: vi.fn(),
      },
    );

    field.set({ text: "after" });
    field.fire("changed");

    expect(field.text).toBe("after");
    expect(patches).toEqual([
      {
        patch: { type: "field", field: "name", value: "after" },
        source: "canvas",
      },
    ]);
    expect(canvas.renderCount).toBe(1);

    disposer();
  });

  it("fits a constrained field and clears a prior validation error", () => {
    const canvas = createCanvas();
    const field = createField("long", { fontSize: 40 });
    const validation =
      vi.fn<(field: CardField, error: FieldValidationError | null) => void>();
    const target = createKeyTarget();
    const disposer = bindTextEvents(
      canvas,
      { name: field },
      {
        template: createTemplate("name", {
          fontSize: 40,
          minSize: 20,
          maxWidth: 100,
        }),
        measureText: createMeasurer(),
        keyTarget: target,
        onDocumentPatch: vi.fn(),
        onFieldValidation: validation,
        onEditCancel: vi.fn(),
      },
    );

    field.fire("changed");

    expect(field.fontSize).toBe(25);
    expect(validation).toHaveBeenCalledWith("name", null);
    expect(canvas.renderCount).toBe(1);

    disposer();
  });

  it("reports an exact error at the minimum when constrained text remains too wide", () => {
    const canvas = createCanvas();
    const field = createField("long", { fontSize: 40 });
    const validation = vi.fn();
    const disposer = bindTextEvents(
      canvas,
      { name: field },
      {
        template: createTemplate("name", {
          fontSize: 40,
          minSize: 20,
          maxWidth: 10,
        }),
        measureText: createMeasurer(),
        keyTarget: createKeyTarget(),
        onDocumentPatch: vi.fn(),
        onFieldValidation: validation,
        onEditCancel: vi.fn(),
      },
    );

    field.fire("changed");

    expect(field.fontSize).toBe(20);
    expect(validation).toHaveBeenCalledWith("name", {
      field: "name",
      code: "text-too-wide",
      message: "内容过长，请缩短后重试。",
    });
    expect(canvas.renderCount).toBe(1);

    disposer();
  });

  it("uses the base size for unconstrained fields", () => {
    const canvas = createCanvas();
    const field = createField("long", { fontSize: 12 });
    const validation = vi.fn();
    const disposer = bindTextEvents(
      canvas,
      { name: field },
      {
        template: createTemplate("name", { fontSize: 40 }),
        measureText: createMeasurer(),
        keyTarget: createKeyTarget(),
        onDocumentPatch: vi.fn(),
        onFieldValidation: validation,
        onEditCancel: vi.fn(),
      },
    );

    field.fire("changed");

    expect(field.fontSize).toBe(40);
    expect(validation).toHaveBeenCalledWith("name", null);

    disposer();
  });

  it("restores the first editing field on Escape and prevents default", () => {
    const canvas = createCanvas();
    const field = createField("before", { fontSize: 40 });
    const target = createKeyTarget();
    const patches: unknown[] = [];
    const cancel = vi.fn();
    const disposer = bindTextEvents(
      canvas,
      { name: field },
      {
        template: createTemplate("name", {
          fontSize: 40,
          minSize: 20,
          maxWidth: 100,
        }),
        measureText: createMeasurer(),
        keyTarget: target,
        onDocumentPatch: (patch, source) => patches.push({ patch, source }),
        onFieldValidation: vi.fn(),
        onEditCancel: cancel,
      },
    );

    field.enterEditing();
    field.set({ text: "edited" });
    field.fire("editing:entered");
    field.set({ text: "edited-again" });
    const event = pressKey(target, "Escape");

    expect(field.text).toBe("before");
    expect(field.isEditing).toBe(false);
    expect(patches).toEqual([
      {
        patch: { type: "field", field: "name", value: "before" },
        source: "canvas",
      },
    ]);
    expect(cancel).toHaveBeenCalledWith("name", "before");
    expect(canvas.renderCount).toBe(1);
    expect(event.defaultPrevented).toBe(true);

    disposer();
  });

  it("does nothing for a normal exit, non-Escape key, or missing definition", () => {
    const canvas = createCanvas();
    const field = createField("before");
    const target = createKeyTarget();
    const cancel = vi.fn();
    const onDocumentPatch = vi.fn();
    const disposer = bindTextEvents(
      canvas,
      { name: field, birthday: createField("ignored") },
      {
        template: createTemplate("name"),
        measureText: createMeasurer(),
        keyTarget: target,
        onDocumentPatch,
        onFieldValidation: vi.fn(),
        onEditCancel: cancel,
      },
    );

    field.isEditing = true;
    field.fire("editing:entered");
    field.fire("editing:exited");
    pressKey(target, "Enter");
    pressKey(target, "Escape");

    expect(onDocumentPatch).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(canvas.renderCount).toBe(0);

    disposer();
  });

  it("skips a missing definition even when that field fires changed", () => {
    const canvas = createCanvas();
    const name = createField("name");
    const birthday = createField("birthday");
    const onDocumentPatch = vi.fn();
    const onFieldValidation = vi.fn();
    const disposer = bindTextEvents(
      canvas,
      { name, birthday },
      {
        template: createTemplate("name"),
        measureText: createMeasurer(),
        keyTarget: createKeyTarget(),
        onDocumentPatch,
        onFieldValidation,
        onEditCancel: vi.fn(),
      },
    );

    birthday.set({ text: "birthday changed" });
    birthday.fire("changed");

    expect(onDocumentPatch).not.toHaveBeenCalled();
    expect(onFieldValidation).not.toHaveBeenCalled();
    expect(canvas.renderCount).toBe(0);

    disposer();
  });

  it("clears an exact constrained-field error after a later valid change", () => {
    const canvas = createCanvas();
    const field = createField("long", { fontSize: 40 });
    const validation = vi.fn();
    const disposer = bindTextEvents(
      canvas,
      { name: field },
      {
        template: createTemplate("name", {
          fontSize: 40,
          minSize: 20,
          maxWidth: 50,
        }),
        measureText: vi.fn((text, options) => text.length * options.fontSize),
        keyTarget: createKeyTarget(),
        onDocumentPatch: vi.fn(),
        onFieldValidation: validation,
        onEditCancel: vi.fn(),
      },
    );

    field.fire("changed");
    expect(validation).toHaveBeenNthCalledWith(1, "name", {
      field: "name",
      code: "text-too-wide",
      message: "内容过长，请缩短后重试。",
    });

    field.set({ text: "a" });
    field.fire("changed");

    expect(validation).toHaveBeenNthCalledWith(2, "name", null);
    expect(field.fontSize).toBe(40);
    expect(canvas.renderCount).toBe(2);

    disposer();
  });

  it("leaves Escape editing state untouched when restored text measurement fails", () => {
    const canvas = createCanvas();
    const field = createField("before", { fontSize: 40 });
    const target = createKeyTarget();
    const onDocumentPatch = vi.fn();
    const onFieldValidation = vi.fn();
    const onEditCancel = vi.fn();
    const measureText = vi.fn(() => {
      throw new RangeError("measured width is invalid");
    });
    const disposer = bindTextEvents(
      canvas,
      { name: field },
      {
        template: createTemplate("name", {
          fontSize: 40,
          minSize: 20,
          maxWidth: 100,
        }),
        measureText,
        keyTarget: target,
        onDocumentPatch,
        onFieldValidation,
        onEditCancel,
      },
    );

    field.enterEditing();
    field.set({ text: "edited" });
    const textBeforeEscape = field.text;
    const fontSizeBeforeEscape = field.fontSize;
    const setCoords = vi.spyOn(field, "setCoords");
    const setCoordsBeforeEscape = setCoords.mock.calls.length;
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    const preventDefault = vi.spyOn(event, "preventDefault");

    expect(() => target.dispatchEvent(event)).toThrow(RangeError);

    expect(measureText).toHaveBeenCalled();
    expect(field.text).toBe(textBeforeEscape);
    expect(field.fontSize).toBe(fontSizeBeforeEscape);
    expect(field.isEditing).toBe(true);
    expect(setCoords).toHaveBeenCalledTimes(setCoordsBeforeEscape);
    expect(onDocumentPatch).not.toHaveBeenCalled();
    expect(onFieldValidation).not.toHaveBeenCalled();
    expect(onEditCancel).not.toHaveBeenCalled();
    expect(canvas.renderCount).toBe(0);
    expect(preventDefault).toHaveBeenCalledTimes(1);

    disposer();
  });

  it("cancels active fields in binding order, preserving the later snapshot", () => {
    const canvas = createCanvas();
    const first = createField("first");
    const second = createField("second");
    const template = createTemplate("name");
    template.fields.nameEn = {
      ...template.fields.name!,
      field: "nameEn",
      top: 10,
    };
    const target = createKeyTarget();
    const patches: Array<{ field: CardField; value: string }> = [];
    const onEditCancel = vi.fn();
    const disposer = bindTextEvents(
      canvas,
      { name: first, nameEn: second },
      {
        template,
        measureText: createMeasurer(),
        keyTarget: target,
        onDocumentPatch: (patch) => {
          if (patch.type === "field") {
            patches.push({ field: patch.field, value: patch.value });
          }
        },
        onFieldValidation: vi.fn(),
        onEditCancel,
      },
    );

    first.enterEditing();
    first.set({ text: "first edited" });
    second.enterEditing();
    second.set({ text: "second edited" });

    pressKey(target, "Escape");

    expect(first.text).toBe("first");
    expect(first.isEditing).toBe(false);
    expect(second.text).toBe("second edited");
    expect(second.isEditing).toBe(true);
    expect(patches).toEqual([{ field: "name", value: "first" }]);
    expect(onEditCancel).toHaveBeenNthCalledWith(1, "name", "first");
    expect(canvas.renderCount).toBe(1);

    pressKey(target, "Escape");

    expect(second.text).toBe("second");
    expect(second.isEditing).toBe(false);
    expect(patches).toEqual([
      { field: "name", value: "first" },
      { field: "nameEn", value: "second" },
    ]);
    expect(onEditCancel).toHaveBeenNthCalledWith(2, "nameEn", "second");
    expect(canvas.renderCount).toBe(2);

    disposer();
  });

  it("propagates an invalid measured width before side effects", () => {
    const canvas = createCanvas();
    const field = createField("bad");
    const onDocumentPatch = vi.fn();
    const validation = vi.fn();
    const disposer = bindTextEvents(
      canvas,
      { name: field },
      {
        template: createTemplate("name", { minSize: 20, maxWidth: 100 }),
        measureText: vi.fn(() => Number.NaN),
        keyTarget: createKeyTarget(),
        onDocumentPatch,
        onFieldValidation: validation,
        onEditCancel: vi.fn(),
      },
    );

    expect(() => field.fire("changed")).toThrow(RangeError);
    expect(onDocumentPatch).not.toHaveBeenCalled();
    expect(validation).not.toHaveBeenCalled();
    expect(canvas.renderCount).toBe(0);

    disposer();
  });

  it("rejects a missing key target before Fabric subscriptions", () => {
    const field = createField("before");
    const onSpy = vi.spyOn(field, "on");

    vi.stubGlobal("document", undefined);
    try {
      expect(() =>
        bindTextEvents(
          createCanvas(),
          { name: field },
          {
            template: createTemplate("name"),
            measureText: createMeasurer(),
            keyTarget: undefined,
            onDocumentPatch: vi.fn(),
            onFieldValidation: vi.fn(),
            onEditCancel: vi.fn(),
          },
        ),
      ).toThrow(TypeError);
      expect(onSpy).not.toHaveBeenCalled();

      expect(() =>
        bindTextEvents(
          createCanvas(),
          { name: field },
          {
            template: createTemplate("name"),
            measureText: createMeasurer(),
            keyTarget: null as unknown as EventTarget,
            onDocumentPatch: vi.fn(),
            onFieldValidation: vi.fn(),
            onEditCancel: vi.fn(),
          },
        ),
      ).toThrow(TypeError);
      expect(onSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("disposes Fabric listeners and the key listener idempotently", () => {
    const canvas = createCanvas();
    const field = createField("before");
    const target = createKeyTarget();
    const onDocumentPatch = vi.fn();
    const disposer = bindTextEvents(
      canvas,
      { name: field },
      {
        template: createTemplate("name"),
        measureText: createMeasurer(),
        keyTarget: target,
        onDocumentPatch,
        onFieldValidation: vi.fn(),
        onEditCancel: vi.fn(),
      },
    );
    const removeSpy = vi.spyOn(target, "removeEventListener");
    const offSpy = vi.spyOn(field, "off");

    disposer();
    disposer();
    field.fire("changed");
    pressKey(target, "Escape");

    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(offSpy).toHaveBeenCalledTimes(3);
    expect(offSpy.mock.calls.every((call) => call.length === 2)).toBe(true);
    expect(onDocumentPatch).not.toHaveBeenCalled();

    const field2 = createField("after");
    field2.fire("changed");
  });
});
