import type {
  CanvasSettledPayload,
  CanvasSyncRequest,
} from "@/composables/useCardEditor";
import type {
  CardDocument,
  CardField,
  CardPatch,
  CardTemplateDefinition,
  EditorSelection,
  FieldValidationError,
  ResourceStatus,
} from "@/types/card";

import type { CardCanvasController } from "./cardCanvasController";
import type { BindEditorEventsOptions } from "./bindEditorEvents";
import type { FabricCardScene, InteractiveCanvasAdapter } from "./types";

export interface CardCanvasSessionCallbacks {
  interactionEnabled(): boolean;
  onSettled(payload: CanvasSettledPayload): void;
  onResourceError(payload: {
    revision: number;
    status: Extract<ResourceStatus, { state: "error" }>;
  }): void;
  onDocumentPatch(patch: CardPatch, source: "canvas"): void;
  onSelectionChange(selection: EditorSelection): void;
  onFieldValidation(field: CardField, error: FieldValidationError | null): void;
  onEditCancel(field: CardField, restoredValue: string): void;
}

export interface CreateCardCanvasSessionOptions {
  canvas: InteractiveCanvasAdapter;
  controller: CardCanvasController;
  pointerTarget: HTMLElement;
  keyTarget?: EventTarget;
  callbacks: CardCanvasSessionCallbacks;
}

export interface CardCanvasSession {
  submit(request: CanvasSyncRequest): Promise<void>;
  dispose(): Promise<void>;
}

type SettledResourceStatus = Extract<
  ResourceStatus,
  { state: "ready" | "degraded" }
>;

interface BindingToken {
  readonly scene: FabricCardScene;
  revision: number;
  readonly generation: number;
}

function cloneFieldErrors(
  errors: readonly FieldValidationError[],
): FieldValidationError[] {
  return errors.map((error) => ({ ...error }));
}

function isSettledResourceStatus(
  status: ResourceStatus,
): status is SettledResourceStatus {
  return status.state === "ready" || status.state === "degraded";
}

function validateRequest(request: CanvasSyncRequest): void {
  if (!Number.isInteger(request.revision) || request.revision <= 0) {
    throw new RangeError("Canvas revision must be a positive integer");
  }

  if (request.kind === "patch" && request.patch === undefined) {
    throw new RangeError("Patch requests require a patch");
  }

  if (request.kind === "replace" && request.patch !== undefined) {
    throw new RangeError("Replace requests must not include a patch");
  }
}

function documentAvatarSource(document: CardDocument): string {
  return document.avatar.src;
}

