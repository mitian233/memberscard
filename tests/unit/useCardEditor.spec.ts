import { describe, expect, it } from "vitest";
import { isReadonly } from "vue";
import { useCardEditor } from "@/composables/useCardEditor";
import type {
  AvatarTransform,
  CardPatch,
  CardTemplateDefinition,
  FieldValidationError,
  ResourceStatus,
  TemplateId,
} from "@/types/card";

const avatar = (overrides: Partial<AvatarTransform> = {}): AvatarTransform => ({
  src: "/demo.png",
  left: -10,
  top: 20,
  scale: 0.5,
  ...overrides,
});

const field = (name: keyof CardTemplateDefinition["fields"]) => ({
  role: "field" as const,
  field: name,
  left: 0,
  top: 0,
  fontSize: 20,
  fontWeight: "normal" as const,
  fill: "#000",
});

const currentTemplate: CardTemplateDefinition = {
  id: "current",
  canvas: { width: 960, height: 640, radius: 40 },
  assets: { background: "/background.svg", logo: "/logo.svg" },
  defaults: {
    name: "Current Name",
    nameEn: "Current Name En",
    bandName: "Current Band",
    birthday: "9/15",
    avatar: avatar(),
  },
  avatarFrame: { left: 0, top: 0, width: 300, height: 300, radius: 0 },
  fields: {
    name: field("name"),
    nameEn: field("nameEn"),
    bandName: field("bandName"),
    birthday: field("birthday"),
  },
  staticObjects: [],
};

const legacyTemplate: CardTemplateDefinition = {
  id: "legacy",
  canvas: { width: 960, height: 640, radius: 40 },
  assets: { background: "/legacy-background.svg", logo: "/logo.svg" },
  defaults: {
    name: "Legacy Name",
    nameEn: "Legacy Name En",
    bandName: "Legacy Band",
    avatar: avatar({ left: -20, top: 40 }),
  },
  avatarFrame: { left: 0, top: 0, width: 300, height: 300, radius: 0 },
  fields: {
    name: field("name"),
    nameEn: field("nameEn"),
    bandName: field("bandName"),
  },
  staticObjects: [],
};

const templates: Readonly<Record<TemplateId, CardTemplateDefinition>> = {
  current: currentTemplate,
  legacy: legacyTemplate,
};

const createEditor = (initialTemplateId: TemplateId = "current") =>
  useCardEditor({ templates, initialTemplateId });

const settleEditor = (editor: ReturnType<typeof createEditor>): void => {
  expect(
    editor.handleCanvasSettled({
      revision: editor.canvasSyncRequest.value.revision,
      resourceStatus: { state: "ready" },
      fieldErrors: [],
    }),
  ).toBe(true);
};

