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
}

export interface UseCardEditorReturn {
  template: Readonly<ShallowRef<CardTemplateDefinition>>;
  document: Readonly<ShallowRef<CardDocument>>;
  canvasSyncRequest: Readonly<ShallowRef<CanvasSyncRequest>>;
  pendingTemplateId: Readonly<Ref<TemplateId | null>>;
  isDirty: ComputedRef<boolean>;
  updateField(field: CardField, value: string): void;
  updateAvatar(value: AvatarTransform): void;
  handleCanvasPatch(patch: CardPatch, source: "canvas"): void;
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
      return;
    }

    if (avatarsEqual(activeDocument.value.avatar, patch.value)) {
      return;
    }

    activeDocument.value = {
      ...activeDocument.value,
      avatar: cloneAvatar(patch.value),
    };
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
    isDirty,
    updateField,
    updateAvatar,
    handleCanvasPatch,
    resetField,
    resetAvatar,
    resetAll,
    requestTemplateChange,
    confirmTemplateChange,
    cancelTemplateChange,
  };
}
