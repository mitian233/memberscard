import type { FabricImage, IText } from "fabric";

import { clampAvatarTransform } from "@/editor/avatarGeometry";
import { fitText } from "@/editor/textFit";
import type {
  CardDocument,
  CardField,
  CardFieldDefinition,
  CardPatch,
  CardTemplateDefinition,
  FieldValidationError,
} from "@/types/card";

import type { CanvasAdapter, FabricCardScene, TextMeasurer } from "./types";

export interface ApplyCardPatchToSceneOptions {
  currentDocument: CardDocument;
  template: CardTemplateDefinition;
  measureText: TextMeasurer;
}

export type ApplyCardPatchToSceneResult =
  | {
      kind: "applied";
      field: CardField | null;
      error: FieldValidationError | null;
    }
  | {
      kind: "requires-render";
      reason: "avatar-source-changed";
    };

const TOO_WIDE_MESSAGE = "内容过长，请缩短后重试。";

function assertTemplateMatch(
  currentDocument: CardDocument,
  template: CardTemplateDefinition,
): void {
  if (currentDocument.templateId !== template.id) {
    throw new RangeError(
      `Document template ${currentDocument.templateId} does not match template ${template.id}`,
    );
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite positive number`);
  }
}

function resolveFieldDefinition(
  template: CardTemplateDefinition,
  field: CardField,
): CardFieldDefinition {
  const definition = template.fields[field];
  if (definition === undefined) {
    throw new RangeError(`Missing template field definition for ${field}`);
  }
  return definition;
}

function resolveDocumentField(
  currentDocument: CardDocument,
  field: CardField,
): string {
  const value = currentDocument[field];
  if (typeof value !== "string") {
    throw new RangeError(`Missing document field ${field}`);
  }
  return value;
}

function resolveSceneField(
  scene: Pick<FabricCardScene, "avatar" | "fields">,
  field: CardField,
): IText {
  const object = scene.fields[field];
  if (object === undefined || object === null) {
    throw new RangeError(`Missing scene field ${field}`);
  }
  return object;
}

function measureOptions(
  definition: CardFieldDefinition,
  fontSize: number,
): Parameters<TextMeasurer>[1] {
  if (definition.fontFamily === undefined) {
    return { fontSize, fontWeight: definition.fontWeight };
  }

  return {
    fontSize,
    fontFamily: definition.fontFamily,
    fontWeight: definition.fontWeight,
  };
}

function evaluateField(
  definition: CardFieldDefinition,
  field: CardField,
  text: string,
  measureText: TextMeasurer,
): { fontSize: number; error: FieldValidationError | null } {
  assertPositiveFinite(definition.fontSize, "field base size");

  if (definition.minSize === undefined || definition.maxWidth === undefined) {
    return { fontSize: definition.fontSize, error: null };
  }

  const result = fitText({
    text,
    baseSize: definition.fontSize,
    minSize: definition.minSize,
    maxWidth: definition.maxWidth,
    measure: (value, fontSize) =>
      measureText(value, measureOptions(definition, fontSize)),
  });

  return {
    fontSize: result.fontSize,
    error: result.valid
      ? null
      : {
          field,
          code: "text-too-wide",
          message: TOO_WIDE_MESSAGE,
        },
  };
}

function applyFieldPatch(
  canvas: CanvasAdapter,
  scene: Pick<FabricCardScene, "avatar" | "fields">,
  patch: Extract<CardPatch, { type: "field" }>,
  options: ApplyCardPatchToSceneOptions,
): ApplyCardPatchToSceneResult {
  const definition = resolveFieldDefinition(options.template, patch.field);
  resolveDocumentField(options.currentDocument, patch.field);
  const object = resolveSceneField(scene, patch.field);
  if (typeof patch.value !== "string") {
    throw new RangeError(`Field ${patch.field} value must be a string`);
  }

  const evaluation = evaluateField(
    definition,
    patch.field,
    patch.value,
    options.measureText,
  );

  object.set({ text: patch.value, fontSize: evaluation.fontSize });
  object.setCoords();
  canvas.requestRenderAll();

  return { kind: "applied", field: patch.field, error: evaluation.error };
}

function resolveAvatarSize(avatar: FabricImage): {
  width: number;
  height: number;
} {
  const size = avatar.getOriginalSize();
  if (size === undefined || size === null) {
    throw new RangeError("Avatar image size is required");
  }
  assertPositiveFinite(size.width, "image width");
  assertPositiveFinite(size.height, "image height");
  return { width: size.width, height: size.height };
}

function applyAvatarPatch(
  canvas: CanvasAdapter,
  scene: Pick<FabricCardScene, "avatar" | "fields">,
  patch: Extract<CardPatch, { type: "avatar" }>,
  options: ApplyCardPatchToSceneOptions,
): ApplyCardPatchToSceneResult {
  const currentAvatar = options.currentDocument.avatar;
  if (patch.value.src !== currentAvatar.src) {
    return { kind: "requires-render", reason: "avatar-source-changed" };
  }

  if (typeof patch.value.src !== "string") {
    throw new RangeError("Avatar source must be a string");
  }

  const avatar = scene.avatar;
  if (avatar === undefined || avatar === null) {
    throw new RangeError("Missing scene avatar");
  }

  const corrected = clampAvatarTransform(
    patch.value,
    resolveAvatarSize(avatar),
    options.template.avatarFrame,
  );

  avatar.set({
    left: corrected.left,
    top: corrected.top,
    scaleX: corrected.scale,
    scaleY: corrected.scale,
    angle: 0,
    flipX: false,
    flipY: false,
  });
  avatar.setCoords();
  canvas.requestRenderAll();

  return { kind: "applied", field: null, error: null };
}

export function applyCardPatchToScene(
  canvas: CanvasAdapter,
  scene: Pick<FabricCardScene, "avatar" | "fields">,
  patch: CardPatch,
  options: ApplyCardPatchToSceneOptions,
): ApplyCardPatchToSceneResult {
  assertTemplateMatch(options.currentDocument, options.template);

  switch (patch.type) {
    case "field":
      return applyFieldPatch(canvas, scene, patch, options);
    case "avatar":
      return applyAvatarPatch(canvas, scene, patch, options);
    default:
      throw new RangeError("Unsupported card patch type");
  }
}