describe("useCardEditor", () => {
  it("initializes defaults and an immediate replace sync request at revision one", () => {
    const editor = createEditor();

    expect(editor.template.value).toEqual(currentTemplate);
    expect(editor.document.value).toEqual({
      templateId: "current",
      name: "Current Name",
      nameEn: "Current Name En",
      bandName: "Current Band",
      birthday: "9/15",
      avatar: avatar(),
    });
    expect(editor.canvasSyncRequest.value).toMatchObject({
      revision: 1,
      kind: "replace",
      source: "system",
      document: editor.document.value,
      template: currentTemplate,
    });
    expect(editor.canvasSyncRequest.value.document).toBe(editor.document.value);
    expect(editor.pendingTemplateId.value).toBeNull();
    expect(editor.isDirty.value).toBe(false);
    expect(isReadonly(editor.template)).toBe(true);
    expect(isReadonly(editor.document)).toBe(true);
    expect(isReadonly(editor.canvasSyncRequest)).toBe(true);
    expect(isReadonly(editor.pendingTemplateId)).toBe(true);
  });

  it("throws before creating state when the initial template is absent", () => {
    expect(() =>
      useCardEditor({ templates, initialTemplateId: "missing" as TemplateId }),
    ).toThrowError(RangeError);
  });

  it("publishes inspector field patches with increasing revisions and preserves no-op identities", () => {
    const editor = createEditor();
    const firstDocument = editor.document.value;
    const firstRequest = editor.canvasSyncRequest.value;

    editor.updateField("name", "Edited Name");

    expect(editor.document.value).not.toBe(firstDocument);
    expect(editor.canvasSyncRequest.value).not.toBe(firstRequest);
    expect(editor.canvasSyncRequest.value).toMatchObject({
      revision: 2,
      kind: "patch",
      source: "inspector",
      document: editor.document.value,
      patch: { type: "field", field: "name", value: "Edited Name" },
    });
    const editedDocument = editor.document.value;
    const editedRequest = editor.canvasSyncRequest.value;

    editor.updateField("name", "Edited Name");

    expect(editor.document.value).toBe(editedDocument);
    expect(editor.canvasSyncRequest.value).toBe(editedRequest);
    expect(editor.canvasSyncRequest.value.revision).toBe(2);
  });

  it("clones avatar updates and publishes one exact inspector avatar patch", () => {
    const editor = createEditor();
    const supplied = avatar({ left: 12 });

    editor.updateAvatar(supplied);

    expect(editor.document.value.avatar).toEqual(supplied);
    expect(editor.document.value.avatar).not.toBe(supplied);
    expect(editor.canvasSyncRequest.value.patch).toEqual({
      type: "avatar",
      value: supplied,
    });
    expect(editor.canvasSyncRequest.value.patch).not.toBeUndefined();
    expect(
      (
        editor.canvasSyncRequest.value.patch as Extract<
          CardPatch,
          { type: "avatar" }
        >
      ).value,
    ).not.toBe(supplied);

    supplied.left = 999;
    expect(editor.document.value.avatar.left).toBe(12);
    expect(
      (
        editor.canvasSyncRequest.value.patch as Extract<
          CardPatch,
          { type: "avatar" }
        >
      ).value.left,
    ).toBe(12);

    const document = editor.document.value;
    const request = editor.canvasSyncRequest.value;
    editor.updateAvatar({ ...editor.document.value.avatar });
    expect(editor.document.value).toBe(document);
    expect(editor.canvasSyncRequest.value).toBe(request);
  });

  it("resets fields and avatar through inspector patches, and reset-all through a replace", () => {
    const editor = createEditor();
    editor.updateField("name", "Edited Name");
    editor.resetField("name");
    expect(editor.document.value.name).toBe("Current Name");
    expect(editor.canvasSyncRequest.value).toMatchObject({
      revision: 3,
      kind: "patch",
      source: "inspector",
      patch: { type: "field", field: "name", value: "Current Name" },
    });

    editor.updateAvatar(avatar({ left: 90 }));
    editor.resetAvatar();
    expect(editor.document.value.avatar).toEqual(avatar());
    expect(editor.canvasSyncRequest.value).toMatchObject({
      revision: 5,
      kind: "patch",
      source: "inspector",
      patch: { type: "avatar", value: avatar() },
    });

    editor.updateField("bandName", "Edited Band");
    editor.resetAll();
    expect(editor.document.value).toEqual({
      templateId: "current",
      name: "Current Name",
      nameEn: "Current Name En",
      bandName: "Current Band",
      birthday: "9/15",
      avatar: avatar(),
    });
    expect(editor.canvasSyncRequest.value).toMatchObject({
      revision: 7,
      kind: "replace",
      source: "system",
      document: editor.document.value,
    });
  });

  it("treats resetting a current value as a no-op", () => {
    const editor = createEditor();
    const document = editor.document.value;
    const request = editor.canvasSyncRequest.value;

    editor.resetField("name");
    editor.resetAvatar();
    editor.resetAll();

    expect(editor.document.value).toBe(document);
    expect(editor.canvasSyncRequest.value).toBe(request);
    expect(editor.canvasSyncRequest.value.revision).toBe(1);
  });

  it("applies valid canvas patches without echoing a sync request", () => {
    const editor = createEditor();
    const request = editor.canvasSyncRequest.value;
    const fieldPatch: CardPatch = {
      type: "field",
      field: "name",
      value: "Canvas Name",
    };

    editor.handleCanvasPatch(fieldPatch, "canvas");

    expect(editor.document.value.name).toBe("Canvas Name");
    expect(editor.canvasSyncRequest.value).toBe(request);
    expect(editor.canvasSyncRequest.value.revision).toBe(1);

    const avatarPatch: Extract<CardPatch, { type: "avatar" }> = {
      type: "avatar",
      value: avatar({ left: 22 }),
    };
    editor.handleCanvasPatch(avatarPatch, "canvas");
    expect(editor.document.value.avatar).toEqual(avatar({ left: 22 }));
    expect(editor.document.value.avatar).not.toBe(avatarPatch.value);
    avatarPatch.value.left = 1000;
    expect(editor.document.value.avatar.left).toBe(22);
    expect(editor.canvasSyncRequest.value).toBe(request);
  });

  it("rejects inactive fields without changing document or sync state", () => {
    const editor = createEditor("legacy");
    const document = editor.document.value;
    const request = editor.canvasSyncRequest.value;

    expect(() => editor.updateField("birthday", "1/1")).toThrowError(
      RangeError,
    );
    expect(() => editor.resetField("birthday")).toThrowError(RangeError);
    expect(() =>
      editor.handleCanvasPatch(
        { type: "field", field: "birthday", value: "1/1" },
        "canvas",
      ),
    ).toThrowError(RangeError);
    expect(editor.document.value).toBe(document);
    expect(editor.canvasSyncRequest.value).toBe(request);
    expect(editor.canvasSyncRequest.value.revision).toBe(1);
  });

  it("computes dirty state across every active field and avatar value", () => {
    const editor = createEditor();
    expect(editor.isDirty.value).toBe(false);

    editor.updateField("name", "Edited");
    expect(editor.isDirty.value).toBe(true);
    editor.resetField("name");
    expect(editor.isDirty.value).toBe(false);

    editor.updateField("nameEn", "Edited");
    expect(editor.isDirty.value).toBe(true);
    editor.resetField("nameEn");
    editor.updateField("bandName", "Edited");
    expect(editor.isDirty.value).toBe(true);
    editor.resetField("bandName");
    editor.updateField("birthday", "1/1");
    expect(editor.isDirty.value).toBe(true);
    editor.resetField("birthday");
    expect(editor.isDirty.value).toBe(false);

    for (const key of ["src", "left", "top", "scale"] as const) {
      const next = {
        ...editor.document.value.avatar,
        [key]: key === "src" ? "/other.png" : 99,
      };
      editor.updateAvatar(next);
      expect(editor.isDirty.value).toBe(true);
      editor.resetAvatar();
      expect(editor.isDirty.value).toBe(false);
    }
  });

  it("queues dirty template changes and supports cancel and confirm", () => {
    const editor = createEditor();
    editor.updateField("name", "Edited");
    const document = editor.document.value;
    const request = editor.canvasSyncRequest.value;

    expect(editor.requestTemplateChange("legacy")).toBe(
      "confirmation-required",
    );
    expect(editor.pendingTemplateId.value).toBe("legacy");
    expect(editor.document.value).toBe(document);
    expect(editor.canvasSyncRequest.value).toBe(request);

    expect(editor.requestTemplateChange("current")).toBe("unchanged");
    expect(editor.pendingTemplateId.value).toBe("legacy");
    expect(editor.document.value).toBe(document);
    editor.cancelTemplateChange();
    expect(editor.pendingTemplateId.value).toBeNull();

    editor.updateField("nameEn", "Edited too");
    expect(editor.requestTemplateChange("legacy")).toBe(
      "confirmation-required",
    );
    expect(editor.confirmTemplateChange()).toBe("legacy");
    expect(editor.template.value).toEqual(legacyTemplate);
    expect(editor.document.value).toEqual({
      templateId: "legacy",
      name: "Legacy Name",
      nameEn: "Legacy Name En",
      bandName: "Legacy Band",
      avatar: avatar({ left: -20, top: 40 }),
    });
    expect(editor.pendingTemplateId.value).toBeNull();
    expect(editor.isDirty.value).toBe(false);
    expect(editor.canvasSyncRequest.value).toMatchObject({
      revision: 4,
      kind: "replace",
      source: "system",
      template: legacyTemplate,
      document: editor.document.value,
    });
    const finalRequest = editor.canvasSyncRequest.value;
    expect(editor.confirmTemplateChange()).toBeNull();
    expect(editor.canvasSyncRequest.value).toBe(finalRequest);
  });

  it("changes templates immediately while clean and current-template requests are no-ops", () => {
    const editor = createEditor();
    const request = editor.canvasSyncRequest.value;
    expect(editor.requestTemplateChange("current")).toBe("unchanged");
    expect(editor.document.value.templateId).toBe("current");
    expect(editor.canvasSyncRequest.value).toBe(request);

    expect(editor.requestTemplateChange("legacy")).toBe("changed");
    expect(editor.template.value).toEqual(legacyTemplate);
    expect(editor.document.value.templateId).toBe("legacy");
    expect(editor.pendingTemplateId.value).toBeNull();
    expect(editor.isDirty.value).toBe(false);
    expect(editor.canvasSyncRequest.value).toMatchObject({
      revision: 2,
      kind: "replace",
      source: "system",
      template: legacyTemplate,
    });
  });

  it("rejects missing target templates before changing any state", () => {
    const editor = createEditor();
    editor.updateField("name", "Edited");
    const template = editor.template.value;
    const document = editor.document.value;
    const request = editor.canvasSyncRequest.value;
    const pending = editor.pendingTemplateId.value;

    expect(() =>
      editor.requestTemplateChange("missing" as TemplateId),
    ).toThrowError(RangeError);
    expect(editor.template.value).toBe(template);
    expect(editor.document.value).toBe(document);
    expect(editor.canvasSyncRequest.value).toBe(request);
    expect(editor.pendingTemplateId.value).toBe(pending);
  });

  it("initializes readiness, resource, validation, selection, and action state", () => {
    const editor = createEditor();

    expect(editor.status.value).toEqual({ state: "idle" });
    expect(editor.resourceStatus.value).toEqual({ state: "loading" });
    expect(editor.fieldErrors.value).toEqual({});
    expect(editor.selection.value).toEqual({ type: "none" });
    expect(editor.isCanvasSynced.value).toBe(false);
    expect(editor.isReady.value).toBe(false);
    expect(editor.isBusy.value).toBe(false);
    expect(editor.isExporting.value).toBe(false);
    expect(editor.canExport.value).toBe(false);
    expect(editor.canCopy.value).toBe(false);
    expect(editor.statusMessage.value).toBe("");
  });

  it("accepts only the current revision and clones settled resource and validation state", () => {
    const editor = createEditor();
    const firstError: FieldValidationError = {
      field: "name",
      code: "text-too-wide",
      message: "first",
    };
    const finalError: FieldValidationError = {
      field: "name",
      code: "text-too-wide",
      message: "last",
    };
    const degraded: Extract<ResourceStatus, { state: "degraded" }> = {
      state: "degraded",
      code: "font-fallback",
      message: "fallback",
    };

    expect(
      editor.handleCanvasSettled({
        revision: 0,
        resourceStatus: { state: "ready" },
        fieldErrors: [],
      }),
    ).toBe(false);
    expect(editor.resourceStatus.value).toEqual({ state: "loading" });
    expect(editor.isCanvasSynced.value).toBe(false);

    const payload = {
      revision: editor.canvasSyncRequest.value.revision,
      resourceStatus: degraded,
      fieldErrors: [firstError, finalError],
    } as const;
    expect(editor.handleCanvasSettled(payload)).toBe(true);
    expect(editor.resourceStatus.value).toEqual(degraded);
    expect(editor.resourceStatus.value).not.toBe(degraded);
    expect(editor.fieldErrors.value).toEqual({ name: finalError });
    expect(editor.fieldErrors.value.name).not.toBe(finalError);
    expect(editor.isCanvasSynced.value).toBe(true);
    expect(editor.isReady.value).toBe(true);

    degraded.message = "mutated";
    finalError.message = "mutated";
    expect(editor.resourceStatus.value).toEqual({
      state: "degraded",
      code: "font-fallback",
      message: "fallback",
    });
    expect(editor.fieldErrors.value.name?.message).toBe("last");

    editor.updateField("name", "next");
    const revision = editor.canvasSyncRequest.value.revision;
    expect(editor.isCanvasSynced.value).toBe(false);
    expect(editor.resourceStatus.value.state).toBe("degraded");
    expect(
      editor.handleCanvasSettled({
        revision: revision - 1,
        resourceStatus: { state: "ready" },
        fieldErrors: [],
      }),
    ).toBe(false);
    expect(
      editor.handleCanvasSettled({
        revision: revision + 1,
        resourceStatus: { state: "ready" },
        fieldErrors: [],
      }),
    ).toBe(false);
    expect(editor.isCanvasSynced.value).toBe(false);
    expect(
      editor.handleCanvasSettled({
        revision,
        resourceStatus: { state: "ready" },
        fieldErrors: [],
      }),
    ).toBe(true);
    expect(editor.fieldErrors.value).toEqual({});
    expect(editor.isCanvasSynced.value).toBe(true);
  });

  it("keeps the current revision unsynced after a cloned canvas resource failure", () => {
    const editor = createEditor();
    const error: Extract<ResourceStatus, { state: "error" }> = {
      state: "error",
      code: "background-load-failed",
      message: "background failed",
      recoverable: true,
    };

    expect(editor.handleCanvasFailure(0, error)).toBe(false);
    expect(editor.resourceStatus.value).toEqual({ state: "loading" });
    expect(
      editor.handleCanvasFailure(
        editor.canvasSyncRequest.value.revision,
        error,
      ),
    ).toBe(true);
    expect(editor.resourceStatus.value).toEqual(error);
    expect(editor.resourceStatus.value).not.toBe(error);
    expect(editor.isCanvasSynced.value).toBe(false);
    error.message = "changed";
    expect(editor.resourceStatus.value).toEqual({
      state: "error",
      code: "background-load-failed",
      message: "background failed",
      recoverable: true,
    });
  });

  it("validates field errors and selection without partial state changes", () => {
    const editor = createEditor();
    const error: FieldValidationError = {
      field: "name",
      code: "text-too-wide",
      message: "too wide",
    };

    editor.handleFieldValidation("name", error);
    expect(editor.fieldErrors.value).toEqual({ name: error });
    expect(editor.fieldErrors.value.name).not.toBe(error);
    error.message = "changed";
    expect(editor.fieldErrors.value.name?.message).toBe("too wide");

    const beforeMismatch = editor.fieldErrors.value;
    expect(() => editor.handleFieldValidation("nameEn", error)).toThrowError(
      RangeError,
    );
    expect(editor.fieldErrors.value).toBe(beforeMismatch);

    editor.handleFieldValidation("name", null);
    expect(editor.fieldErrors.value).toEqual({});

    const fieldSelection = { type: "field" as const, field: "name" as const };
    editor.handleSelectionChange(fieldSelection);
    expect(editor.selection.value).toEqual(fieldSelection);
    expect(editor.selection.value).not.toBe(fieldSelection);
    editor.handleSelectionChange({ type: "avatar" });
    expect(editor.selection.value).toEqual({ type: "avatar" });
    editor.handleSelectionChange({ type: "none" });
    expect(editor.selection.value).toEqual({ type: "none" });

    const legacy = createEditor("legacy");
    const beforeSelection = legacy.selection.value;
    expect(() =>
      legacy.handleSelectionChange({ type: "field", field: "birthday" }),
    ).toThrowError(RangeError);
    expect(legacy.selection.value).toBe(beforeSelection);
  });

  it("resets all system state on an effective system replace", () => {
    const editor = createEditor();
    settleEditor(editor);
    editor.handleFieldValidation("name", {
      field: "name",
      code: "text-too-wide",
      message: "too wide",
    });
    editor.handleSelectionChange({ type: "field", field: "name" });
    expect(editor.beginAction("export")).toBe(false);
    editor.updateField("name", "changed");
    settleEditor(editor);
    expect(editor.beginAction("export")).toBe(true);
    expect(editor.finishAction("export", "done")).toBe(true);

    editor.resetAll();
    expect(editor.resourceStatus.value).toEqual({ state: "loading" });
    expect(editor.fieldErrors.value).toEqual({});
    expect(editor.selection.value).toEqual({ type: "none" });
    expect(editor.status.value).toEqual({ state: "idle" });
    expect(editor.isCanvasSynced.value).toBe(false);
  });

  it("coordinates action capabilities, transitions, stale completions, and messages", () => {
    const editor = useCardEditor({
      templates,
      initialTemplateId: "current",
      clipboardAvailable: true,
    });
    settleEditor(editor);
    expect(editor.canExport.value).toBe(true);
    expect(editor.canCopy.value).toBe(true);

    expect(editor.beginAction("copy")).toBe(true);
    expect(editor.status.value).toEqual({ state: "working", action: "copy" });
    expect(editor.isBusy.value).toBe(true);
    expect(editor.isExporting.value).toBe(false);
    expect(editor.statusMessage.value).toBe("正在复制图片…");
    expect(editor.beginAction("export")).toBe(false);
    expect(editor.finishAction("export", "stale")).toBe(false);
    expect(editor.status.value).toEqual({ state: "working", action: "copy" });
    expect(editor.finishAction("copy", "copied")).toBe(true);
    expect(editor.status.value).toEqual({
      state: "success",
      action: "copy",
      message: "copied",
    });
    expect(editor.statusMessage.value).toBe("copied");

    expect(editor.beginAction("export")).toBe(true);
    expect(editor.isExporting.value).toBe(true);
    expect(editor.statusMessage.value).toBe("正在导出图片…");
    expect(editor.failAction("copy", "clipboard-failed", "stale")).toBe(false);
    expect(editor.failAction("export", "download-failed", "failed")).toBe(true);
    expect(editor.status.value).toEqual({
      state: "error",
      action: "export",
      code: "download-failed",
      message: "failed",
    });
    expect(editor.statusMessage.value).toBe("failed");
    expect(editor.isBusy.value).toBe(false);

    editor.handleFieldValidation("name", {
      field: "name",
      code: "text-too-wide",
      message: "too wide",
    });
    expect(editor.canExport.value).toBe(false);
    expect(editor.canCopy.value).toBe(false);
    expect(editor.beginAction("export")).toBe(false);
    expect(editor.status.value).toEqual({
      state: "error",
      action: "export",
      code: "download-failed",
      message: "failed",
    });

    editor.handleFieldValidation("name", null);
    expect(editor.canExport.value).toBe(true);
    editor.setClipboardAvailable(false);
    expect(editor.canCopy.value).toBe(false);
    expect(editor.status.value).toEqual({
      state: "error",
      action: "export",
      code: "download-failed",
      message: "failed",
    });
    editor.setClipboardAvailable(true);
    expect(editor.canCopy.value).toBe(true);
  });

  it("clears completed action status only for effective document changes", () => {
    const editor = createEditor();
    settleEditor(editor);
    expect(editor.beginAction("export")).toBe(true);
    expect(editor.finishAction("export", "done")).toBe(true);
    const sameDocument = editor.document.value;
    const sameRequest = editor.canvasSyncRequest.value;
    editor.updateField("name", sameDocument.name);
    expect(editor.document.value).toBe(sameDocument);
    expect(editor.canvasSyncRequest.value).toBe(sameRequest);
    expect(editor.status.value).toEqual({
      state: "success",
      action: "export",
      message: "done",
    });

    editor.updateField("name", "changed");
    expect(editor.status.value).toEqual({ state: "idle" });
    settleEditor(editor);
    expect(editor.beginAction("export")).toBe(true);
    expect(editor.finishAction("export", "done again")).toBe(true);
    editor.handleCanvasPatch(
      { type: "field", field: "name", value: "changed" },
      "canvas",
    );
    expect(editor.status.value).toEqual({
      state: "success",
      action: "export",
      message: "done again",
    });
    editor.handleCanvasPatch(
      { type: "field", field: "name", value: "canvas changed" },
      "canvas",
    );
    expect(editor.status.value).toEqual({ state: "idle" });
  });
});
