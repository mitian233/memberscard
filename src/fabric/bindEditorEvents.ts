import { bindAvatarEvents } from "./bindAvatarEvents";
import { bindAvatarPinchEvents } from "./bindAvatarPinchEvents";
import { bindSelectionEvents } from "./bindSelectionEvents";
import { bindTextEvents } from "./bindTextEvents";
import type {
  CardField,
  CardPatch,
  CardTemplateDefinition,
  EditorSelection,
  FieldValidationError,
  PatchSource,
} from "@/types/card";

import type {
  FabricCardScene,
  InteractiveCanvasAdapter,
  TextMeasurer,
} from "./types";

export interface BindEditorEventsOptions {
  template: CardTemplateDefinition;
  measureText: TextMeasurer;
  pointerTarget: HTMLElement;
  keyTarget?: EventTarget;
  avatarSource(): string;
  onDocumentPatch(patch: CardPatch, source: PatchSource): void;
  onSelectionChange(selection: EditorSelection): void;
  onFieldValidation(field: CardField, error: FieldValidationError | null): void;
  onEditCancel(field: CardField, restoredValue: string): void;
}

type EventDisposer = () => void;

function disposeAll(disposers: readonly EventDisposer[]): void {
  let firstError: unknown;
  let hasError = false;

  for (let index = disposers.length - 1; index >= 0; index -= 1) {
    try {
      disposers[index]();
    } catch (error) {
      if (!hasError) {
        hasError = true;
        firstError = error;
      }
    }
  }

  if (hasError) {
    throw firstError;
  }
}

export function bindEditorEvents(
  canvas: InteractiveCanvasAdapter,
  scene: FabricCardScene,
  options: BindEditorEventsOptions,
): () => void {
  scene.disposeObjectListeners();

  const disposers: EventDisposer[] = [];

  try {
    disposers.push(
      bindAvatarEvents(canvas, scene.avatar, {
        avatarSource: options.avatarSource,
        frame: options.template.avatarFrame,
        onDocumentPatch: options.onDocumentPatch,
      }),
    );
    disposers.push(
      bindAvatarPinchEvents(canvas, scene.avatar, {
        target: options.pointerTarget,
        avatarSource: options.avatarSource,
        frame: options.template.avatarFrame,
        onDocumentPatch: options.onDocumentPatch,
      }),
    );
    disposers.push(
      bindTextEvents(canvas, scene.fields, {
        template: options.template,
        measureText: options.measureText,
        keyTarget: options.keyTarget,
        onDocumentPatch: options.onDocumentPatch,
        onFieldValidation: options.onFieldValidation,
        onEditCancel: options.onEditCancel,
      }),
    );
    disposers.push(
      bindSelectionEvents(canvas.raw, scene, {
        onSelectionChange: options.onSelectionChange,
      }),
    );
  } catch (registrationError) {
    try {
      disposeAll(disposers);
    } catch {
      // Preserve the registration error when rollback cleanup fails.
    }
    throw registrationError;
  }

  let disposed = false;
  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    disposeAll(disposers);
  };

  scene.disposeObjectListeners = dispose;
  return dispose;
}
