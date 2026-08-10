import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, toRaw } from "vue";
import { currentCardTemplate } from "@/templates/currentCardTemplate";
import { legacyCardTemplate } from "@/templates/legacyCardTemplate";
import type { CardCanvasController } from "@/fabric/cardCanvasController";
import type { CanvasSettledPayload } from "@/composables/useCardEditor";
import type { UseCardExportWorkflowOptions } from "@/composables/useCardExportWorkflow";
import type {
  AvatarTransform,
  CardDocument,
  CardPatch,
  EditorSelection,
  FieldValidationError,
  ResourceStatus,
  TemplateId,
} from "@/types/card";
import { loadAvatarFile } from "@/editor/avatarUpload";
import CardEditorView from "@/views/CardEditorView.vue";

const workspaceStub = vi.hoisted(() => ({
  name: "CardEditorWorkspaceStub",
  props: {
    document: { type: Object, required: true },
    template: { type: Object, required: true },
    syncRequest: { type: Object, required: true },
    activeGroup: { type: String, required: true },
    fieldErrors: { type: Object, required: true },
    resourceStatus: { type: Object, required: true },
    uploadMessage: { type: String, required: true },
    dirty: { type: Boolean, required: true },
    busy: { type: Boolean, required: true },
    isExporting: { type: Boolean, required: true },
    canExport: { type: Boolean, required: true },
    canCopy: { type: Boolean, required: true },
    statusMessage: { type: String, required: true },
    copyUnavailableReason: { type: String, required: false },
    canvasController: { type: Object, required: false },
  },
  emits: [
    "update:activeGroup",
    "template-change",
    "reset-all",
    "canvas-ready",
    "resource-error",
    "canvas-change",
    "selection-change",
    "edit-cancel",
    "validation-error",
    "update-field",
    "update-avatar",
    "reset-field",
    "reset-avatar",
    "avatar-file",
    "copy",
    "export",
  ],
  template: "<div data-workspace-stub />",
}));

vi.mock("@/components/editor/CardEditorWorkspace.vue", () => ({
  default: workspaceStub,
}));

const source = readFileSync(
  resolve(process.cwd(), "src/views/CardEditorView.vue"),
  "utf8",
);
const wrappers: VueWrapper[] = [];

type ExportServiceSpies = {
  isPngClipboardAvailable: ReturnType<typeof vi.fn>;
  exportCardPng: ReturnType<typeof vi.fn>;
  copyCardPng: ReturnType<typeof vi.fn>;
  downloadCardPng: ReturnType<typeof vi.fn>;
};

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function createExportOptions(
  result: "copied" | "unsupported" | "denied" = "copied",
): { options: UseCardExportWorkflowOptions; spies: ExportServiceSpies } {
  const spies: ExportServiceSpies = {
    isPngClipboardAvailable: vi.fn(() => true),
    exportCardPng: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
    copyCardPng: vi.fn(async () => result),
    downloadCardPng: vi.fn(),
  };
  return {
    options: { services: spies },
    spies,
  };
}

