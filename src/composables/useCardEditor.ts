import {
  computed,
  readonly,
  shallowRef,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from "vue";
import {
  createCardDocument,
  resetAvatar as resetDocumentAvatar,
  resetCardDocument,
  resetCardField,
  updateCardField,
} from "@/editor/cardDocument";
import type {
  AvatarTransform,
  CardDocument,
  CardField,
  CardPatch,
  CardTemplateDefinition,
  EditorAction,
  EditorSelection,
  EditorStatus,
  ExportErrorCode,
  FieldValidationError,
  ResourceStatus,
  TemplateId,
} from "@/types/card";

export type CardTemplateRegistry = Readonly<
  Record<TemplateId, CardTemplateDefinition>
>;

export interface CanvasSyncRequest {
  revision: number;
  kind: "patch" | "replace";
  source: "inspector" | "system";
  document: CardDocument;
  template: CardTemplateDefinition;
  patch?: CardPatch;
}

export type TemplateChangeResult =
  "unchanged" | "changed" | "confirmation-required";

export interface UseCardEditorOptions {
  templates: CardTemplateRegistry;
  initialTemplateId: TemplateId;
  clipboardAvailable?: boolean;
}

export interface CanvasSettledPayload {
  revision: number;
  resourceStatus: Extract<ResourceStatus, { state: "ready" | "degraded" }>;
  fieldErrors: readonly FieldValidationError[];
}

export interface UseCardEditorReturn {
  template: Readonly<ShallowRef<CardTemplateDefinition>>;
  document: Readonly<ShallowRef<CardDocument>>;
  canvasSyncRequest: Readonly<ShallowRef<CanvasSyncRequest>>;
  pendingTemplateId: Readonly<Ref<TemplateId | null>>;
  status: Readonly<Ref<EditorStatus>>;
  resourceStatus: Readonly<Ref<ResourceStatus>>;
  fieldErrors: Readonly<
    Ref<Readonly<Partial<Record<CardField, FieldValidationError>>>>
  >;
  selection: Readonly<Ref<EditorSelection>>;
  isDirty: ComputedRef<boolean>;
  isCanvasSynced: ComputedRef<boolean>;
  isReady: ComputedRef<boolean>;
  isBusy: ComputedRef<boolean>;
  isExporting: ComputedRef<boolean>;
  canExport: ComputedRef<boolean>;
  canCopy: ComputedRef<boolean>;
  statusMessage: ComputedRef<string>;
  updateField(field: CardField, value: string): void;
  updateAvatar(value: AvatarTransform): void;
  handleCanvasPatch(patch: CardPatch, source: "canvas"): void;
  handleSelectionChange(selection: EditorSelection): void;
  handleFieldValidation(
    field: CardField,
    error: FieldValidationError | null,
  ): void;
  handleCanvasSettled(payload: CanvasSettledPayload): boolean;
  handleCanvasFailure(
    revision: number,
    status: Extract<ResourceStatus, { state: "error" }>,
  ): boolean;
  beginAction(action: EditorAction): boolean;
  finishAction(action: EditorAction, message: string): boolean;
  failAction(
    action: EditorAction,
    code: ExportErrorCode,
    message: string,
  ): boolean;
  setClipboardAvailable(available: boolean): void;
  resetField(field: CardField): void;
  resetAvatar(): void;
  resetAll(): void;
  requestTemplateChange(id: TemplateId): TemplateChangeResult;
  confirmTemplateChange(): TemplateId | null;
  cancelTemplateChange(): void;
}

const CARD_FIELDS: readonly CardField[] = [
  "name",
  "nameEn",
  "bandName",
  "birthday",
];

function cloneAvatar(value: AvatarTransform): AvatarTransform {
  return { ...value };
}

function clonePatch(patch: CardPatch): CardPatch {
  if (patch.type === "avatar") {
    return { type: "avatar", value: cloneAvatar(patch.value) };
  }

  return { ...patch };
}

function cloneSelection(selection: EditorSelection): EditorSelection {
  if (selection.type === "field") {
    return { type: "field", field: selection.field };
  }

  return { type: selection.type };
}

function cloneFieldValidationError(
  error: FieldValidationError,
): FieldValidationError {
  return { ...error };
}

function cloneResourceStatus(status: ResourceStatus): ResourceStatus {
  switch (status.state) {
    case "loading":
      return { state: "loading" };
    case "ready":
      return { state: "ready" };
    case "degraded":
      return { ...status };
    case "error":
      return { ...status };
  }
}

function avatarsEqual(
  first: AvatarTransform,
  second: AvatarTransform,
): boolean {
  return (
    first.src === second.src &&
    first.left === second.left &&
    first.top === second.top &&
    first.scale === second.scale
  );
}

function documentsEqual(first: CardDocument, second: CardDocument): boolean {
  return (
    first.templateId === second.templateId &&
    CARD_FIELDS.every((field) => first[field] === second[field]) &&
    avatarsEqual(first.avatar, second.avatar)
  );
}

export function useCardEditor(
  options: UseCardEditorOptions,
): UseCardEditorReturn {
  const initialTemplate = options.templates[options.initialTemplateId];
  if (initialTemplate === undefined) {
    throw new RangeError(`Unknown card template: ${options.initialTemplateId}`);
  }

  const activeTemplate = shallowRef<CardTemplateDefinition>(initialTemplate);
  const activeDocument = shallowRef<CardDocument>(
    createCardDocument(initialTemplate),
  );
  const syncRequest = shallowRef<CanvasSyncRequest>({
    revision: 1,
    kind: "replace",
    source: "system",
    document: activeDocument.value,
    template: activeTemplate.value,
  });
  const pendingTemplate = shallowRef<TemplateId | null>(null);
  const editorStatus = shallowRef<EditorStatus>({ state: "idle" });
  const currentResourceStatus = shallowRef<ResourceStatus>({
    state: "loading",
  });
  const currentFieldErrors = shallowRef<
    Readonly<Partial<Record<CardField, FieldValidationError>>>
  >({});
  const currentSelection = shallowRef<EditorSelection>({ type: "none" });
  const settledRevision = shallowRef(0);
  const clipboardAvailable = shallowRef(options.clipboardAvailable ?? false);

  const assertActiveField = (field: CardField): void => {
    if (activeTemplate.value.fields[field] === undefined) {
      throw new RangeError(`Field is not available in template: ${field}`);
    }
  };

  const getTemplate = (id: TemplateId): CardTemplateDefinition => {
    const template = options.templates[id];
    if (template === undefined) {
      throw new RangeError(`Unknown card template: ${id}`);
    }
    return template;
  };

  const clearCompletedStatus = (): void => {
    if (
      editorStatus.value.state === "success" ||
      editorStatus.value.state === "error"
    ) {
      editorStatus.value = { state: "idle" };
    }
  };

  const resetSystemState = (): void => {
    editorStatus.value = { state: "idle" };
    currentResourceStatus.value = { state: "loading" };
    currentFieldErrors.value = {};
    currentSelection.value = { type: "none" };
  };

  const publishInspectorPatch = (
    document: CardDocument,
    patch: CardPatch,
  ): void => {
    syncRequest.value = {
      revision: syncRequest.value.revision + 1,
      kind: "patch",
      source: "inspector",
      document,
      template: activeTemplate.value,
      patch: clonePatch(patch),
    };
    clearCompletedStatus();
  };

  const publishSystemReplace = (
    template: CardTemplateDefinition,
    document: CardDocument,
  ): void => {
    syncRequest.value = {
      revision: syncRequest.value.revision + 1,
      kind: "replace",
      source: "system",
      document,
      template,
    };
    resetSystemState();
  };

  const isDirty = computed(() => {
    const template = activeTemplate.value;
    const document = activeDocument.value;
    const defaults = createCardDocument(template);

    for (const field of CARD_FIELDS) {
      if (
        template.fields[field] !== undefined &&
        document[field] !== defaults[field]
      ) {
        return true;
      }
    }

    return !avatarsEqual(document.avatar, defaults.avatar);
  });

  const isCanvasSynced = computed(() => {
    const resourceState = currentResourceStatus.value.state;
    return (
      settledRevision.value === syncRequest.value.revision &&
      (resourceState === "ready" || resourceState === "degraded")
    );
  });

  const isReady = computed(() => isCanvasSynced.value);

  const isBusy = computed(() => editorStatus.value.state === "working");

  const isExporting = computed(
    () =>
      editorStatus.value.state === "working" &&
      editorStatus.value.action === "export",
  );

  const canExport = computed(
    () =>
      isReady.value &&
      Object.keys(currentFieldErrors.value).length === 0 &&
      !isBusy.value,
  );

  const canCopy = computed(() => canExport.value && clipboardAvailable.value);

  const statusMessage = computed(() => {
    const status = editorStatus.value;
    if (status.state === "idle") {
      return "";
    }
    if (status.state === "working") {
      return status.action === "copy" ? "正在复制图片…" : "正在导出图片…";
    }
    return status.message;
  });

  const updateField = (field: CardField, value: string): void => {
    assertActiveField(field);
    if (activeDocument.value[field] === value) {
      return;
    }

    const document = updateCardField(activeDocument.value, field, value);
    activeDocument.value = document;
    publishInspectorPatch(document, { type: "field", field, value });
  };

  const updateAvatar = (value: AvatarTransform): void => {
    if (avatarsEqual(activeDocument.value.avatar, value)) {
      return;
    }

    const document: CardDocument = {
      ...activeDocument.value,
      avatar: cloneAvatar(value),
    };
    activeDocument.value = document;
    publishInspectorPatch(document, {
      type: "avatar",
      value: cloneAvatar(value),
    });
  };

  const handleCanvasPatch = (patch: CardPatch, source: "canvas"): void => {
    void source;
    if (patch.type === "field") {
      assertActiveField(patch.field);
      if (activeDocument.value[patch.field] === patch.value) {
        return;
      }
      activeDocument.value = updateCardField(
        activeDocument.value,
        patch.field,
        patch.value,
      );
      clearCompletedStatus();
      return;
    }

    if (avatarsEqual(activeDocument.value.avatar, patch.value)) {
      return;
    }

    activeDocument.value = {
      ...activeDocument.value,
      avatar: cloneAvatar(patch.value),
    };
    clearCompletedStatus();
  };

  const handleSelectionChange = (selection: EditorSelection): void => {
    if (selection.type === "field") {
      assertActiveField(selection.field);
    }

    currentSelection.value = cloneSelection(selection);
  };

  const handleFieldValidation = (
    field: CardField,
    error: FieldValidationError | null,
  ): void => {
    if (error !== null && error.field !== field) {
      throw new RangeError(
        `Validation error field does not match target field: ${field}`,
      );
    }

    const nextErrors: Partial<Record<CardField, FieldValidationError>> = {
      ...currentFieldErrors.value,
    };
    if (error === null) {
      delete nextErrors[field];
    } else {
      nextErrors[field] = cloneFieldValidationError(error);
    }
    currentFieldErrors.value = nextErrors;
  };

  const handleCanvasSettled = (payload: CanvasSettledPayload): boolean => {
    if (payload.revision !== syncRequest.value.revision) {
      return false;
    }

    const nextErrors: Partial<Record<CardField, FieldValidationError>> = {};
    for (const error of payload.fieldErrors) {
      nextErrors[error.field] = cloneFieldValidationError(error);
    }
    currentFieldErrors.value = nextErrors;
    currentResourceStatus.value = cloneResourceStatus(payload.resourceStatus);
    settledRevision.value = payload.revision;
    return true;
  };

  const handleCanvasFailure = (
    revision: number,
    status: Extract<ResourceStatus, { state: "error" }>,
  ): boolean => {
    if (revision !== syncRequest.value.revision) {
      return false;
    }

    currentResourceStatus.value = cloneResourceStatus(status);
    return true;
  };

  const beginAction = (action: EditorAction): boolean => {
    if (action === "export" ? !canExport.value : !canCopy.value) {
      return false;
    }

    editorStatus.value = { state: "working", action };
    return true;
  };

  const finishAction = (action: EditorAction, message: string): boolean => {
    if (
      editorStatus.value.state !== "working" ||
      editorStatus.value.action !== action
    ) {
      return false;
    }

    editorStatus.value = { state: "success", action, message };
    return true;
  };

  const failAction = (
    action: EditorAction,
    code: ExportErrorCode,
    message: string,
  ): boolean => {
    if (
      editorStatus.value.state !== "working" ||
      editorStatus.value.action !== action
    ) {
      return false;
    }

    editorStatus.value = { state: "error", action, code, message };
    return true;
  };

  const setClipboardAvailable = (available: boolean): void => {
    clipboardAvailable.value = available;
  };

  const resetField = (field: CardField): void => {
    assertActiveField(field);
    const defaultValue = activeTemplate.value.defaults[field];
    if (activeDocument.value[field] === defaultValue) {
      return;
    }

    const document = resetCardField(
      activeDocument.value,
      activeTemplate.value,
      field,
    );
    activeDocument.value = document;
    publishInspectorPatch(document, {
      type: "field",
      field,
      value: defaultValue ?? "",
    });
  };

  const resetAvatar = (): void => {
    const document = resetDocumentAvatar(
      activeDocument.value,
      activeTemplate.value,
    );
    if (avatarsEqual(activeDocument.value.avatar, document.avatar)) {
      return;
    }

    activeDocument.value = document;
    publishInspectorPatch(document, {
      type: "avatar",
      value: cloneAvatar(document.avatar),
    });
  };

  const resetAll = (): void => {
    const document = resetCardDocument(activeTemplate.value);
    if (documentsEqual(activeDocument.value, document)) {
      return;
    }

    activeDocument.value = document;
    publishSystemReplace(activeTemplate.value, document);
  };

  const requestTemplateChange = (id: TemplateId): TemplateChangeResult => {
    const targetTemplate = getTemplate(id);
    if (targetTemplate.id === activeTemplate.value.id) {
      return "unchanged";
    }

    if (isDirty.value) {
      pendingTemplate.value = id;
      return "confirmation-required";
    }

    const document = createCardDocument(targetTemplate);
    activeTemplate.value = targetTemplate;
    activeDocument.value = document;
    pendingTemplate.value = null;
    publishSystemReplace(targetTemplate, document);
    return "changed";
  };

  const confirmTemplateChange = (): TemplateId | null => {
    const pending = pendingTemplate.value;
    if (pending === null) {
      return null;
    }

    const targetTemplate = getTemplate(pending);
    const document = createCardDocument(targetTemplate);
    activeTemplate.value = targetTemplate;
    activeDocument.value = document;
    pendingTemplate.value = null;
    publishSystemReplace(targetTemplate, document);
    return pending;
  };

  const cancelTemplateChange = (): void => {
    pendingTemplate.value = null;
  };

  return {
    template: readonly(activeTemplate) as unknown as Readonly<
      ShallowRef<CardTemplateDefinition>
    >,
    document: readonly(activeDocument),
    canvasSyncRequest: readonly(syncRequest) as unknown as Readonly<
      ShallowRef<CanvasSyncRequest>
    >,
    pendingTemplateId: readonly(pendingTemplate),
    status: readonly(editorStatus),
    resourceStatus: readonly(currentResourceStatus),
    fieldErrors: readonly(currentFieldErrors),
    selection: readonly(currentSelection),
    isDirty,
    isCanvasSynced,
    isReady,
    isBusy,
    isExporting,
    canExport,
    canCopy,
    statusMessage,
    updateField,
    updateAvatar,
    handleCanvasPatch,
    handleSelectionChange,
    handleFieldValidation,
    handleCanvasSettled,
    handleCanvasFailure,
    beginAction,
    finishAction,
    failAction,
    setClipboardAvailable,
    resetField,
    resetAvatar,
    resetAll,
    requestTemplateChange,
    confirmTemplateChange,
    cancelTemplateChange,
  };
}