export function createCardCanvasSession(
  options: CreateCardCanvasSessionOptions,
): CardCanvasSession {
  let disposed = false;
  let highestRequestedRevision = 0;
  let renderedRevision = 0;
  let activeScene: FabricCardScene | undefined;
  let sceneBound = false;
  let liveDocument: CardDocument | undefined;
  let liveTemplate: CardTemplateDefinition | undefined;
  let bindingGeneration = 0;
  let activeBinding: BindingToken | undefined;
  let queueTail: Promise<void> = Promise.resolve();
  let disposalPromise: Promise<void> | undefined;

  const isCurrent = (revision: number): boolean =>
    !disposed && revision === highestRequestedRevision;

  const safeNotify = (notify: () => void): void => {
    try {
      notify();
    } catch {
      // External notification handlers must not poison the session queue.
    }
  };

  const interactionEnabled = (): boolean => {
    try {
      return options.callbacks.interactionEnabled();
    } catch {
      return false;
    }
  };

  const classifyFailure = (
    request: CanvasSyncRequest,
    error: unknown,
  ): void => {
    if (!isCurrent(request.revision)) return;

    const status = options.controller.classifyResourceError(
      error,
      request.document,
      request.template,
    );
    safeNotify(() => {
      options.callbacks.onResourceError({
        revision: request.revision,
        status,
      });
    });
  };

  const emitSettled = (revision: number, scene: FabricCardScene): void => {
    const resourceStatus = scene.resourceStatus;
    if (!isSettledResourceStatus(resourceStatus)) {
      return;
    }

    safeNotify(() => {
      options.callbacks.onSettled({
        revision,
        resourceStatus,
        fieldErrors: cloneFieldErrors(scene.fieldErrors),
      });
    });
  };

  const canEmitBindingEvent = (binding: BindingToken): boolean =>
    !disposed &&
    sceneBound &&
    activeBinding === binding &&
    binding.generation === bindingGeneration &&
    activeScene === binding.scene &&
    binding.revision === renderedRevision &&
    binding.revision === highestRequestedRevision;

  const bindOptions = (
    request: CanvasSyncRequest,
    binding: BindingToken,
  ): BindEditorEventsOptions => ({
    template: request.template,
    measureText: options.controller.measureText,
    pointerTarget: options.pointerTarget,
    keyTarget: options.keyTarget,
    avatarSource: () => documentAvatarSource(liveDocument ?? request.document),
    onDocumentPatch: (patch, source) => {
      if (source !== "canvas" || !canEmitBindingEvent(binding)) return;
      if (!interactionEnabled()) return;
      safeNotify(() => options.callbacks.onDocumentPatch(patch, "canvas"));
    },
    onSelectionChange: (selection) => {
      if (!canEmitBindingEvent(binding)) return;
      if (!interactionEnabled()) return;
      safeNotify(() => options.callbacks.onSelectionChange(selection));
    },
    onFieldValidation: (field, error) => {
      if (!canEmitBindingEvent(binding)) return;
      if (!interactionEnabled()) return;
      safeNotify(() => options.callbacks.onFieldValidation(field, error));
    },
    onEditCancel: (field, restoredValue) => {
      if (!canEmitBindingEvent(binding)) return;
      if (!interactionEnabled()) return;
      safeNotify(() => options.callbacks.onEditCancel(field, restoredValue));
    },
  });

  const renderAndBind = async (request: CanvasSyncRequest): Promise<void> => {
    let scene: FabricCardScene;
    try {
      scene = await options.controller.render(
        options.canvas,
        request.document,
        request.template,
      );
    } catch (error) {
      classifyFailure(request, error);
      return;
    }

    activeScene = scene;
    sceneBound = false;

    if (!isCurrent(request.revision)) return;

    const binding: BindingToken = {
      scene,
      revision: request.revision,
      generation: bindingGeneration + 1,
    };

    try {
      options.controller.bind(
        options.canvas,
        scene,
        bindOptions(request, binding),
      );
    } catch (error) {
      sceneBound = false;
      classifyFailure(request, error);
      return;
    }

    if (!isCurrent(request.revision)) {
      sceneBound = false;
      return;
    }

    sceneBound = true;
    bindingGeneration = binding.generation;
    activeBinding = binding;
    liveDocument = request.document;
    liveTemplate = request.template;
    renderedRevision = request.revision;
    emitSettled(request.revision, scene);
  };

  const requiresFullRender = (request: CanvasSyncRequest): boolean =>
    !sceneBound ||
    activeScene === undefined ||
    liveDocument === undefined ||
    liveTemplate === undefined ||
    request.kind === "replace" ||
    request.template.id !== liveTemplate.id ||
    request.revision !== renderedRevision + 1;

  const replaceFieldError = (
    scene: FabricCardScene,
    field: CardField,
    error: FieldValidationError | null,
  ): void => {
    const nextErrors = scene.fieldErrors.filter(
      (fieldError) => fieldError.field !== field,
    );
    if (error !== null) nextErrors.push(error);
    scene.fieldErrors = nextErrors;
  };

  const applyPatch = async (request: CanvasSyncRequest): Promise<void> => {
    const scene = activeScene;
    const currentDocument = liveDocument;
    const template = liveTemplate;
    const patch = request.patch;
    if (
      scene === undefined ||
      currentDocument === undefined ||
      template === undefined
    ) {
      await renderAndBind(request);
      return;
    }
    if (patch === undefined) return;

    let result: ReturnType<CardCanvasController["applyPatch"]>;
    try {
      result = options.controller.applyPatch(options.canvas, scene, patch, {
        currentDocument,
        template,
        measureText: options.controller.measureText,
      });
    } catch (error) {
      classifyFailure(request, error);
      return;
    }

    if (result.kind === "requires-render") {
      if (!isCurrent(request.revision)) return;
      await renderAndBind(request);
      return;
    }

    if (!isCurrent(request.revision)) return;

    const appliedField = result.field;
    if (appliedField !== null) {
      replaceFieldError(scene, appliedField, result.error);
    }

    liveDocument = request.document;
    renderedRevision = request.revision;
    if (activeBinding?.scene === scene) {
      activeBinding.revision = request.revision;
    }

    if (appliedField !== null) {
      safeNotify(() =>
        options.callbacks.onFieldValidation(appliedField, result.error),
      );
    }
    if (!isCurrent(request.revision)) return;
    emitSettled(request.revision, scene);
  };

  const processRequest = async (request: CanvasSyncRequest): Promise<void> => {
    if (!isCurrent(request.revision)) return;

    if (requiresFullRender(request)) {
      await renderAndBind(request);
      return;
    }

    await applyPatch(request);
  };

  const submit = (request: CanvasSyncRequest): Promise<void> => {
    if (disposed) return Promise.resolve();

    try {
      validateRequest(request);
    } catch (error) {
      return Promise.reject(error);
    }
    if (request.revision <= highestRequestedRevision) {
      return Promise.resolve();
    }

    highestRequestedRevision = request.revision;
    const task = queueTail.then(() => processRequest(request));
    queueTail = task.catch(() => undefined);
    return task;
  };

  const dispose = (): Promise<void> => {
    if (disposalPromise !== undefined) return disposalPromise;

    disposed = true;
    disposalPromise = queueTail.then(async () => {
      let firstError: unknown;
      let hasError = false;

      try {
        activeScene?.disposeObjectListeners();
      } catch (error) {
        firstError = error;
        hasError = true;
      }

      try {
        await options.canvas.dispose();
      } catch (error) {
        if (!hasError) {
          firstError = error;
          hasError = true;
        }
      }

      if (hasError) throw firstError;
    });
    return disposalPromise;
  };

  return { submit, dispose };
}