function mountView(
  props: {
    initialTemplateId?: TemplateId;
    canvasController?: CardCanvasController;
    avatarLoader?: typeof loadAvatarFile;
    exportOptions?: UseCardExportWorkflowOptions;
  } = {},
): VueWrapper {
  const wrapper = mount(CardEditorView, {
    attachTo: document.body,
    props: {
      initialTemplateId: props.initialTemplateId ?? "current",
      ...(props.canvasController === undefined
        ? {}
        : { canvasController: props.canvasController }),
      ...(props.avatarLoader === undefined
        ? {}
        : { avatarLoader: props.avatarLoader }),
      ...(props.exportOptions === undefined
        ? {}
        : { exportOptions: props.exportOptions }),
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function workspace(wrapper: VueWrapper): VueWrapper {
  return wrapper.findComponent({ name: workspaceStub.name });
}

function currentWorkspaceDocument(wrapper: VueWrapper): CardDocument {
  return toRaw(workspace(wrapper).props("document")) as CardDocument;
}

function currentWorkspaceRequest(wrapper: VueWrapper): {
  revision: number;
  document: CardDocument;
} {
  const request = toRaw(workspace(wrapper).props("syncRequest")) as {
    revision: number;
    document: CardDocument;
  };
  return request;
}

async function settleCanvas(
  wrapper: VueWrapper,
  resourceStatus: Extract<ResourceStatus, { state: "ready" | "degraded" }> = {
    state: "ready",
  },
  fieldErrors: readonly FieldValidationError[] = [],
): Promise<void> {
  const payload: CanvasSettledPayload = {
    revision: currentWorkspaceRequest(wrapper).revision,
    resourceStatus,
    fieldErrors,
  };
  workspace(wrapper).vm.$emit("canvas-ready", payload);
  await nextTick();
}

afterEach(async () => {
  for (const wrapper of wrappers.splice(0)) {
    if (wrapper.exists()) {
      await wrapper.unmount();
    }
  }
});

describe("CardEditorView", () => {
  it("creates isolated current/legacy editor instances with exact workspace props", () => {
    const controller = Object.freeze({}) as CardCanvasController;
    const current = mountView({
      initialTemplateId: "current",
      canvasController: controller,
    });
    const legacy = mountView({ initialTemplateId: "legacy" });
    const currentChild = workspace(current);
    const legacyChild = workspace(legacy);

    expect(toRaw(currentChild.props("template"))).toBe(currentCardTemplate);
    expect(toRaw(legacyChild.props("template"))).toBe(legacyCardTemplate);
    expect(toRaw(currentChild.props("document"))).toBe(
      currentWorkspaceDocument(current),
    );
    expect(
      (toRaw(currentChild.props("syncRequest")) as { document: CardDocument })
        .document,
    ).toBe(toRaw(currentChild.props("document")));
    expect(toRaw(currentChild.props("canvasController"))).toBe(controller);
    expect(currentChild.props("activeGroup")).toBe("basic");
    expect(legacyChild.props("activeGroup")).toBe("basic");
    expect(toRaw(currentChild.props("document"))).not.toBe(
      toRaw(legacyChild.props("document")),
    );
  });

  it("wires editor, canvas, and validation events without duplicate edit-cancel patches", async () => {
    const wrapper = mountView();
    const child = workspace(wrapper);
    const initialRevision = currentWorkspaceRequest(wrapper).revision;
    const avatar: AvatarTransform = {
      src: "uploaded",
      left: 1,
      top: 2,
      scale: 0.5,
    };
    const patch: CardPatch = { type: "field", field: "name", value: "画布" };
    const selection: EditorSelection = { type: "field", field: "name" };
    const error: FieldValidationError = {
      field: "name",
      code: "text-too-wide",
      message: "过长",
    };
    const ready: CanvasSettledPayload = {
      revision: initialRevision,
      resourceStatus: { state: "ready" },
      fieldErrors: [error],
    };
    const resourceError: Extract<ResourceStatus, { state: "error" }> = {
      state: "error",
      code: "logo-load-failed",
      message: "Logo 失败",
      recoverable: true,
    };

    child.vm.$emit("update-field", "name", "编辑后");
    await nextTick();
    expect(currentWorkspaceDocument(wrapper).name).toBe("编辑后");
    child.vm.$emit("update-avatar", avatar);
    await nextTick();
    child.vm.$emit("canvas-change", patch, "canvas");
    child.vm.$emit("selection-change", selection);
    child.vm.$emit("validation-error", "name", error);
    child.vm.$emit("canvas-ready", {
      ...ready,
      revision: currentWorkspaceRequest(wrapper).revision,
    });
    await nextTick();
    expect(currentWorkspaceDocument(wrapper).name).toBe("画布");
    expect(currentWorkspaceDocument(wrapper).avatar).toEqual(avatar);
    expect(toRaw(child.props("fieldErrors"))).toEqual({ name: error });
    expect(child.props("resourceStatus")).toEqual({ state: "ready" });

    const revisionBeforeCancel = currentWorkspaceRequest(wrapper).revision;
    child.vm.$emit("edit-cancel", "name", "恢复名");
    await nextTick();
    expect(currentWorkspaceRequest(wrapper).revision).toBe(
      revisionBeforeCancel,
    );

    child.vm.$emit("resource-error", {
      revision: currentWorkspaceRequest(wrapper).revision,
      status: resourceError,
    });
    await nextTick();
    expect(child.props("resourceStatus")).toEqual(resourceError);

    child.vm.$emit("reset-field", "name");
    child.vm.$emit("reset-avatar");
    child.vm.$emit("reset-all");
    await nextTick();
    expect(child.props("activeGroup")).toBe("basic");

    const legacy = mountView({ initialTemplateId: "legacy" });
    expect(() =>
      workspace(legacy).vm.$emit("selection-change", {
        type: "field",
        field: "birthday",
      }),
    ).toThrow(/Field is not available/);
  });

  it("applies field, avatar, and reset operations with replace-on-write revisions", async () => {
    const wrapper = mountView();
    const child = workspace(wrapper);
    const initialDocument = structuredClone(currentWorkspaceDocument(wrapper));
    const initialRevision = currentWorkspaceRequest(wrapper).revision;

    child.vm.$emit("update-field", "name", "新的姓名");
    await nextTick();
    const fieldRevision = currentWorkspaceRequest(wrapper).revision;
    expect(fieldRevision).toBeGreaterThan(initialRevision);
    expect(currentWorkspaceDocument(wrapper).name).toBe("新的姓名");

    child.vm.$emit("reset-field", "name");
    await nextTick();
    const resetFieldRevision = currentWorkspaceRequest(wrapper).revision;
    expect(resetFieldRevision).toBeGreaterThan(fieldRevision);
    expect(currentWorkspaceDocument(wrapper).name).toBe(
      currentCardTemplate.defaults.name,
    );

    child.vm.$emit("update-avatar", {
      src: "changed",
      left: 1,
      top: 2,
      scale: 0.4,
    });
    await nextTick();
    const avatarRevision = currentWorkspaceRequest(wrapper).revision;
    expect(avatarRevision).toBeGreaterThan(resetFieldRevision);
    child.vm.$emit("reset-avatar");
    await nextTick();
    expect(currentWorkspaceRequest(wrapper).revision).toBeGreaterThan(
      avatarRevision,
    );
    expect(currentWorkspaceDocument(wrapper).avatar).toEqual(
      currentCardTemplate.defaults.avatar,
    );

    child.vm.$emit("update-field", "name", "再次修改");
    await nextTick();
    child.vm.$emit("reset-all");
    await nextTick();
    expect(currentWorkspaceDocument(wrapper)).toEqual(initialDocument);
    expect(currentWorkspaceRequest(wrapper).revision).toBeGreaterThan(
      avatarRevision,
    );
  });

  it("keeps clean and unchanged template switches immediate while resetting the group", async () => {
    const wrapper = mountView();
    const child = workspace(wrapper);
    const unchangedRevision = currentWorkspaceRequest(wrapper).revision;
    child.vm.$emit("template-change", "current");
    await nextTick();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(currentWorkspaceRequest(wrapper).revision).toBe(unchangedRevision);

    child.vm.$emit("update:activeGroup", "avatar");
    child.vm.$emit("template-change", "legacy");
    await nextTick();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(child.props("activeGroup")).toBe("basic");
    expect(toRaw(child.props("template"))).toBe(legacyCardTemplate);
    expect(currentWorkspaceDocument(wrapper).templateId).toBe("legacy");
  });

  it("confirms dirty template switches through the accessible dialog", async () => {
    const wrapper = mountView();
    const child = workspace(wrapper);
    child.vm.$emit("update-field", "name", "未保存");
    await nextTick();
    child.vm.$emit("update:activeGroup", "avatar");
    child.vm.$emit("template-change", "legacy");
    await nextTick();

    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.get("h2").text()).toBe("切换会员证模板？");
    expect(dialog.text()).toContain("当前修改将被重置。");
    expect(dialog.get(".template-dialog-cancel").text()).toBe("保留当前修改");
    expect(dialog.get(".template-dialog-confirm").text()).toBe("继续切换");

    await dialog.get(".template-dialog-cancel").trigger("click");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(toRaw(workspace(wrapper).props("template"))).toBe(
      currentCardTemplate,
    );
    expect(workspace(wrapper).props("activeGroup")).toBe("avatar");

    workspace(wrapper).vm.$emit("template-change", "legacy");
    await nextTick();
    await wrapper.get(".template-dialog-confirm").trigger("click");
    await nextTick();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(toRaw(workspace(wrapper).props("template"))).toBe(
      legacyCardTemplate,
    );
    expect(currentWorkspaceDocument(wrapper).templateId).toBe("legacy");
    expect(workspace(wrapper).props("activeGroup")).toBe("basic");
  });

  it("closes template confirmation from Escape/backdrop and can request it again", async () => {
    const wrapper = mountView();
    const child = workspace(wrapper);
    child.vm.$emit("update-field", "name", "未保存");
    await nextTick();
    child.vm.$emit("template-change", "legacy");
    await nextTick();

    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    wrapper.get('[role="dialog"]').element.dispatchEvent(escape);
    await nextTick();
    expect(escape.defaultPrevented).toBe(true);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(toRaw(child.props("template"))).toBe(currentCardTemplate);

    child.vm.$emit("template-change", "legacy");
    await nextTick();
    const backdrop = wrapper.get(".editor-dialog-backdrop").element;
    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    child.vm.$emit("template-change", "legacy");
    await nextTick();
    await wrapper.get(".template-dialog-confirm").trigger("click");
    await nextTick();
    expect(toRaw(child.props("template"))).toBe(legacyCardTemplate);
  });

  it("gates combined busy state around deferred avatar upload and preserves the document on failure", async () => {
    const success = createDeferred<AvatarTransform>();
    const loader = vi.fn(() => success.promise);
    const wrapper = mountView({ avatarLoader: loader });
    const child = workspace(wrapper);
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    child.vm.$emit("avatar-file", file);
    await nextTick();
    expect(loader).toHaveBeenCalledWith(file, currentCardTemplate.avatarFrame);
    expect(child.props("busy")).toBe(true);
    expect(child.props("canExport")).toBe(false);
    expect(child.props("canCopy")).toBe(false);
    success.resolve({ src: "uploaded", left: 2, top: 3, scale: 0.7 });
    await flushPromises();
    expect(child.props("busy")).toBe(false);
    expect(child.props("uploadMessage")).toBe("头像已更新。");
    expect(currentWorkspaceDocument(wrapper).avatar.src).toBe("uploaded");

    const failureLoader = vi.fn(async () => {
      throw new Error("decode");
    });
    const failed = mountView({ avatarLoader: failureLoader });
    const failedChild = workspace(failed);
    const failedBefore = structuredClone(currentWorkspaceDocument(failed));
    failedChild.vm.$emit("avatar-file", file);
    await flushPromises();
    expect(failedChild.props("uploadMessage")).toBe(
      "图片加载失败，请重新选择。",
    );
    expect(currentWorkspaceDocument(failed)).toEqual(failedBefore);
  });

  it("exposes ready capabilities and deferred copy/export working states", async () => {
    const { options, spies } = createExportOptions();
    const copyDeferred = createDeferred<Blob>();
    const saveDeferred = createDeferred<Blob>();
    spies.exportCardPng
      .mockImplementationOnce(() => copyDeferred.promise)
      .mockImplementationOnce(() => saveDeferred.promise);
    const wrapper = mountView({ exportOptions: options });
    await settleCanvas(wrapper);
    const child = workspace(wrapper);
    expect(child.props("busy")).toBe(false);
    expect(child.props("isExporting")).toBe(false);
    expect(child.props("canExport")).toBe(true);
    expect(child.props("canCopy")).toBe(true);

    child.vm.$emit("copy");
    await nextTick();
    expect(child.props("busy")).toBe(true);
    expect(child.props("isExporting")).toBe(false);
    expect(child.props("canExport")).toBe(false);
    expect(child.props("canCopy")).toBe(false);
    const copyBlob = new Blob(["copy"], { type: "image/png" });
    copyDeferred.resolve(copyBlob);
    await flushPromises();

    child.vm.$emit("export");
    await nextTick();
    expect(child.props("busy")).toBe(true);
    expect(child.props("isExporting")).toBe(true);
    expect(child.props("canExport")).toBe(false);
    expect(child.props("canCopy")).toBe(false);
    saveDeferred.resolve(new Blob(["save"], { type: "image/png" }));
    await flushPromises();
  });

  it("uses injected export and copy services with exact document/template snapshots", async () => {
    const { options, spies } = createExportOptions();
    const blob = new Blob(["png"], { type: "image/png" });
    spies.exportCardPng.mockResolvedValue(blob);
    const wrapper = mountView({ exportOptions: options });
    await settleCanvas(wrapper);
    const child = workspace(wrapper);
    const document = currentWorkspaceDocument(wrapper);
    const template = toRaw(child.props("template"));

    child.vm.$emit("copy");
    await flushPromises();
    expect(spies.exportCardPng).toHaveBeenCalledWith(document, template);
    expect(toRaw(spies.exportCardPng.mock.calls[0]?.[0])).toBe(document);
    expect(toRaw(spies.exportCardPng.mock.calls[0]?.[1])).toBe(template);
    expect(spies.copyCardPng).toHaveBeenCalledWith(blob);
    expect(child.props("statusMessage")).toBe("图片已复制。");

    child.vm.$emit("export");
    await flushPromises();
    expect(spies.exportCardPng).toHaveBeenCalledTimes(2);
    expect(toRaw(spies.exportCardPng.mock.calls[1]?.[0])).toBe(document);
    expect(toRaw(spies.exportCardPng.mock.calls[1]?.[1])).toBe(template);
    expect(spies.downloadCardPng).toHaveBeenCalledWith(
      blob,
      `members-card-${template.id}.png`,
    );
    expect(child.props("statusMessage")).toBe("PNG 已保存。");

    const denied = createExportOptions("denied");
    const deniedWrapper = mountView({ exportOptions: denied.options });
    await settleCanvas(deniedWrapper);
    workspace(deniedWrapper).vm.$emit("copy");
    await flushPromises();
    expect(workspace(deniedWrapper).props("statusMessage")).toBe(
      "无法复制图片，请使用“保存 PNG”。",
    );
    expect(workspace(deniedWrapper).props("copyUnavailableReason")).toBe(
      "无法复制图片，请使用“保存 PNG”。",
    );
  });

  it("keeps two mounted views isolated across field, group, upload, and export state", async () => {
    const uploadDeferred = createDeferred<AvatarTransform>();
    const loader = vi.fn(() => uploadDeferred.promise);
    const currentExport = createExportOptions();
    const legacyExport = createExportOptions();
    const current = mountView({
      avatarLoader: loader,
      exportOptions: currentExport.options,
    });
    const legacy = mountView({ exportOptions: legacyExport.options });
    const currentChild = workspace(current);
    const legacyChild = workspace(legacy);
    const legacyBefore = structuredClone(currentWorkspaceDocument(legacy));

    currentChild.vm.$emit("update-field", "name", "当前实例");
    await nextTick();
    currentChild.vm.$emit("update:activeGroup", "avatar");
    await nextTick();
    expect(currentWorkspaceDocument(current).name).toBe("当前实例");
    expect(currentChild.props("activeGroup")).toBe("avatar");
    expect(currentWorkspaceDocument(legacy)).toEqual(legacyBefore);
    expect(legacyChild.props("activeGroup")).toBe("basic");

    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    currentChild.vm.$emit("avatar-file", file);
    await nextTick();
    expect(currentChild.props("busy")).toBe(true);
    expect(legacyChild.props("busy")).toBe(false);
    uploadDeferred.resolve({
      src: "instance-avatar",
      left: 1,
      top: 2,
      scale: 0.5,
    });
    await flushPromises();
    await settleCanvas(current);

    const exportDeferred = createDeferred<Blob>();
    currentExport.spies.exportCardPng.mockImplementationOnce(
      () => exportDeferred.promise,
    );
    currentChild.vm.$emit("export");
    await nextTick();
    expect(currentChild.props("isExporting")).toBe(true);
    expect(legacyChild.props("isExporting")).toBe(false);
    exportDeferred.resolve(new Blob(["export"], { type: "image/png" }));
    await flushPromises();
  });

  it("does not mutate frozen dependencies and keeps dialog actions accessible without window.confirm", () => {
    const controller = Object.freeze({}) as CardCanvasController;
    const loader = Object.freeze(
      vi.fn(async () => ({ src: "avatar", left: 0, top: 0, scale: 1 })),
    ) as unknown as typeof loadAvatarFile;
    const exportOptions = createExportOptions();
    const frozenServices = Object.freeze({ ...exportOptions.options.services });
    const frozenOptions = Object.freeze({
      ...exportOptions.options,
      services: frozenServices,
    });
    const optionsDescriptors = Object.getOwnPropertyDescriptors(frozenOptions);
    const serviceDescriptors = Object.getOwnPropertyDescriptors(frozenServices);
    const wrapper = mountView({
      canvasController: controller,
      avatarLoader: loader,
      exportOptions: frozenOptions,
    });
    expect(() =>
      wrapper.getComponent({ name: workspaceStub.name }),
    ).not.toThrow();
    expect(toRaw(workspace(wrapper).props("canvasController"))).toBe(
      controller,
    );
    expect(Object.getOwnPropertyDescriptors(frozenOptions)).toEqual(
      optionsDescriptors,
    );
    expect(Object.getOwnPropertyDescriptors(frozenServices)).toEqual(
      serviceDescriptors,
    );
    expect(source).toMatch(
      /\.template-dialog-actions\s*:deep\(button\)\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/i,
    );
    expect(source).toMatch(
      /\.template-dialog-actions\s*:deep\(button:focus-visible\)\s*\{[^}]*outline:\s*(?!\s*none\b)\s*[^;}]+/i,
    );
    expect(source).not.toMatch(/window\.confirm|globalThis\.confirm/);
  });
});
