import type { IText } from "fabric";

import { fitText, type FitTextResult } from "@/editor/textFit";
import type {
  CardField,
  CardPatch,
  CardTemplateDefinition,
  FieldValidationError,
  PatchSource,
} from "@/types/card";

import type { CanvasAdapter, TextMeasurer } from "./types";

export interface BindTextEventsOptions {
  template: CardTemplateDefinition;
  measureText: TextMeasurer;
  keyTarget?: EventTarget;
  onDocumentPatch(patch: CardPatch, source: PatchSource): void;
  onFieldValidation(field: CardField, error: FieldValidationError | null): void;
  onEditCancel(field: CardField, restoredValue: string): void;
}

interface TextBinding {
  field: CardField;
  object: IText;
  definition: NonNullable<CardTemplateDefinition["fields"][CardField]>;
}

interface TextEvaluation extends FitTextResult {
  text: string;
}

const TOO_WIDE_MESSAGE = "内容过长，请缩短后重试。";

function resolveKeyTarget(target: EventTarget | undefined): EventTarget {
  if (target !== undefined && target !== null) {
    return target;
  }

  const documentTarget =
    typeof globalThis.document === "undefined"
      ? undefined
      : globalThis.document;
  if (documentTarget === undefined) {
    throw new TypeError(
      "A key target is required when document is unavailable",
    );
  }

  return documentTarget;
}

function createBindings(
  fields: Partial<Record<CardField, IText>>,
  template: CardTemplateDefinition,
): TextBinding[] {
  const bindings: TextBinding[] = [];

  for (const field of Object.keys(fields) as CardField[]) {
    const object = fields[field];
    const definition = template.fields[field];
    if (object === undefined || definition === undefined) {
      continue;
    }

    bindings.push({ field, object, definition });
  }

  return bindings;
}

function evaluateText(
  binding: TextBinding,
  text: string,
  measureText: TextMeasurer,
): TextEvaluation {
  const { definition } = binding;
  if (definition.minSize === undefined || definition.maxWidth === undefined) {
    return { text, fontSize: definition.fontSize, valid: true };
  }

  const result = fitText({
    text,
    baseSize: definition.fontSize,
    minSize: definition.minSize,
    maxWidth: definition.maxWidth,
    measure: (value, fontSize) =>
      measureText(
        value,
        definition.fontFamily === undefined
          ? { fontSize, fontWeight: definition.fontWeight }
          : {
              fontSize,
              fontFamily: definition.fontFamily,
              fontWeight: definition.fontWeight,
            },
      ),
  });

  return { text, ...result };
}

function validationFor(
  binding: TextBinding,
  evaluation: TextEvaluation,
): FieldValidationError | null {
  if (evaluation.valid) {
    return null;
  }

  return {
    field: binding.field,
    code: "text-too-wide",
    message: TOO_WIDE_MESSAGE,
  };
}

function applyObjectEvaluation(
  binding: TextBinding,
  evaluation: TextEvaluation,
  options: BindTextEventsOptions,
  restoreText: boolean,
): void {
  if (restoreText) {
    binding.object.set({
      text: evaluation.text,
      fontSize: evaluation.fontSize,
    });
  } else {
    binding.object.set("fontSize", evaluation.fontSize);
  }
  options.onFieldValidation(binding.field, validationFor(binding, evaluation));
}

function emitTextPatch(
  canvas: CanvasAdapter,
  binding: TextBinding,
  evaluation: TextEvaluation,
  onDocumentPatch: BindTextEventsOptions["onDocumentPatch"],
): void {
  binding.object.setCoords();
  canvas.requestRenderAll();
  onDocumentPatch(
    {
      type: "field",
      field: binding.field,
      value: evaluation.text,
    },
    "canvas",
  );
}

export function bindTextEvents(
  canvas: CanvasAdapter,
  fields: Partial<Record<CardField, IText>>,
  options: BindTextEventsOptions,
): () => void {
  const keyTarget = resolveKeyTarget(options.keyTarget);
  const bindings = createBindings(fields, options.template);
  const snapshots = new Map<CardField, string>();
  const editing = new Set<CardField>();
  const eventDisposers: VoidFunction[] = [];
  let disposed = false;

  const handleEntered = (binding: TextBinding): (() => void) => {
    return (): void => {
      if (disposed) {
        return;
      }

      editing.add(binding.field);
      if (!snapshots.has(binding.field)) {
        snapshots.set(binding.field, binding.object.text ?? "");
      }
    };
  };

  const handleExited = (binding: TextBinding): (() => void) => {
    return (): void => {
      if (disposed) {
        return;
      }

      editing.delete(binding.field);
      snapshots.delete(binding.field);
    };
  };

  const handleChanged = (binding: TextBinding): (() => void) => {
    return (): void => {
      if (disposed) {
        return;
      }

      const text = binding.object.text ?? "";
      const evaluation = evaluateText(binding, text, options.measureText);
      applyObjectEvaluation(binding, evaluation, options, false);
      emitTextPatch(canvas, binding, evaluation, options.onDocumentPatch);
    };
  };

  for (const binding of bindings) {
    eventDisposers.push(
      binding.object.on("editing:entered", handleEntered(binding)),
      binding.object.on("editing:exited", handleExited(binding)),
      binding.object.on("changed", handleChanged(binding)),
    );
  }

  const handleKeyDown = (event: Event): void => {
    if (disposed || (event as KeyboardEvent).key !== "Escape") {
      return;
    }

    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    for (const binding of bindings) {
      if (!editing.has(binding.field)) {
        continue;
      }

      const restoredValue = snapshots.get(binding.field);
      if (restoredValue === undefined) {
        continue;
      }

      const evaluation = evaluateText(
        binding,
        restoredValue,
        options.measureText,
      );

      editing.delete(binding.field);
      snapshots.delete(binding.field);
      applyObjectEvaluation(binding, evaluation, options, true);
      binding.object.exitEditing();
      emitTextPatch(canvas, binding, evaluation, options.onDocumentPatch);
      options.onEditCancel(binding.field, restoredValue);
      break;
    }
  };

  keyTarget.addEventListener("keydown", handleKeyDown);

  return (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    keyTarget.removeEventListener("keydown", handleKeyDown);
    for (const dispose of eventDisposers) {
      dispose();
    }
  };
}
